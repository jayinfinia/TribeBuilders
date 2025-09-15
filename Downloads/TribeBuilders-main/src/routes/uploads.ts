import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../Config/connection';
import { upload, FileProcessors, getFileProcessor } from '../Config/upload';
import authenticateToken, { AuthRequest } from '../middleware/authenticateToken';

const router = Router();

// Upload persona questionnaire file
router.post('/persona/questionnaire', authenticateToken, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = (req.user as any)?.userId;
    const file = req.file;

    const artistQuery = 'SELECT id FROM artists WHERE user_id = $1';
    const artistResult = await pool.query(artistQuery, [userId]);
    
    if (!artistResult.rows || artistResult.rows.length === 0 || !artistResult.rows[0]?.id) {
      await FileProcessors.cleanupFile(file.path);
      return res.status(404).json({ 
        error: 'Artist profile not found. Please create an artist profile first.' 
      });
    }

    const artistId = artistResult.rows[0].id;

    const processor = getFileProcessor(file.mimetype);
    let fileContent: any;

    try {
      fileContent = await processor(file.path);
    } catch (error) {
      await FileProcessors.cleanupFile(file.path);
      return res.status(400).json({ 
        error: `Error processing file: ${error}` 
      });
    }

    let questionnaireResponses: any[] = [];
    if (file.mimetype === 'application/json' && fileContent && fileContent.responses) {
      questionnaireResponses = fileContent.responses;
    } else if (file.mimetype === 'text/csv' && Array.isArray(fileContent)) {
      questionnaireResponses = fileContent; // Directly use the array from csv-parser
    } else {
      const lines = typeof fileContent === 'string' ? fileContent.split('\n').filter(line => line.trim()) : [];
      let currentQuestion = '';
      let currentKey = '';

      for (const line of lines) {
        if (line.startsWith('Q:') || line.startsWith('Question:')) {
          currentQuestion = line.replace(/^Q:|^Question:/, '').trim();
          currentKey = currentQuestion.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 50);
        } else if (line.startsWith('A:') || line.startsWith('Answer:')) {
          const answer = line.replace(/^A:|^Answer:/, '').trim();
          if (currentQuestion && answer) {
            questionnaireResponses.push({
              question_key: currentKey,
              question_text: currentQuestion,
              answer_text: answer,
              answer_type: 'text'
            });
          }
        }
      }
    }

    if (questionnaireResponses.length === 0) {
      await FileProcessors.cleanupFile(file.path);
      return res.status(400).json({ 
        error: 'No valid questionnaire responses found in file' 
      });
    }

    // First try to get existing persona, then create if not exists
    let personaId;
    const existingPersonaQuery = 'SELECT id FROM artist_personas WHERE artist_id = $1';
    const existingPersonaResult = await pool.query(existingPersonaQuery, [artistId]);
    
    if (existingPersonaResult.rows.length > 0) {
      personaId = existingPersonaResult.rows[0].id;
      // Update the existing persona
      const updateQuery = `
        UPDATE artist_personas 
        SET updated_at = CURRENT_TIMESTAMP, description = $1
        WHERE id = $2
      `;
      await pool.query(updateQuery, [
        `Generated from uploaded file: ${file.originalname}`,
        personaId
      ]);
    } else {
      // Create new persona
      const insertQuery = `
        INSERT INTO artist_personas (artist_id, persona_name, description)
        VALUES ($1, $2, $3)
        RETURNING id
      `;
      const insertResult = await pool.query(insertQuery, [
        artistId,
        'Main Persona',
        `Generated from uploaded file: ${file.originalname}`
      ]);
      
      if (!insertResult.rows || insertResult.rows.length === 0 || !insertResult.rows[0]?.id) {
        await FileProcessors.cleanupFile(file.path);
        return res.status(500).json({ 
          error: 'Failed to create persona record' 
        });
      }
      
      personaId = insertResult.rows[0].id;
    }

    let savedCount = 0;
    for (const response of questionnaireResponses) {
      try {
        const insertResponseQuery = `
          INSERT INTO persona_questionnaires (persona_id, question_key, question_text, answer_text, answer_type)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (persona_id, question_key) 
          DO UPDATE SET 
            answer_text = EXCLUDED.answer_text,
            created_at = CURRENT_TIMESTAMP
        `;
        
        await pool.query(insertResponseQuery, [
          personaId,
          response.question_key,
          response.question_text,
          response.answer_text || '',
          response.answer_type || 'text'
        ]);
        savedCount++;
      } catch (error) {
        console.error('Error saving response:', response, error);
      }
    }

    await FileProcessors.cleanupFile(file.path);

    return res.json({
      message: 'Questionnaire file processed successfully',
      persona_id: personaId,
      file_name: file.originalname,
      file_size: file.size,
      responses_processed: questionnaireResponses.length,
      responses_saved: savedCount
    });

  } catch (error) {
    if (req.file) {
      await FileProcessors.cleanupFile(req.file.path);
    }
    console.error('Upload questionnaire error:', error);
    return res.status(500).json({ 
      error: 'Internal server error processing file upload' 
    });
  }
});

