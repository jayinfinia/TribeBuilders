// src/__tests__/content.test.ts
import request from 'supertest';
import express from 'express';
import { mockDatabase, testData } from './setup';
import contentRoutes from '../routes/content';
import aiContentService from '../services/aiService';
import templateService from '../services/templateService';
import { ContentTemplate } from '../services/aiService';

// Mock AI services
jest.mock('../services/aiService');
jest.mock('../services/templateService');

const mockAiService = aiContentService as jest.Mocked<typeof aiContentService>;
const mockTemplateService = templateService as jest.Mocked<typeof templateService>;

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/content', contentRoutes);
  return app;
};

describe('AI Content Generation API', () => {
  const app = createTestApp();

  beforeEach(() => {
    mockDatabase.clearMocks();
    jest.clearAllMocks();
  });

  describe('POST /api/content/generate', () => {
    const mockGeneratedContent = [
      {
        content: 'Hey everyone! Super excited to share some amazing news with you all!',
        quality_score: 0.85,
        variation_id: 1,
        generation_params: { model: 'huggingface', temperature: 0.7 },
        model_used: 'huggingface',
        generated_at: new Date()
      },
      {
        content: 'Big announcement coming your way! Can\'t wait for you to hear this!',
        quality_score: 0.78,
        variation_id: 2,
        generation_params: { model: 'huggingface', temperature: 0.8 },
        model_used: 'huggingface',
        generated_at: new Date()
      }
    ];

    test('should generate content successfully', async () => {
      mockDatabase.mockQuery([{
        ...testData.persona,
        artist_name: testData.artist.artist_name,
        artist_id: testData.artist.id,
        questionnaire_responses: [testData.questionnaireResponse]
      }]);
      mockDatabase.mockQuery([{ id: 'content-1', created_at: new Date() }]);
      mockDatabase.mockQuery([{ id: 'content-2', created_at: new Date() }]);

      mockAiService.generateContent.mockResolvedValue(mockGeneratedContent);

      const requestBody = {
        content_type: 'social_post',
        context: 'new single release',
        variations: 2,
        max_length: 280
      };

      const response = await request(app)
        .post('/api/content/generate')
        .set('Authorization', 'Bearer valid-token')
        .send(requestBody);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Content generated successfully');
      expect(response.body.generated_content).toHaveLength(2);
      expect(response.body.content_saved).toBe(true);
      expect(response.body.generation_metadata.variations_generated).toBe(2);
      expect(mockAiService.generateContent).toHaveBeenCalledWith({
        persona: expect.objectContaining({
          id: testData.persona.id,
          tone: testData.persona.tone
        }),
        content_type: 'social_post',
        context: 'new single release',
        max_length: 280,
        variations: 2
      });
    });

    test('should use OpenAI when specified', async () => {
      mockDatabase.mockQuery([{
        ...testData.persona,
        artist_name: testData.artist.artist_name,
        artist_id: testData.artist.id,
        questionnaire_responses: []
      }]);
      mockDatabase.mockQuery([{ id: 'content-1', created_at: new Date() }]);

      mockAiService.generateContentWithOpenAI.mockResolvedValue([mockGeneratedContent[0]]);

      const requestBody = {
        content_type: 'announcement',
        use_openai: true,
        variations: 1
      };

      const response = await request(app)
        .post('/api/content/generate')
        .set('Authorization', 'Bearer valid-token')
        .send(requestBody);

      expect(response.status).toBe(200);
      expect(response.body.generation_metadata.model_used).toBe('openai');
      expect(mockAiService.generateContentWithOpenAI).toHaveBeenCalled();
      expect(mockAiService.generateContent).not.toHaveBeenCalled();
    });

    test('should require persona to exist', async () => {
      mockDatabase.mockQuery([]);

      const requestBody = {
        content_type: 'social_post'
      };

      const response = await request(app)
        .post('/api/content/generate')
        .set('Authorization', 'Bearer valid-token')
        .send(requestBody);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Artist persona not found');
    });

    test('should validate content type', async () => {
      const requestBody = {
        content_type: 'invalid_type'
      };

      const response = await request(app)
        .post('/api/content/generate')
        .set('Authorization', 'Bearer valid-token')
        .send(requestBody);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
    });

    test('should handle AI service errors gracefully', async () => {
      mockDatabase.mockQuery([{
        ...testData.persona,
        artist_name: testData.artist.artist_name,
        artist_id: testData.artist.id,
        questionnaire_responses: []
      }]);

      mockAiService.generateContent.mockRejectedValue(new Error('AI service unavailable'));

      const requestBody = {
        content_type: 'social_post'
      };

      const response = await request(app)
        .post('/api/content/generate')
        .set('Authorization', 'Bearer valid-token')
        .send(requestBody);

      expect(response.status).toBe(502);
      expect(response.body.error).toBe('AI generation service failed');
    });

    test('should include template when specified', async () => {
      const mockTemplate = {
        id: 'template-123',
        template_name: 'Test Template',
        template_type: 'social_post',
        template_content: 'Hey {{audience}}! {{message}}',
        variables: { variables: [] }
      };

      mockDatabase.mockQuery([{
        ...testData.persona,
        artist_name: testData.artist.artist_name,
        artist_id: testData.artist.id,
        questionnaire_responses: []
      }]);
      mockDatabase.mockQuery([{ id: 'content-1', created_at: new Date() }]);
      
      jest.spyOn(templateService, 'getTemplateById').mockResolvedValue(mockTemplate as any);
      mockAiService.generateContent.mockResolvedValue([mockGeneratedContent[0]]);

      const requestBody = {
        content_type: 'social_post',
        template_id: 'template-123'
      };

      const response = await request(app)
        .post('/api/content/generate')
        .set('Authorization', 'Bearer valid-token')
        .send(requestBody);

      expect(response.status).toBe(200);
      expect(templateService.getTemplateById).toHaveBeenCalledWith('template-123');
      expect(mockAiService.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          template: mockTemplate
        })
      );
    });
  });

  describe('POST /api/content/quality-score', () => {
    const mockQualityMetrics = {
      score: 0.82,
      readability: 0.85,
      engagement_potential: 0.78,
      brand_consistency: 0.83,
      issues: [],
      suggestions: ['Add more emotional language for better engagement']
    };

    test('should analyze content quality', async () => {
      const personaWithArtistData = {
        ...testData.persona,
        artist_id: testData.artist.id,
        artist_name: testData.artist.artist_name,
        questionnaire_responses: [],
      };
      mockDatabase.mockQuery([personaWithArtistData]);
      mockAiService.scoreContentQuality.mockResolvedValue(mockQualityMetrics as any);

      const requestBody = {
        content: 'Hey everyone! Super excited to share my new single with you all!'
      };

      const response = await request(app)
        .post('/api/content/quality-score')
        .set('Authorization', 'Bearer valid-token')
        .send(requestBody);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Content quality analysis completed');
      expect(response.body.quality_metrics.score).toBe(0.82);
      expect(response.body.recommendations.overall_rating).toBe('Excellent');
      expect(mockAiService.scoreContentQuality).toHaveBeenCalledWith(
        requestBody.content,
        expect.objectContaining({
          id: personaWithArtistData.id,
          artist_id: personaWithArtistData.artist_id
        })
      );
    });

    test('should handle missing persona gracefully', async () => {
      mockDatabase.mockQuery([]);

      const requestBody = {
        content: 'Test content'
      };

      const response = await request(app)
        .post('/api/content/quality-score')
        .set('Authorization', 'Bearer valid-token')
        .send(requestBody);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Artist persona not found');
    });

    test('should provide rating recommendations', async () => {
      const personaWithArtistData = {
        ...testData.persona,
        artist_id: testData.artist.id,
        artist_name: testData.artist.artist_name,
        questionnaire_responses: [],
      };
      mockDatabase.mockQuery([personaWithArtistData]);
      
      const lowQualityMetrics = {
        ...mockQualityMetrics,
        score: 0.35,
        issues: ['Content may be too complex'],
        suggestions: ['Simplify language']
      };
      
      mockAiService.scoreContentQuality.mockResolvedValue(lowQualityMetrics as any);

      const response = await request(app)
        .post('/api/content/quality-score')
        .set('Authorization', 'Bearer valid-token')
        .send({ content: 'Test content' });

      expect(response.status).toBe(200);
      expect(response.body.recommendations.overall_rating).toBe('Needs Improvement');
      expect(response.body.recommendations.improvement_areas).toContain('Content may be too complex');
      expect(response.body.recommendations.suggested_actions).toContain('Simplify language');
    });
  });

  describe('GET /api/content/templates', () => {
    const mockTemplates = [
      { id: 'template-1', template_name: 'New Release', template_type: 'release', template_content: 'New song {{title}} is out now!', variables: { variables: [] } },
      { id: 'template-2', template_name: 'General Post', template_type: 'social_post', template_content: 'Hey everyone! {{message}}', variables: { variables: [] } }
    ];

    test('should get all templates', async () => {
      jest.spyOn(templateService, 'getTemplates').mockResolvedValue(mockTemplates as any);

      const response = await request(app)
        .get('/api/content/templates')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.templates).toHaveLength(2);
      expect(response.body.total).toBe(2);
      expect(response.body.filtered_by_type).toBe(null);
      expect(templateService.getTemplates).toHaveBeenCalledWith(undefined);
    });

    test('should filter templates by type', async () => {
      const releaseTemplates = [mockTemplates[0]];
      jest.spyOn(templateService, 'getTemplates').mockResolvedValue(releaseTemplates as any);

      const response = await request(app)
        .get('/api/content/templates?type=release')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.templates).toHaveLength(1);
      expect(response.body.filtered_by_type).toBe('release');
      expect(templateService.getTemplates).toHaveBeenCalledWith('release');
    });
  });

  describe('POST /api/content/templates', () => {
    const validTemplate = {
      template_name: 'Custom Template',
      template_type: 'social_post',
      template_content: 'Hey {{audience}}! {{message}}',
      variables: [
        { name: 'audience', type: 'select', required: true, options: ['everyone', 'fans'] },
        { name: 'message', type: 'text', required: true }
      ]
    };

    test('should create new template', async () => {
      jest.spyOn(templateService, 'validateTemplate').mockReturnValue({ isValid: true, errors: [] });
      jest.spyOn(templateService, 'createTemplate').mockResolvedValue({ id: 'template-123', ...validTemplate } as any);

      const response = await request(app)
        .post('/api/content/templates')
        .set('Authorization', 'Bearer valid-token')
        .send(validTemplate);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Template created successfully');
      expect(response.body.template.id).toBe('template-123');
      expect(templateService.validateTemplate).toHaveBeenCalledWith(validTemplate);
      expect(templateService.createTemplate).toHaveBeenCalledWith(validTemplate);
    });
  });

  describe('POST /api/content/templates/:id/process', () => {
    test('should process template with variables', async () => {
      const processedResult = {
        template_id: 'template-123',
        processed_content: 'Hey everyone! Check out my new single!',
        variables_used: { audience: 'everyone', message: 'Check out my new single!' },
        processing_date: new Date()
      };

      jest.spyOn(templateService, 'processTemplate').mockResolvedValue(processedResult as any);

      const variables = { audience: 'everyone', message: 'Check out my new single!' };

      const response = await request(app)
        .post('/api/content/templates/template-123/process')
        .set('Authorization', 'Bearer valid-token')
        .send({ variables });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Template processed successfully');
      expect(response.body.processed_template.processed_content).toBe(processedResult.processed_content);
      expect(templateService.processTemplate).toHaveBeenCalledWith('template-123', variables);
    });
  });

  describe('GET /api/content/templates/suggestions', () => {
    test('should get template suggestions', async () => {
        const mockSuggestions: ContentTemplate[] = [
        {
            id: 'template-1', template_name: 'New Release', template_type: 'release',
            template_content: 'New song {{title}} is out now!', variables: {}
        }
      ];

      mockDatabase.mockQuery([{
        ...testData.persona,
        artist_id: testData.artist.id,
        artist_name: testData.artist.artist_name,
        questionnaire_responses: []
      }]);

      jest.spyOn(templateService, 'suggestTemplates').mockResolvedValue(mockSuggestions as any);

      const response = await request(app)
        .get('/api/content/templates/suggestions?content_type=social_post&context=new%20release')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.suggestions).toHaveLength(1);
      expect(response.body.based_on.content_type).toBe('social_post');
      expect(response.body.based_on.has_persona).toBe(true);
      expect(templateService.suggestTemplates).toHaveBeenCalledWith(
        'social_post',
        expect.objectContaining({ id: testData.persona.id }),
        'new release'
      );
    });
  });

  describe('GET /api/content/history', () => {
    test('should get content generation history', async () => {
      const mockHistory = [
        {
          id: 'content-1', content_text: 'Generated content 1', content_type: 'social_post',
          approval_status: 'draft', created_at: new Date(), template_name: 'Social Post Template',
          persona_name: 'Main Persona', artist_name: 'Test Artist'
        }
      ];
      mockDatabase.mockQuery(mockHistory);

      const response = await request(app)
        .get('/api/content/history')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.content_history).toHaveLength(1);
      expect(response.body.pagination.limit).toBe(20);
      expect(response.body.pagination.offset).toBe(0);
    });
  });

  describe('POST /api/content/templates/initialize-defaults', () => {
    test('should initialize default templates', async () => {
      jest.spyOn(templateService, 'initializeDefaultTemplates').mockResolvedValue();

      const response = await request(app)
        .post('/api/content/templates/initialize-defaults')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Default templates initialized successfully');
      expect(templateService.initializeDefaultTemplates).toHaveBeenCalled();
    });
  });
});