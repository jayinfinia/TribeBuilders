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
const artistSchema = joi_1.default.object({
    artist_name: joi_1.default.string().min(1).max(100).required(),
    real_name: joi_1.default.string().min(1).max(100).required(),
    bio: joi_1.default.string().max(2000).optional().allow(''),
    genre: joi_1.default.string().max(50).optional().allow(''),
    location: joi_1.default.string().max(100).optional().allow(''),
});
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) {
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
router.post('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { artist_name, real_name, bio, genre, location } = req.body;
        const { error } = artistSchema.validate(req.body);
        if (error) {
            res.status(400).json({ details: error.details?.[0]?.message });
            return;
        }
        const result = await connection_1.default.query('SELECT user_id FROM artists WHERE user_id = $1', [userId]);
        if (result.rows.length > 0) {
            const updateQuery = `
        UPDATE artists
        SET artist_name = $1, real_name = $2, bio = $3, genre = $4, location = $5
        WHERE user_id = $6
        RETURNING *
      `;
            const updateResult = await connection_1.default.query(updateQuery, [
                artist_name,
                real_name,
                bio,
                genre,
                location,
                userId,
            ]);
            res.json({ message: 'Artist profile updated successfully', profile: updateResult.rows[0] });
            return;
        }
        else {
            const createQuery = `
        INSERT INTO artists (user_id, artist_name, real_name, bio, genre, location)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
            const createResult = await connection_1.default.query(createQuery, [
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
    }
    catch (error) {
        console.error('Artist profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
        return;
    }
});
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await connection_1.default.query('SELECT * FROM artists WHERE user_id = $1', [userId]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Artist profile not found' });
            return;
        }
        res.json(result.rows[0]);
        return;
    }
    catch (error) {
        console.error('Get artist profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
        return;
    }
});
exports.default = router;
//# sourceMappingURL=artists.js.map