// Upload persona transcript file
router.post('/persona/transcript', authenticateToken, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = (req.user as any)?.userId;
    const file = req.file;

    const { source_url, source_type } = req.body;

    const artistQuery = `
      SELECT a.id as artist_id, p.id as persona_id 
      FROM artists a
      LEFT JOIN artist_personas p ON a.id = p.artist_id AND p.is_active = true
      WHERE a.user_id = $1
    `;
    const result = await pool.query(artistQuery, [userId]);
    
    if (result.rows.length === 0 || !result.rows[0].persona_id) {
      await FileProcessors.cleanupFile(file.path);
      return res.status(404).json({ 
        error: 'No persona found. Please create a persona first.' 
      });
    }

    const { persona_id } = result.rows[0];

    const processor = getFileProcessor(file.mimetype);
    let transcriptText: string;

    try {
      const content = await processor(file.path);
      transcriptText = typeof content === 'string' ? content : JSON.stringify(content);
    } catch (error) {
      await FileProcessors.cleanupFile(file.path);
      return res.status(400).json({ 
        error: `Error processing transcript file: ${error}` 
      });
    }

    const insertTranscriptQuery = `
      INSERT INTO persona_transcripts 
      (persona_id, transcript_text, source_url, source_type, processed_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      RETURNING id
    `;
    
    const transcriptResult = await pool.query(insertTranscriptQuery, [
      persona_id,
      transcriptText,
      source_url || `Uploaded file: ${file.originalname}`,
      source_type || 'uploaded_file'
    ]);

    await FileProcessors.cleanupFile(file.path);

    return res.json({
      message: 'Transcript uploaded successfully',
      transcript_id: transcriptResult.rows[0].id,
      persona_id: persona_id,
      file_name: file.originalname,
      file_size: file.size,
      transcript_length: transcriptText.length,
      source_type: source_type || 'uploaded_file'
    });

  } catch (error) {
    if (req.file) {
      await FileProcessors.cleanupFile(req.file.path);
    }
    console.error('Upload transcript error:', error);
    return res.status(500).json({ 
      error: 'Internal server error processing transcript upload' 
    });
  }
});

// Get uploaded files for user
router.get('/persona/files', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = (req.user as any)?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const query = `
      SELECT 
        pt.id,
        pt.source_url,
        pt.source_type,
        pt.processed_at,
        pt.created_at,
        LENGTH(pt.transcript_text) as transcript_length,
        p.persona_name,
        a.artist_name
      FROM persona_transcripts pt
      JOIN artist_personas p ON pt.persona_id = p.id
      JOIN artists a ON p.artist_id = a.id
      WHERE a.user_id = $1
      ORDER BY pt.created_at DESC
    `;

    const result = await pool.query(query, [userId]);

    return res.json({
      files: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Get files error:', error);
    return res.status(500).json({ 
      error: 'Internal server error fetching uploaded files' 
    });
  }
});

// Delete uploaded transcript
router.delete('/persona/transcript/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = (req.user as any)?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const transcriptId = req.params.id;

    const checkQuery = `
      SELECT pt.id
      FROM persona_transcripts pt
      JOIN artist_personas p ON pt.persona_id = p.id
      JOIN artists a ON p.artist_id = a.id
      WHERE pt.id = $1 AND a.user_id = $2
    `;

    const checkResult = await pool.query(checkQuery, [transcriptId, userId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Transcript not found or access denied' 
      });
    }

    const deleteQuery = 'DELETE FROM persona_transcripts WHERE id = $1';
    await pool.query(deleteQuery, [transcriptId]);

    return res.json({
      message: 'Transcript deleted successfully',
      transcript_id: transcriptId
    });

  } catch (error) {
    console.error('Delete transcript error:', error);
    return res.status(500).json({ 
      error: 'Internal server error deleting transcript' 
    });
  }
});

export default router;