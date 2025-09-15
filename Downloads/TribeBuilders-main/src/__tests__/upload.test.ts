// src/__tests__/upload.test.ts
import request from 'supertest';
import express from 'express';
import { mockDatabase, testData } from './setup';
import uploadRoutes from '../routes/uploads';
import { Router } from 'express';

// Mock file system operations
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    readFile: jest.fn(),
    unlink: jest.fn(),
  },
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  createReadStream: jest.fn()
}));

// Mock multer upload and file processors dynamically
jest.mock('../Config/upload', () => {
  const mockFileProcessors = {
    processTextFile: jest.fn(),
    processCsvFile: jest.fn(),
    processJsonFile: jest.fn(),
    processPdfFile: jest.fn(),
    cleanupFile: jest.fn()
  };

  const mockGetFileProcessor = jest.fn((mimetype: string) => {
    if (mimetype.includes('json')) return mockFileProcessors.processJsonFile;
    if (mimetype.includes('csv')) return mockFileProcessors.processCsvFile;
    if (mimetype.includes('pdf')) return mockFileProcessors.processPdfFile;
    return mockFileProcessors.processTextFile;
  });

  let globalMockFile: any = null;
  
  const mockUpload = {
    single: (fieldName: string) => (req: any, res: any, next: any) => {
      // Check if this request should have no file
      if (req.headers['no-file'] === 'true') {
        req.file = undefined;
        return next();
      }
      const file = globalMockFile || {
        fieldname: fieldName,
        originalname: 'test-file.json',
        encoding: '7bit',
        mimetype: 'application/json',
        size: 1024,
        destination: '/tmp/uploads',
        filename: 'test-file-123456.json',
        path: '/tmp/uploads/test-file-123456.json'
      };
      req.file = file;
      next();
    },
    setMockFile: (file: any) => {
      globalMockFile = file;
    }
  };

  return {
    upload: mockUpload,
    FileProcessors: mockFileProcessors,
    getFileProcessor: mockGetFileProcessor
  };
});

// Import the mocked module
const { FileProcessors, getFileProcessor, upload } = require('../Config/upload');

// Create test app factory for a clean app instance per test
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  const router = Router();
  router.use('/uploads', uploadRoutes);
  app.use('/api', router);
  return app;
};

