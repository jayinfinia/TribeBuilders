import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import pool from '../Config/connection';

const router = Router();

/* ---------------------------------------------------
   🔹 Validation Schemas
--------------------------------------------------- */
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

/* ---------------------------------------------------
   🔹 User Registration
--------------------------------------------------- */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    // ✅ Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: 'Validation error',
        details: error.details?.[0]?.message,
      });
      return;
    }

    const { email, password } = value;

    // ✅ Check if user already exists
    const existingUserQuery = 'SELECT id FROM users WHERE email = $1';
    const existingUser = await pool.query(existingUserQuery, [email]);

    if (existingUser.rows.length > 0) {
      res.status(409).json({
        error: 'User already exists with this email',
      });
      return;
    }

    // ✅ Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // ✅ Insert new user
    const insertUserQuery = `
      INSERT INTO users (email, password_hash) 
      VALUES ($1, $2) 
      RETURNING id, email, created_at, email_verified
    `;

    const result = await pool.query(insertUserQuery, [email, hashedPassword]);
    const newUser = result.rows[0];

    // ✅ Generate JWT token
    const token = jwt.sign(
      { userId: newUser.id, email: newUser.email },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        created_at: newUser.created_at,
        email_verified: newUser.email_verified,
      },
      token,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal server error during registration',
    });
  }
});

/* ---------------------------------------------------
   🔹 User Login
--------------------------------------------------- */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    // ✅ Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: 'Validation error',
        details: error.details?.[0]?.message,
      });
      return;
    }

    const { email, password } = value;

    // ✅ Find user
    const userQuery =
      'SELECT id, email, password_hash, email_verified FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      res.status(401).json({
        error: 'Invalid email or password',
      });
      return;
    }

    const user = userResult.rows[0];

    // ✅ Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({
        error: 'Invalid email or password',
      });
      return;
    }

    // ✅ Update last login
    const updateLoginQuery =
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1';
    await pool.query(updateLoginQuery, [user.id]);

    // ✅ Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        email_verified: user.email_verified,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal server error during login',
    });
  }
});

/* ---------------------------------------------------
   🔹 Get User Profile (Protected Route)
--------------------------------------------------- */
router.get('/profile', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;

    const userQuery = `
      SELECT u.id, u.email, u.created_at, u.email_verified, u.last_login,
             a.id as artist_id, a.artist_name, a.real_name, a.bio, a.genre, a.location
      FROM users u
      LEFT JOIN artists a ON u.id = a.user_id
      WHERE u.id = $1
    `;

    const result = await pool.query(userQuery, [userId]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const userData = result.rows[0];
    res.json({
      user: {
        id: userData.id,
        email: userData.email,
        created_at: userData.created_at,
        email_verified: userData.email_verified,
        last_login: userData.last_login,
      },
      artist: userData.artist_id
        ? {
            id: userData.artist_id,
            artist_name: userData.artist_name,
            real_name: userData.real_name,
            bio: userData.bio,
            genre: userData.genre,
            location: userData.location,
          }
        : null,
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      error: 'Internal server error fetching profile',
    });
  }
});

/* ---------------------------------------------------
   🔹 JWT Authentication Middleware
--------------------------------------------------- */
function authenticateToken(req: Request, res: Response, next: any): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || 'fallback-secret',
    (err: any, user: any) => {
      if (err) {
        res.status(403).json({ error: 'Invalid or expired token' });
        return;
      }
      (req as any).user = user;
      next();
    }
  );
}

export default router;
