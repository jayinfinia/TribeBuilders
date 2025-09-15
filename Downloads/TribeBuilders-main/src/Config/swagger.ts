import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'UMG Social Assistant API',
      version: '1.0.0',
      description: 'AI-powered social media assistant for Universal Music Group artists',
      contact: {
        name: 'Team Alpha - NextGenHSV',
        email: 'support@umg-social-assistant.com'
      },
      license: {
        name: 'ISC',
        url: 'https://opensource.org/licenses/ISC'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.umg-social-assistant.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token in the format: Bearer <token>'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'User unique identifier'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation timestamp'
            },
            email_verified: {
              type: 'boolean',
              description: 'Email verification status'
            },
            last_login: {
              type: 'string',
              format: 'date-time',
              description: 'Last login timestamp'
            }
          }
        },
        Artist: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            user_id: {
              type: 'string',
              format: 'uuid'
            },
            artist_name: {
              type: 'string',
              description: 'Stage/artist name'
            },
            real_name: {
              type: 'string',
              description: 'Real name (optional)'
            },
            bio: {
              type: 'string',
              description: 'Artist biography'
            },
            genre: {
              type: 'string',
              description: 'Musical genre'
            },
            location: {
              type: 'string',
              description: 'Artist location'
            },
            website_url: {
              type: 'string',
              format: 'url',
              description: 'Artist website URL'
            },
            spotify_artist_id: {
              type: 'string',
              description: 'Spotify artist identifier'
            }
          },
          required: ['artist_name']
        },
        Persona: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            artist_id: {
              type: 'string',
              format: 'uuid'
            },
            persona_name: {
              type: 'string',
              default: 'Main Persona'
            },
            description: {
              type: 'string'
            },
            tone: {
              type: 'string',
              description: 'Communication tone (casual, professional, edgy, etc.)'
            },
            target_audience: {
              type: 'string',
              description: 'Target audience description'
            },
            key_themes: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Key messaging themes'
            },
            voice_characteristics: {
              type: 'object',
              description: 'Voice and style characteristics'
            },
            is_active: {
              type: 'boolean',
              default: true
            }
          }
        },
        QuestionnaireResponse: {
          type: 'object',
          properties: {
            question_key: {
              type: 'string',
              description: 'Unique question identifier'
            },
            question_text: {
              type: 'string',
              description: 'The actual question'
            },
            answer_text: {
              type: 'string',
              description: 'User response'
            },
            answer_type: {
              type: 'string',
              enum: ['text', 'multiple_choice', 'scale', 'boolean'],
              default: 'text'
            }
          },
          required: ['question_key', 'question_text']
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            },
            details: {
              type: 'string',
              description: 'Additional error details'
            }
          }
        },
        SuccessMessage: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Success message'
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Health',
        description: 'API health and status endpoints'
      },
      {
        name: 'Authentication',
        description: 'User registration and authentication'
      },
      {
        name: 'Artists',
        description: 'Artist profile management'
      },
      {
        name: 'Personas',
        description: 'Artist persona and questionnaire management'
      },
      {
        name: 'File Upload',
        description: 'File upload for persona data and transcripts'
      }
    ]
  },
  apis: [
    './src/routes/*.ts',
    './src/app.ts'
  ]
};

const swaggerSpec = swaggerJSDoc(options);

export const setupSwagger = (app: Express) => {
  // Swagger UI setup
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'UMG Social Assistant API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true
    }
  }));

  // JSON endpoint for swagger spec
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log('📚 Swagger documentation available at /api-docs');
  console.log('📋 Swagger JSON spec available at /api-docs.json');
};

export default swaggerSpec;