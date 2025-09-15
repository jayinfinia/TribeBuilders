// Test setup and utilities

// Set environment variables before any imports
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.NODE_ENV = 'test';

import { Pool } from 'pg';

// Mock database connection for tests
jest.mock('../Config/connection', () => {
  return {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn()
  };
});

// Mock JWT for tests with proper secret handling
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-jwt-token'),
  verify: jest.fn((token, secret, callback) => {
    // Use the test JWT secret
    const expectedSecret = process.env.JWT_SECRET;
    if (secret !== expectedSecret) {
      callback(new Error('Invalid secret'), null);
      return;
    }

    if (token === 'valid-token') {
      callback(null, { userId: 'test-user-id', email: 'test@example.com' });
    } else if (token === 'mock-jwt-token') {
      callback(null, { userId: 'test-user-id', email: 'test@example.com' });
    } else {
      callback(new Error('Invalid token'), null);
    }
  })
}));

// Mock bcrypt for tests
jest.mock('bcryptjs', () => ({
  hash: jest.fn(() => Promise.resolve('hashed-password')),
  compare: jest.fn((password, hash) => {
    return Promise.resolve(password === 'correct-password');
  })
}));

// Test utilities
export const mockDatabase = {
  mockQuery: (result: any) => { 
    const pool = require('../Config/connection');
    pool.query.mockResolvedValueOnce({ rows: result });
  },
  
  mockQueryError: (error: Error) => {
    const pool = require('../Config/connection');
    pool.query.mockRejectedValueOnce(error);
  },
  
  clearMocks: () => {
    const pool = require('../Config/connection');
    pool.query.mockClear();
  }
};

// Test data factories
export const testData = {
  user: {
    id: 'user-123',
    email: 'test@example.com',
    password_hash: 'hashed-password',
    created_at: new Date(),
    updated_at: new Date(),
    email_verified: false,
    last_login: null
  },
  
  artist: {
    id: 'artist-123',
    user_id: 'user-123',
    artist_name: 'Test Artist',
    real_name: 'John Doe',
    bio: 'Test bio',
    genre: 'Pop',
    location: 'Nashville, TN',
    website_url: 'https://testartist.com',
    spotify_artist_id: 'spotify-123',
    created_at: new Date(),
    updated_at: new Date()
  },
  
  persona: {
    id: 'persona-123',
    artist_id: 'artist-123',
    persona_name: 'Main Persona',
    description: 'Test persona',
    tone: 'casual',
    target_audience: 'Young adults',
    key_themes: ['music', 'life'],
    voice_characteristics: {},
    created_at: new Date(),
    updated_at: new Date(),
    is_active: true
  },
  
  questionnaireResponse: {
    question_key: 'musical_style',
    question_text: 'How would you describe your musical style?',
    answer_text: 'Pop with indie influences',
    answer_type: 'text'
  },
  
  sampleData: []
};

// Global test timeout
jest.setTimeout(10000);

// Console suppression for cleaner test output (but allow error logging for debugging)
const originalConsole = global.console;
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: originalConsole.error // Keep error logging for debugging
};

// Basic setup test
test('Basic setup test', () => {
  expect(mockDatabase.clearMocks).toBeDefined();
  expect(process.env.JWT_SECRET).toBe('test-jwt-secret-key-for-testing-only');
  expect(process.env.NODE_ENV).toBe('test');
});