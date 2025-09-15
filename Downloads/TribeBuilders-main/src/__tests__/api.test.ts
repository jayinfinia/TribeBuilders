// src/__tests__/api.test.ts
import request from 'supertest';
import express from 'express';
import { mockDatabase, testData } from './setup';

// Import your actual routes for testing
import userRoutes from '../routes/users';
import artistRoutes from '../routes/artists';
import personaRoutes from '../routes/personas';

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes);
  app.use('/api/artists', artistRoutes);
  app.use('/api/personas', personaRoutes);
  
  // Health check for testing
  app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'UMG Social Assistant API' });
  });
  
  return app;
};

describe('API Health Check', () => {
  const app = createTestApp();
  
  test('GET /health should return OK status', async () => {
    const response = await request(app).get('/health');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'OK');
    expect(response.body).toHaveProperty('message', 'UMG Social Assistant API');
  });
});

describe('User Authentication', () => {
  const app = createTestApp();
  
  beforeEach(() => {
    mockDatabase.clearMocks();
  });

  describe('POST /api/users/register', () => {
    test('should register user with valid data', async () => {
      mockDatabase.mockQuery([]);
      mockDatabase.mockQuery([testData.user]);

      const userData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/users/register')
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User registered successfully');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.token).toBeDefined();
    });

    test('should reject invalid email format', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/users/register')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
    });

    test('should reject short password', async () => {
      const userData = {
        email: 'test@example.com',
        password: '123'
      };

      const response = await request(app)
        .post('/api/users/register')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
    });

    test('should reject duplicate email', async () => {
      mockDatabase.mockQuery([testData.user]);

      const userData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/users/register')
        .send(userData);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('User already exists with this email');
    });
  });

  describe('POST /api/users/login', () => {
    test('should login with valid credentials', async () => {
      mockDatabase.mockQuery([testData.user]);
      mockDatabase.mockQuery([]);

      const credentials = {
        email: 'test@example.com',
        password: 'correct-password'
      };

      const response = await request(app)
        .post('/api/users/login')
        .send(credentials);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.token).toBeDefined();
    });

    test('should reject invalid email', async () => {
      mockDatabase.mockQuery([]);

      const credentials = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/users/login')
        .send(credentials);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid email or password');
    });

    test('should reject invalid password', async () => {
      mockDatabase.mockQuery([testData.user]);

      const credentials = {
        email: 'test@example.com',
        password: 'wrong-password'
      };

      const response = await request(app)
        .post('/api/users/login')
        .send(credentials);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid email or password');
    });
  });

  describe('GET /api/users/profile', () => {
    test('should get user profile with valid token', async () => {
      mockDatabase.mockQuery([{
        ...testData.user,
        artist_id: testData.artist.id,
        artist_name: testData.artist.artist_name,
        real_name: testData.artist.real_name,
        bio: testData.artist.bio,
        genre: testData.artist.genre,
        location: testData.artist.location
      }]);

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.user.id).toBe(testData.user.id);
      expect(response.body.artist.artist_name).toBe(testData.artist.artist_name);
    });

    test('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/users/profile');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Access token required');
    });

    test('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Invalid or expired token');
    });
  });
});

describe('Artist Management', () => {
  const app = createTestApp();

  beforeEach(() => {
    mockDatabase.clearMocks();
  });

  describe('POST /api/artists/profile', () => {
    test('should create artist profile', async () => {
      mockDatabase.mockQuery([]);
      mockDatabase.mockQuery([testData.artist]);

      const artistData = {
        artist_name: 'Test Artist',
        real_name: 'John Doe',
        bio: 'Test bio',
        genre: 'Pop',
        location: 'Nashville, TN'
      };

      const response = await request(app)
        .post('/api/artists/profile')
        .set('Authorization', 'Bearer valid-token')
        .send(artistData);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Artist profile created successfully');
      expect(response.body.profile.artist_name).toBe(artistData.artist_name);
    });

    test('should update existing artist profile', async () => {
      mockDatabase.mockQuery([testData.artist]);
      mockDatabase.mockQuery([{ ...testData.artist, bio: 'Updated bio' }]);

      const updatedData = {
        artist_name: 'Test Artist',
        real_name: 'John Doe', // Required field
        bio: 'Updated bio'
      };

      const response = await request(app)
        .post('/api/artists/profile')
        .set('Authorization', 'Bearer valid-token')
        .send(updatedData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Artist profile updated successfully');
    });

    test('should require authentication', async () => {
      const artistData = {
        artist_name: 'Test Artist'
      };

      const response = await request(app)
        .post('/api/artists/profile')
        .send(artistData);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Access token required');
    });

    test('should validate required fields', async () => {
      const invalidData = {
        real_name: 'John Doe'
      };

      const response = await request(app)
        .post('/api/artists/profile')
        .set('Authorization', 'Bearer valid-token')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.details).toContain('"artist_name" is required');
    });
  });

  describe('GET /api/artists/profile', () => {
    test('should get artist profile', async () => {
      mockDatabase.mockQuery([testData.artist]);

      const response = await request(app)
        .get('/api/artists/profile')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.artist_name).toBe(testData.artist.artist_name);
    });

    test('should return 404 if no artist profile', async () => {
      mockDatabase.mockQuery([]);

      const response = await request(app)
        .get('/api/artists/profile')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Artist profile not found');
    });
  });
});

