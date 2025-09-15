import { Router, Request, Response } from 'express';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import pool from '../Config/connection';

const router = Router();

const artistSchema = Joi.object({
  artist_name: Joi.string().min(1).max(100).required(),
  real_name: Joi.string().min(1).max(100).required(),
  bio: Joi.string().max(2000).optional().allow(''),
  genre: Joi.string().max(50).optional().allow(''),
  location: Joi.string().max(100).optional().allow(''),
});

function authenticateToken(req: Request, res: Response, next: any): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err: any, user: any) => {
    if (err) {
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }
    (req as any).user = user;
    next();
  });
}

router.post('/profile', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { artist_name, real_name, bio, genre, location } = req.body;

    const { error } = artistSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: 'Validation error', details: error.details?.[0]?.message });
      return;
    }

    const result = await pool.query('SELECT user_id FROM artists WHERE user_id = $1', [userId]);

    if (result.rows.length > 0) {
      const updateQuery = `
        UPDATE artists
        SET artist_name = $1, real_name = $2, bio = $3, genre = $4, location = $5
        WHERE user_id = $6
        RETURNING *
      `;
      const updateResult = await pool.query(updateQuery, [
        artist_name,
        real_name,
        bio,
        genre,
        location,
        userId,
      ]);
      res.json({ message: 'Artist profile updated successfully', profile: updateResult.rows[0] });
      return;
    } else {
      const createQuery = `
        INSERT INTO artists (user_id, artist_name, real_name, bio, genre, location)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const createResult = await pool.query(createQuery, [
        userId,
        artist_name,
        real_name,
        bio,
        genre,
        location,
      ]);
      res.status(201).json({ message: 'Artist profile created successfully', profile: createResult.rows[0] });
      return;
    }
  } catch (error) {
    console.error('Artist profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
});

router.get('/profile', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;

    const result = await pool.query('SELECT * FROM artists WHERE user_id = $1', [userId]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Artist profile not found' });
      return;
    }

    res.json(result.rows[0]);
    return;
  } catch (error) {
    console.error('Get artist profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
});

export default router;