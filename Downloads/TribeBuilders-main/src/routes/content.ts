// src/routes/content.ts
import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import pool from '../Config/connection';
import aiContentService, { ContentGenerationParams, PersonaData } from '../services/aiService';
import templateService, { CreateTemplateRequest } from '../services/templateService';
import crypto from 'crypto';
import authenticateToken from '../middleware/authenticateToken';

const router = Router();

/**
 * Helpers
 */
function generateErrorId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.createHash('sha1').update(String(Date.now())).digest('hex');
}

function safeParseInt(value: any, fallback = 0) {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isNaN(n) ? fallback : n;
}

interface AuthRequest extends Request {
  user?: { userId?: string; [k: string]: any };
}


/**
 * Validation schemas
 */
const contentGenerationSchema = Joi.object({
  content_type: Joi.string().valid('announcement', 'release', 'news', 'social_post', 'story').required(),
  context: Joi.string().max(500).optional(),
  max_length: Joi.number().min(50).max(500).optional(),
  variations: Joi.number().min(1).max(5).optional(),
  template_id: Joi.string().optional(),
  use_openai: Joi.boolean().optional().default(false)
});

const templateSchema = Joi.object({
  template_name: Joi.string().min(1).max(255).required(),
  template_type: Joi.string().required(),
  template_content: Joi.string().min(1).required(),
  variables: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    type: Joi.string().valid('text', 'number', 'date', 'boolean', 'select').required(),
    required: Joi.boolean().required(),
    default_value: Joi.any().optional(),
    options: Joi.array().items(Joi.string()).optional(),
    description: Joi.string().optional()
  })).required(),
  description: Joi.string().optional()
});

const processTemplateSchema = Joi.object({
  template_id: Joi.string().required(),
  variables: Joi.object().required()
});

/**
 * Utility: minimal safe response wrapper for server errors.
 * Logs full error server-side with an errorId, returns generic message to client.
 */
function handleServerError(res: Response, contextMessage: string, error: unknown) {
  const errorId = generateErrorId();
  console.error(`[${errorId}] ${contextMessage}`, error);
  return res.status(500).json({
    error: 'Internal server error',
    errorId
  });
}

/**
 * Refactored function to get artist persona data to avoid code duplication
 */
async function getArtistPersona(userId: string): Promise<PersonaData | null> {
  const personaQuery = `
    SELECT 
      p.*,
      a.artist_name,
      a.id AS artist_id,
      COALESCE(
        json_agg(
          json_build_object(
            'question_key', pq.question_key,
            'question_text', pq.question_text,
            'answer_text', pq.answer_text,
            'answer_type', pq.answer_type
          )
        ) FILTER (WHERE pq.id IS NOT NULL), 
        '[]'
      ) as questionnaire_responses
    FROM artists a
    LEFT JOIN artist_personas p ON a.id = p.artist_id AND p.is_active = true
    LEFT JOIN persona_questionnaires pq ON p.id = pq.persona_id
    WHERE a.user_id = $1
    GROUP BY p.id, a.artist_name, a.id;
  `;
  const personaResult = await pool.query(personaQuery, [userId]);
  return personaResult.rows.length > 0 && personaResult.rows[0].id ? personaResult.rows[0] : null;
}

/**
 * POST /api/content/generate
 * - Validate request
 * - Load persona (explicit aliasing)
 * - Build generation params
 * - Call AI service
 * - Save generated content (batched)
 */
