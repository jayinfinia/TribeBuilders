"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const connection_1 = __importDefault(require("../Config/connection"));
const router = (0, express_1.Router)();
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        res.status(401).json({ error: 'Access token required' });
        return;
    }
    jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err, user) => {
        if (err) {
            res.status(403).json({ error: 'Invalid or expired token' });
            return;
        }
        req.user = user;
        next();
    });
}
const personaSchema = joi_1.default.object({
    persona_name: joi_1.default.string().min(1).max(255).optional().default('Main Persona'),
    description: joi_1.default.string().max(2000).optional(),
    tone: joi_1.default.string().max(50).optional(),
    target_audience: joi_1.default.string().max(1000).optional(),
    key_themes: joi_1.default.array().items(joi_1.default.string()).optional(),
    voice_characteristics: joi_1.default.object().optional(),
});
const questionnaireSchema = joi_1.default.object({
    responses: joi_1.default.array().items(joi_1.default.object({
        question_key: joi_1.default.string().required(),
        question_text: joi_1.default.string().required(),
        answer_text: joi_1.default.string().allow('').optional(),
        answer_type: joi_1.default.string().valid('text', 'multiple_choice', 'scale', 'boolean').default('text')
    })).required()
});
const PERSONA_QUESTIONS = [
    {
        question_key: 'musical_style',
        question_text: 'How would you describe your musical style and genre?',
        answer_type: 'text'
    },
    {
        question_key: 'target_audience',
        question_text: 'Who is your ideal listener or fan?',
        answer_type: 'text'
    },
    {
        question_key: 'inspiration',
        question_text: 'What or who inspires your music and creativity?',
        answer_type: 'text'
    },
    {
        question_key: 'personality_tone',
        question_text: 'How would you describe your personality in social media posts? (casual, professional, edgy, friendly, etc.)',
        answer_type: 'text'
    },
    {
        question_key: 'key_messages',
        question_text: 'What key messages or themes do you want to communicate to your fans?',
        answer_type: 'text'
    },
    {
        question_key: 'posting_frequency',
        question_text: 'How often do you prefer to post on social media?',
        answer_type: 'multiple_choice'
    },
    {
        question_key: 'content_types',
        question_text: 'What types of content do you enjoy creating? (behind-the-scenes, music snippets, personal stories, etc.)',
        answer_type: 'text'
    },
    {
        question_key: 'fan_interaction',
        question_text: 'How do you like to interact with your fans on social media?',
        answer_type: 'text'
    }
];
router.get('/questionnaire/questions', authenticateToken, async (req, res) => {
    try {
        res.json({
            questions: PERSONA_QUESTIONS,
            total: PERSONA_QUESTIONS.length
        });
        return;
    }
    catch (error) {
        console.error('Get questionnaire questions error:', error);
        res.status(500).json({
            error: 'Internal server error fetching questionnaire questions'
        });
        return;
    }
});
router.post('/questionnaire', authenticateToken, async (req, res) => {
    try {
        const { error, value } = questionnaireSchema.validate(req.body);
        if (error) {
            res.status(400).json({
                error: 'Validation error',
                details: error.details?.[0]?.message
            });
            return;
        }
        const userId = req.user.userId;
        const { responses } = value;
        const artistQuery = 'SELECT id FROM artists WHERE user_id = $1';
        const artistResult = await connection_1.default.query(artistQuery, [userId]);
        if (artistResult.rows.length === 0) {
            res.status(404).json({
                error: 'Artist profile not found. Please create an artist profile first.'
            });
            return;
        }
        const artistId = artistResult.rows[0].id;
        const personaQuery = `
      INSERT INTO artist_personas (artist_id, persona_name, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (artist_id) 
      DO UPDATE SET updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `;
        const personaResult = await connection_1.default.query(personaQuery, [
            artistId,
            'Main Persona',
            'Generated from questionnaire responses'
        ]);
        const personaId = personaResult.rows[0].id;
        for (const response of responses) {
            const insertResponseQuery = `
        INSERT INTO persona_questionnaires (persona_id, question_key, question_text, answer_text, answer_type)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (persona_id, question_key) 
        DO UPDATE SET 
          answer_text = EXCLUDED.answer_text,
          created_at = CURRENT_TIMESTAMP
      `;
            await connection_1.default.query(insertResponseQuery, [
                personaId,
                response.question_key,
                response.question_text,
                response.answer_text || '',
                response.answer_type
            ]);
        }
        await updatePersonaFromResponses(personaId, responses);
        res.json({
            message: 'Questionnaire responses saved successfully',
            persona_id: personaId,
            responses_count: responses.length
        });
        return;
    }
    catch (error) {
        console.error('Submit questionnaire error:', error);
        res.status(500).json({
            error: 'Internal server error saving questionnaire responses'
        });
        return;
    }
});
router.get('/persona', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const query = `
      SELECT 
        p.*, 
        a.artist_name,
        COALESCE(
          json_agg(
            json_build_object(
              'question_key', pq.question_key,
              'question_text', pq.question_text,
              'answer_text', pq.answer_text,
              'answer_type', pq.answer_type,
              'created_at', pq.created_at
            )
          ) FILTER (WHERE pq.id IS NOT NULL), 
          '[]'
        ) as questionnaire_responses
      FROM artists a
      LEFT JOIN artist_personas p ON a.id = p.artist_id
      LEFT JOIN persona_questionnaires pq ON p.id = pq.persona_id
      WHERE a.user_id = $1
      GROUP BY p.id, a.artist_name
    `;
        const result = await connection_1.default.query(query, [userId]);
        if (result.rows.length === 0) {
            res.status(404).json({
                message: 'No persona found. Please complete the questionnaire first.'
            });
            return;
        }
        const personaData = result.rows[0];
        res.json({
            persona: {
                id: personaData.id,
                persona_name: personaData.persona_name,
                description: personaData.description,
                tone: personaData.tone,
                target_audience: personaData.target_audience,
                key_themes: personaData.key_themes,
                voice_characteristics: personaData.voice_characteristics,
                created_at: personaData.created_at,
                updated_at: personaData.updated_at,
                is_active: personaData.is_active
            },
            artist_name: personaData.artist_name,
            questionnaire_responses: personaData.questionnaire_responses
        });
        return;
    }
    catch (error) {
        console.error('Get persona error:', error);
        res.status(500).json({
            error: 'Internal server error fetching persona'
        });
        return;
    }
});
async function updatePersonaFromResponses(personaId, responses) {
    try {
        let tone = '';
        let targetAudience = '';
        const keyThemes = [];
        responses.forEach(response => {
            switch (response.question_key) {
                case 'personality_tone':
                    tone = response.answer_text;
                    break;
                case 'target_audience':
                    targetAudience = response.answer_text;
                    break;
                case 'key_messages':
                    if (response.answer_text) {
                        keyThemes.push(...response.answer_text.split(',').map((theme) => theme.trim()));
                    }
                    break;
            }
        });
        const updateQuery = `
      UPDATE artist_personas 
      SET 
        tone = $2,
        target_audience = $3,
        key_themes = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
        await connection_1.default.query(updateQuery, [personaId, tone, targetAudience, keyThemes]);
        return;
    }
    catch (error) {
        console.error('Error updating persona from responses:', error);
        return;
    }
}
exports.default = router;
//# sourceMappingURL=personas.js.map