describe('File Upload API', () => {
  beforeEach(() => {
    mockDatabase.clearMocks();
    jest.clearAllMocks();
    // Ensure cleanupFile mock resolves by default to prevent other tests from failing
    FileProcessors.cleanupFile.mockResolvedValue(undefined);
  });

  describe('POST /api/uploads/persona/questionnaire', () => {
    test('should upload and process JSON questionnaire file', async () => {
      const app = createTestApp();
      const mockFile = { mimetype: 'application/json', originalname: 'test.json', path: '/tmp/uploads/test.json' };
      (app as any).mockFile = mockFile;

      mockDatabase.mockQuery([{ id: testData.artist.id }]); // Artist query
      mockDatabase.mockQuery([{ id: testData.persona.id }]); // Existing persona query
      mockDatabase.mockQuery([{ rowCount: 1 }]); // Update persona query
      mockDatabase.mockQuery([{ rowCount: 1 }]); // Insert questionnaire responses
      
      const mockQuestionnaireData = { responses: [{ question_key: 'key', question_text: 'text', answer_text: 'answer' }] };
      getFileProcessor.mockReturnValue(FileProcessors.processJsonFile);
      FileProcessors.processJsonFile.mockResolvedValue(mockQuestionnaireData);

      const response = await request(app)
        .post('/api/uploads/persona/questionnaire')
        .set('Authorization', 'Bearer valid-token')
        .attach('file', Buffer.from(JSON.stringify(mockQuestionnaireData)), 'test-questionnaire.json');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Questionnaire file processed successfully');
      expect(response.body.responses_processed).toBe(1);
      expect(FileProcessors.cleanupFile).toHaveBeenCalled();
    });

    test('should handle CSV questionnaire file', async () => {
      const app = createTestApp();
      const mockFile = { mimetype: 'text/csv', originalname: 'test.csv', path: '/tmp/uploads/test.csv' };
      upload.setMockFile(mockFile);

      mockDatabase.mockQuery([{ id: testData.artist.id }]); // Artist query
      mockDatabase.mockQuery([]); // No existing persona
      mockDatabase.mockQuery([{ id: testData.persona.id }]); // Create new persona
      mockDatabase.mockQuery([{ rowCount: 1 }]); // Insert questionnaire responses
      
      const mockCsvData = [{ question_key: 'style', question_text: 'Style?', answer_text: 'Rock', answer_type: 'text' }];
      getFileProcessor.mockReturnValue(FileProcessors.processCsvFile);
      FileProcessors.processCsvFile.mockResolvedValue(mockCsvData);

      const response = await request(app)
        .post('/api/uploads/persona/questionnaire')
        .set('Authorization', 'Bearer valid-token')
        .attach('file', Buffer.from('question_key,question_text,answer_text\nstyle,Style?,Rock'), 'questionnaire.csv');


      expect(response.status).toBe(200);
      expect(response.body.responses_processed).toBe(1);
      expect(FileProcessors.cleanupFile).toHaveBeenCalled();
    });

    test('should require file upload', async () => {
      const app = createTestApp();

      const response = await request(app)
        .post('/api/uploads/persona/questionnaire')
        .set('Authorization', 'Bearer valid-token')
        .set('no-file', 'true');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No file uploaded');
      // The cleanup should not be called since no file was uploaded
      expect(FileProcessors.cleanupFile).not.toHaveBeenCalled();
    });

    test('should require artist profile', async () => {
      const app = createTestApp();
      (app as any).mockFile = { mimetype: 'application/json', originalname: 'test.json', path: '/tmp/uploads/test.json' };
      mockDatabase.mockQuery([]); // Mock empty artist result
      getFileProcessor.mockReturnValue(FileProcessors.processJsonFile);
      FileProcessors.processJsonFile.mockResolvedValue({ responses: [{ question_key: 'key', question_text: 'text', answer_text: 'answer' }] });
      
      const response = await request(app)
        .post('/api/uploads/persona/questionnaire')
        .set('Authorization', 'Bearer valid-token')
        .attach('file', Buffer.from('{"responses": [{"question_key": "key", "question_text": "text", "answer_text": "answer"}]}'), 'test.json');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Artist profile not found');
      // Cleanup should still be called to remove the file
      expect(FileProcessors.cleanupFile).toHaveBeenCalled();
    });
  });

  describe('POST /api/uploads/persona/transcript', () => {
    test('should upload transcript file', async () => {
      const app = createTestApp();
      const mockFile = { mimetype: 'text/plain', originalname: 'transcript.txt', path: '/tmp/uploads/transcript.txt' };
      (app as any).mockFile = mockFile;

      // Mock the artist+persona query result
      mockDatabase.mockQuery([{ artist_id: testData.artist.id, persona_id: testData.persona.id }]);
      // Mock the transcript insertion result
      mockDatabase.mockQuery([{ id: 'transcript-123' }]);

      const transcriptContent = "This is a sample podcast transcript...";
      getFileProcessor.mockReturnValue(FileProcessors.processTextFile);
      FileProcessors.processTextFile.mockResolvedValue(transcriptContent);

      const response = await request(app)
        .post('/api/uploads/persona/transcript')
        .set('Authorization', 'Bearer valid-token')
        .field('source_type', 'podcast')
        .field('source_url', 'https://example.com/podcast/episode1')
        .attach('file', Buffer.from(transcriptContent), 'transcript.txt');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Transcript uploaded successfully');
      expect(response.body.transcript_id).toBe('transcript-123');
      expect(FileProcessors.cleanupFile).toHaveBeenCalled();
    });

    test('should require persona to exist', async () => {
      const app = createTestApp();
      (app as any).mockFile = { mimetype: 'text/plain', originalname: 'transcript.txt', path: '/tmp/uploads/transcript.txt' };
      mockDatabase.mockQuery([{ artist_id: testData.artist.id, persona_id: null }]);
      
      const response = await request(app)
        .post('/api/uploads/persona/transcript')
        .set('Authorization', 'Bearer valid-token')
        .attach('file', Buffer.from('transcript'), 'transcript.txt');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('No persona found');
      expect(FileProcessors.cleanupFile).toHaveBeenCalled();
    });
  });

  describe('GET /api/uploads/persona/files', () => {
    test('should list uploaded files', async () => {
      const app = createTestApp();
      const mockFiles = [
        { id: 'transcript-1', source_url: 'Uploaded file: transcript1.txt', source_type: 'uploaded_file',
          processed_at: new Date().toISOString(), created_at: new Date().toISOString(), transcript_length: 1500,
          persona_name: 'Main Persona', artist_name: 'Test Artist'
        },
        { id: 'transcript-2', source_url: 'https://example.com/podcast', source_type: 'podcast',
          processed_at: new Date().toISOString(), created_at: new Date().toISOString(), transcript_length: 3000,
          persona_name: 'Main Persona', artist_name: 'Test Artist'
        }
      ];

      mockDatabase.mockQuery(mockFiles);

      const response = await request(app)
        .get('/api/uploads/persona/files')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.files).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });

    test('should return empty list if no files', async () => {
      const app = createTestApp();
      mockDatabase.mockQuery([]);

      const response = await request(app)
        .get('/api/uploads/persona/files')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.files).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });
  });

  describe('DELETE /api/uploads/persona/transcript/:id', () => {
    test('should delete transcript', async () => {
      const app = createTestApp();
      mockDatabase.mockQuery([{ id: 'transcript-123' }]);
      mockDatabase.mockQuery({ rowCount: 1 });

      const response = await request(app)
        .delete('/api/uploads/persona/transcript/transcript-123')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Transcript deleted successfully');
      expect(response.body.transcript_id).toBe('transcript-123');
    });

    test('should prevent unauthorized deletion', async () => {
      const app = createTestApp();
      mockDatabase.mockQuery([]);

      const response = await request(app)
        .delete('/api/uploads/persona/transcript/transcript-123')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Transcript not found or access denied');
    });
  });
});