router.post('/generate', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { error, value } = contentGenerationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details && error.details[0] ? error.details[0].message : error.message
      });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { content_type, context, max_length, variations, template_id, use_openai } = value as any;

    const personaData = await getArtistPersona(userId);
    
    if (!personaData || !personaData.id) {
      return res.status(404).json({ error: 'Artist persona not found. Please create a persona first.' });
    }

    // Map to expected PersonaData shape (keep required fields)
    const personaForService: PersonaData = {
      id: personaData.id,
      artist_id: personaData.artist_id,
      persona_name: personaData.persona_name,
      tone: personaData.tone,
      key_themes: personaData.key_themes,
      target_audience: personaData.target_audience,
      voice_characteristics: personaData.voice_characteristics,
      questionnaire_responses: personaData.questionnaire_responses
    } as any;

    // Build generation params
    const generationParams: ContentGenerationParams = {
      persona: personaForService,
      content_type,
      context,
      max_length,
      variations
    };

    if (template_id) {
      try {
        const template = await templateService.getTemplateById(template_id);
        if (template) generationParams.template = template;
      } catch (err) {
        // Non fatal; log and continue without template
        console.warn('Failed to load template for generation', { template_id, err });
      }
    }

    // Call appropriate AI service method
    let generatedContent = [] as Array<any>;
    try {
      if (use_openai) {
        generatedContent = await aiContentService.generateContentWithOpenAI(generationParams);
      } else {
        generatedContent = await aiContentService.generateContent(generationParams);
      }
    } catch (err) {
      const errId = generateErrorId();
      console.error(`[${errId}] AI generation failure`, err);
      // Fixed status code to match intent
      return res.status(502).json({
        error: 'AI generation service failed',
        errorId: errId,
        details: String(err)
      });
    }

    // Defensive: ensure we have an array
    if (!Array.isArray(generatedContent) || generatedContent.length === 0) {
      return res.status(200).json({
        message: 'No content generated',
        generated_content: [],
        content_saved: false
      });
    }

    // Save generated content in parallel
    const insertQuery = `
      INSERT INTO generated_content (
        artist_id, persona_id, template_id, content_type, content_text, 
        content_metadata, generation_params, approval_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, created_at
    `;

    const savedContent = await Promise.all(generatedContent.map(async (content: any) => {
      const metadata = {
        quality_score: typeof content.quality_score === 'number' ? content.quality_score : null,
        model_used: content.model_used ?? (use_openai ? 'openai' : 'huggingface'),
        variation_id: content.variation_id ?? null,
        generated_at: content.generated_at ?? new Date().toISOString()
      };

      const generationParamsForDB = content.generation_params ?? generationParams;

      const params = [
        personaForService.artist_id,
        personaForService.id,
        template_id ?? null,
        content_type,
        content.content ?? content.text ?? '',
        JSON.stringify(metadata),
        JSON.stringify(generationParamsForDB),
        'draft'
      ];

      try {
        const result = await pool.query(insertQuery, params);
        return {
          ...content,
          id: result.rows[0].id,
          saved_at: result.rows[0].created_at
        };
      } catch (err) {
        const rowErrId = generateErrorId();
        console.error(`[${rowErrId}] Failed to persist generated content`, { err, contentPreview: String(content.content ?? '').slice(0, 120) });
        return {
          ...content,
          id: null,
          saved_at: null,
          save_error: true,
          save_error_id: rowErrId
        };
      }
    }));

    const numericScores = generatedContent
      .map((c: any) => (typeof c.quality_score === 'number' ? c.quality_score : null))
      .filter((s: any) => typeof s === 'number');

    const average_quality_score = numericScores.length > 0
      ? numericScores.reduce((a: number, b: number) => a + b, 0) / numericScores.length
      : null;

    return res.json({
      message: 'Content generated successfully',
      generated_content: savedContent,
      content_saved: true,
      persona_used: {
        name: personaForService.persona_name,
        tone: personaForService.tone,
        themes: personaForService.key_themes
      },
      generation_metadata: {
        model_used: use_openai ? 'openai' : 'huggingface',
        variations_generated: generatedContent.length,
        average_quality_score
      }
    });
  } catch (err) {
    return handleServerError(res, 'Content generation error', err);
  }
});

/**
 * POST /api/content/quality-score
 * - Score content using AI service in the context of user's persona
 */
router.post('/quality-score', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const { content } = req.body;
        if (!content || typeof content !== 'string') {
            return res.status(400).json({ error: 'Content text is required' });
        }

        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const personaData = await getArtistPersona(userId);
        if (!personaData || !personaData.id) {
            return res.status(404).json({ error: 'Artist persona not found' });
        }

        // Call AI scoring
        let qualityMetrics;
        try {
            qualityMetrics = await aiContentService.scoreContentQuality(content, personaData);
        } catch (err) {
            const errId = generateErrorId();
            console.error(`[${errId}] AI scoring failure`, err);
            return res.status(502).json({ error: 'AI scoring service failed', errorId: errId });
        }

        // Defensive formatting for returned values
        const score = typeof qualityMetrics?.score === 'number' ? qualityMetrics.score : 0;
        const recommendations = {
            overall_rating: score >= 0.8 ? 'Excellent' :
                                            score >= 0.6 ? 'Good' :
                                            score >= 0.4 ? 'Fair' : 'Needs Improvement',
            primary_strengths: score > 0.7 ? ['High quality content'] : [],
            improvement_areas: qualityMetrics?.issues ?? [],
            suggested_actions: qualityMetrics?.suggestions ?? []
        };

        return res.json({
            message: 'Content quality analysis completed',
            content_preview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
            quality_metrics: qualityMetrics,
            recommendations
        });
    } catch (err) {
        return handleServerError(res, 'Content quality scoring error', err);
    }
});