describe('Persona Management', () => {
  const app = createTestApp();

  beforeEach(() => {
    mockDatabase.clearMocks();
  });

  describe('GET /api/personas/questionnaire/questions', () => {
    test('should return predefined questions', async () => {
      const response = await request(app)
        .get('/api/personas/questionnaire/questions')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.questions).toBeInstanceOf(Array);
      expect(response.body.questions.length).toBeGreaterThan(0);
      expect(response.body.total).toBe(response.body.questions.length);
      
      const firstQuestion = response.body.questions[0];
      expect(firstQuestion).toHaveProperty('question_key');
      expect(firstQuestion).toHaveProperty('question_text');
      expect(firstQuestion).toHaveProperty('answer_type');
    });
  });

  describe('POST /api/personas/questionnaire', () => {
    test('should save questionnaire responses', async () => {
      mockDatabase.mockQuery([{ id: testData.artist.id }]);
      mockDatabase.mockQuery([{ id: testData.persona.id }]);
      mockDatabase.mockQuery([]);
      mockDatabase.mockQuery([]);

      const responses = {
        responses: [
          testData.questionnaireResponse,
          {
            question_key: 'target_audience',
            question_text: 'Who is your target audience?',
            answer_text: 'Young adults 18-30',
            answer_type: 'text'
          }
        ]
      };

      const response = await request(app)
        .post('/api/personas/questionnaire')
        .set('Authorization', 'Bearer valid-token')
        .send(responses);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Questionnaire responses saved successfully');
      expect(response.body.persona_id).toBeDefined();
      expect(response.body.responses_count).toBe(2);
    });

    test('should require artist profile', async () => {
      mockDatabase.mockQuery([]);

      const responses = {
        responses: [testData.questionnaireResponse]
      };

      const response = await request(app)
        .post('/api/personas/questionnaire')
        .set('Authorization', 'Bearer valid-token')
        .send(responses);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Artist profile not found');
    });

    test('should validate responses format', async () => {
      const invalidData = {
        responses: [
          {
            answer_text: 'Some answer'
          }
        ]
      };

      const response = await request(app)
        .post('/api/personas/questionnaire')
        .set('Authorization', 'Bearer valid-token')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
    });
  });
});

describe('Input Validation', () => {
  test('should validate email format', () => {
    const validEmails = [
      'test@example.com',
      'user.name+tag@domain.co.uk',
      'test123@gmail.com'
    ];
    
    const invalidEmails = [
      'not-an-email',
      '@domain.com',
      'test@',
      'test.domain.com'
    ];
    
    const isValidEmail = (email: string) => {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };
    
    validEmails.forEach(email => {
      expect(isValidEmail(email)).toBe(true);
    });
    
    invalidEmails.forEach(email => {
      expect(isValidEmail(email)).toBe(false);
    });
  });
  
  test('should validate password requirements', () => {
    const validPasswords = [
      'password123',
      'secureP@ss',
      'longpassword'
    ];
    
    const invalidPasswords = [
      '12345',
      '',
      'short'
    ];
    
    const isValidPassword = (password: string) => {
      return password.length >= 6;
    };
    
    validPasswords.forEach(password => {
      expect(isValidPassword(password)).toBe(true);
    });
    
    invalidPasswords.forEach(password => {
      expect(isValidPassword(password)).toBe(false);
    });
  });
});

describe('Database Schema Validation', () => {
  test('should have required user fields', () => {
    const userSchema = testData.user;
    
    expect(userSchema).toHaveProperty('id');
    expect(userSchema).toHaveProperty('email');
    expect(userSchema).toHaveProperty('password_hash');
    expect(userSchema).toHaveProperty('created_at');
    expect(userSchema).toHaveProperty('email_verified');
  });
  
  test('should have required artist fields', () => {
    const artistSchema = testData.artist;
    
    expect(artistSchema).toHaveProperty('id');
    expect(artistSchema).toHaveProperty('user_id');
    expect(artistSchema).toHaveProperty('artist_name');
    expect(artistSchema).toHaveProperty('created_at');
  });
  
  test('should have required persona fields', () => {
    const personaSchema = testData.persona;
    
    expect(personaSchema).toHaveProperty('id');
    expect(personaSchema).toHaveProperty('artist_id');
    expect(personaSchema).toHaveProperty('persona_name');
    expect(personaSchema).toHaveProperty('is_active');
  });
});

// Removed custom expect function to avoid conflict with Jest's expect