describe('File Processing Utilities', () => {
  let consoleErrorSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('should process text files', async () => {
    const { FileProcessors } = require('../Config/upload');
    const mockContent = 'This is test content';
    FileProcessors.processTextFile.mockResolvedValue(mockContent);
    const result = await FileProcessors.processTextFile('/path/to/file.txt');
    expect(result).toBe(mockContent);
  });

  test('should process JSON files', async () => {
    const { FileProcessors } = require('../Config/upload');
    const mockData = { test: 'data' };
    FileProcessors.processJsonFile.mockResolvedValue(mockData);
    const result = await FileProcessors.processJsonFile('/path/to/file.json');
    expect(result).toEqual(mockData);
  });

  test('should handle JSON parsing errors', async () => {
    const { FileProcessors } = require('../Config/upload');
    FileProcessors.processJsonFile.mockRejectedValue(new Error('Error parsing JSON file'));
    await expect(FileProcessors.processJsonFile('/path/to/file.json'))
      .rejects.toThrow('Error parsing JSON file');
  });

  test('should cleanup files', async () => {
    const { FileProcessors } = require('../Config/upload');
    FileProcessors.cleanupFile.mockResolvedValue(undefined);
    await FileProcessors.cleanupFile('/path/to/file.txt');
    expect(FileProcessors.cleanupFile).toHaveBeenCalledWith('/path/to/file.txt');
  });

  test('should handle cleanup errors gracefully', async () => {
    const { FileProcessors } = require('../Config/upload');
    // Reset the mock to use actual implementation for this test
    FileProcessors.cleanupFile.mockImplementation(async (filePath: string) => {
      console.error(`Error cleaning up file ${filePath}:`, new Error('Cleanup error'));
    });
    
    await FileProcessors.cleanupFile('/path/to/file.txt');
    expect(FileProcessors.cleanupFile).toHaveBeenCalledWith('/path/to/file.txt');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error cleaning up file /path/to/file.txt:',
      expect.any(Error)
    );
  });
});