/**
 * GET /api/content/templates
 * - optional query param: type
 */
router.get('/templates', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const templates = await templateService.getTemplates(type);
    
    return res.json({
      templates,
      total: Array.isArray(templates) ? templates.length : 0,
      filtered_by_type: type ?? null
    });
  } catch (err) {
    return handleServerError(res, 'Get templates error', err);
  }
});

/**
 * POST /api/content/templates
 */
router.post('/templates', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { error, value } = templateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details && error.details[0] ? error.details[0].message : error.message
      });
    }

    const validation = templateService.validateTemplate(value as CreateTemplateRequest);
    if (!validation || !validation.isValid) {
      return res.status(400).json({
        error: 'Template validation failed',
        details: validation?.errors ?? ['Invalid template']
      });
    }

    const template = await templateService.createTemplate(value as CreateTemplateRequest);
    return res.status(201).json({
      message: 'Template created successfully',
      template
    });
  } catch (err) {
    return handleServerError(res, 'Create template error', err);
  }
});

/**
 * POST /api/content/templates/:id/process
 */
router.post('/templates/:id/process', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { error, value } = processTemplateSchema.validate({
      template_id: req.params.id,
      variables: req.body.variables
    });

    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details && error.details[0] ? error.details[0].message : error.message
      });
    }

    const { template_id, variables } = value;
    const processedTemplate = await templateService.processTemplate(template_id, variables);

    return res.json({
      message: 'Template processed successfully',
      processed_template: processedTemplate
    });
  } catch (err) {
    const errorId = generateErrorId();
    console.error(`[${errorId}] Process template error:`, err);
    return res.status(500).json({
        error: 'Failed to process template',
        details: String(err),
        errorId
    });
  }
});

/**
 * GET /api/content/templates/suggestions
 */
router.get('/templates/suggestions', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const content_type = typeof req.query.content_type === 'string' ? req.query.content_type : undefined;
    const context = typeof req.query.context === 'string' ? req.query.context : undefined;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!content_type) {
      return res.status(400).json({ error: 'content_type parameter is required' });
    }

    const personaData = await getArtistPersona(userId);
    const suggestions = await templateService.suggestTemplates(content_type, personaData, context);

    return res.json({
      message: 'Template suggestions generated',
      suggestions,
      total: Array.isArray(suggestions) ? suggestions.length : 0,
      based_on: {
        content_type,
        has_persona: !!(personaData && personaData.id),
        context: context ?? null
      }
    });
  } catch (err) {
    return handleServerError(res, 'Template suggestions error', err);
  }
});

/**
 * GET /api/content/history
 * - supports limit, offset, content_type, approval_status
 */
router.get('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const rawLimit = req.query.limit;
    const rawOffset = req.query.offset;
    const content_type = typeof req.query.content_type === 'string' ? req.query.content_type : undefined;
    const approval_status = typeof req.query.approval_status === 'string' ? req.query.approval_status : undefined;

    const limit = Math.min(safeParseInt(rawLimit, 20), 100);
    const offset = Math.max(safeParseInt(rawOffset, 0), 0);

    let query = `
      SELECT 
        gc.*,
        ct.template_name,
        p.persona_name,
        a.artist_name
      FROM generated_content gc
      LEFT JOIN content_templates ct ON gc.template_id = ct.id
      LEFT JOIN artist_personas p ON gc.persona_id = p.id
      LEFT JOIN artists a ON gc.artist_id = a.id
      WHERE a.user_id = $1
    `;

    const params: any[] = [userId];
    let idx = 2;

    if (content_type) {
      query += ` AND gc.content_type = $${idx}`;
      params.push(content_type);
      idx++;
    }

    if (approval_status) {
      query += ` AND gc.approval_status = $${idx}`;
      params.push(approval_status);
      idx++;
    }

    query += ` ORDER BY gc.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    return res.json({
      content_history: result.rows,
      pagination: {
        limit,
        offset,
        total: result.rows.length 
      }
    });
  } catch (err) {
    return handleServerError(res, 'Get content history error', err);
  }
});

/**
 * POST /api/content/templates/initialize-defaults
 */
router.post('/templates/initialize-defaults', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    await templateService.initializeDefaultTemplates();
    return res.json({ message: 'Default templates initialized successfully' });
  } catch (err) {
    return handleServerError(res, 'Initialize templates error', err);
  }
});

export default router;