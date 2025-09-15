"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const joi_1 = __importDefault(require("joi"));
const connection_1 = __importDefault(require("../Config/connection"));
const router = (0, express_1.Router)();
const registerSchema = joi_1.default.object({
    email: joi_1.default.string().email().required(),
    password: joi_1.default.string().min(6).required(),
});
const loginSchema = joi_1.default.object({
    email: joi_1.default.string().email().required(),
    password: joi_1.default.string().required(),
});
router.post('/register', async (req, res) => {
    try {
        const { error, value } = registerSchema.validate(req.body);
        if (error) {
            res.status(400).json({
                error: 'Validation error',
                details: error.details?.[0]?.message,
            });
            return;
        }
        const { email, password } = value;
        const existingUserQuery = 'SELECT id FROM users WHERE email = $1';
        const existingUser = await connection_1.default.query(existingUserQuery, [email]);
        if (existingUser.rows.length > 0) {
            res.status(409).json({
                error: 'User already exists with this email',
            });
            return;
        }
        const saltRounds = 12;
        const hashedPassword = await bcryptjs_1.default.hash(password, saltRounds);
        const insertUserQuery = `
      INSERT INTO users (email, password_hash) 
      VALUES ($1, $2) 
      RETURNING id, email, created_at, email_verified
    `;
        const result = await connection_1.default.query(insertUserQuery, [email, hashedPassword]);
        const newUser = result.rows[0];
        const token = jsonwebtoken_1.default.sign({ userId: newUser.id, email: newUser.email }, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '7d' });
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
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            error: 'Internal server error during registration',
        });
    }
});
router.post('/login', async (req, res) => {
    try {
        const { error, value } = loginSchema.validate(req.body);
        if (error) {
            res.status(400).json({
                error: 'Validation error',
                details: error.details?.[0]?.message,
            });
            return;
        }
        const { email, password } = value;
        const userQuery = 'SELECT id, email, password_hash, email_verified FROM users WHERE email = $1';
        const userResult = await connection_1.default.query(userQuery, [email]);
        if (userResult.rows.length === 0) {
            res.status(401).json({
                error: 'Invalid email or password',
            });
            return;
        }
        const user = userResult.rows[0];
        const isValidPassword = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isValidPassword) {
            res.status(401).json({
                error: 'Invalid email or password',
            });
            return;
        }
        const updateLoginQuery = 'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1';
        await connection_1.default.query(updateLoginQuery, [user.id]);
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '7d' });
        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                email_verified: user.email_verified,
            },
            token,
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Internal server error during login',
        });
    }
});
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const userQuery = `
      SELECT u.id, u.email, u.created_at, u.email_verified, u.last_login,
             a.id as artist_id, a.artist_name, a.real_name, a.bio, a.genre, a.location
      FROM users u
      LEFT JOIN artists a ON u.id = a.user_id
      WHERE u.id = $1
    `;
        const result = await connection_1.default.query(userQuery, [userId]);
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
    }
    catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({
            error: 'Internal server error fetching profile',
        });
    }
});
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
exports.default = router;
//# sourceMappingURL=users.js.map