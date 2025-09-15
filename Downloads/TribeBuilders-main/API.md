UMG Social Assistant API Documentation
Team Alpha Backend Services
Base URL
Development: http://localhost:3000
Authentication
All protected endpoints require a JWT token in the Authorization header:

Authorization: Bearer <your_jwt_token>
Endpoints
Health Check
GET /health

Description: Check API status
Authentication: None
Response:
json
{
  "status": "OK",
  "message": "UMG Social Assistant API",
  "timestamp": "2025-09-01T12:00:00.000Z",
  "environment": "development"
}
User Management
Register User
POST /api/users/register

Description: Create new user account
Authentication: None
Body:
json
{
  "email": "artist@example.com",
  "password": "securepassword123"
}
Response:
json
{
  "message": "User registered successfully",
  "user": {
    "id": "uuid",
    "email": "artist@example.com",
    "created_at": "2025-09-01T12:00:00.000Z",
    "email_verified": false
  },
  "token": "jwt_token_here"
}
Login User
POST /api/users/login

Description: Authenticate user
Authentication: None
Body:
json
{
  "email": "artist@example.com",
  "password": "securepassword123"
}
Response:
json
{
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "email": "artist@example.com",
    "email_verified": false
  },
  "token": "jwt_token_here"
}
Get User Profile
GET /api/users/profile

Description: Get current user profile with artist data
Authentication: Required
Response:
json
{
  "user": {
    "id": "uuid",
    "email": "artist@example.com",
    "created_at": "2025-09-01T12:00:00.000Z",
    "email_verified": false,
    "last_login": "2025-09-01T12:00:00.000Z"
  },
  "artist": {
    "id": "uuid",
    "artist_name": "Amazing Artist",
    "real_name": "John Doe",
    "bio": "Singer-songwriter from Nashville",
    "genre": "Country Pop",
    "location": "Nashville, TN"
  }
}
Artist Management
Create/Update Artist Profile
POST /api/artists/profile

Description: Create or update artist profile
Authentication: Required
Body:
json
{
  "artist_name": "Amazing Artist",
  "real_name": "John Doe",
  "bio": "Singer-songwriter from Nashville creating heartfelt country-pop music",
  "genre": "Country Pop",
  "location": "Nashville, TN",
  "website_url": "https://amazingartist.com",
  "spotify_artist_id": "spotify_id_here"
}
Response:
json
{
  "message": "Artist profile saved successfully",
  "artist": {
    "id": "uuid",
    "user_id": "uuid",
    "artist_name": "Amazing Artist",
    "real_name": "John Doe",
    "bio": "Singer-songwriter from Nashville creating heartfelt country-pop music",
    "genre": "Country Pop",
    "location": "Nashville, TN",
    "website_url": "https://amazingartist.com",
    "spotify_artist_id": "spotify_id_here",
    "created_at": "2025-09-01T12:00:00.000Z",
    "updated_at": "2025-09-01T12:00:00.000Z"
  }
}
Get Artist Profile
GET /api/artists/profile

Description: Get current user's artist profile
Authentication: Required
Response:
json
{
  "artist": {
    "id": "uuid",
    "user_id": "uuid",
    "artist_name": "Amazing Artist",
    "real_name": "John Doe",
    "bio": "Singer-songwriter from Nashville",
    "genre": "Country Pop",
    "location": "Nashville, TN",
    "website_url": "https://amazingartist.com",
    "spotify_artist_id": "spotify_id_here",
    "created_at": "2025-09-01T12:00:00.000Z",
    "updated_at": "2025-09-01T12:00:00.000Z"
  }
}
Persona Management
Get Questionnaire Questions
GET /api/personas/questionnaire/questions

Description: Get predefined persona questionnaire questions
Authentication: Required
Response:
json
{
  "questions": [
    {
      "question_key": "musical_style",
      "question_text": "How would you describe your musical style and genre?",
      "answer_type": "text"
    },
    {
      "question_key": "target_audience", 
      "question_text": "Who is your ideal listener or fan?",
      "answer_type": "text"
    }
  ],
  "total": 8
}
Submit Questionnaire
POST /api/personas/questionnaire

Description: Submit persona questionnaire responses
Authentication: Required
Body:
json
{
  "responses": [
    {
      "question_key": "musical_style",
      "question_text": "How would you describe your musical style and genre?",
      "answer_text": "I create country-pop music with storytelling lyrics",
      "answer_type": "text"
    },
    {
      "question_key": "target_audience",
      "question_text": "Who is your ideal listener or fan?",
      "answer_text": "Young adults who appreciate authentic storytelling",
      "answer_type": "text"
    }
  ]
}
Response:
json
{
  "message": "Questionnaire responses saved successfully",
  "persona_id": "uuid",
  "responses_count": 2
}
Get Persona
GET /api/personas/persona

Description: Get artist persona with questionnaire responses
Authentication: Required
Response:
json
{
  "persona": {
    "id": "uuid",
    "persona_name": "Main Persona",
    "description": "Generated from questionnaire responses",
    "tone": "casual",
    "target_audience": "Young adults who appreciate authentic storytelling",
    "key_themes": ["storytelling", "authenticity"],
    "voice_characteristics": {},
    "created_at": "2025-09-01T12:00:00.000Z",
    "updated_at": "2025-09-01T12:00:00.000Z",
    "is_active": true
  },
  "artist_name": "Amazing Artist",
  "questionnaire_responses": [
    {
      "question_key": "musical_style",
      "question_text": "How would you describe your musical style and genre?",
      "answer_text": "I create country-pop music with storytelling lyrics",
      "answer_type": "text",
      "created_at": "2025-09-01T12:00:00.000Z"
    }
  ]
}
Error Responses
400 Bad Request
json
{
  "error": "Validation error",
  "details": "Email is required"
}
401 Unauthorized
json
{
  "error": "Access token required"
}
403 Forbidden
json
{
  "error": "Invalid or expired token"
}
404 Not Found
json
{
  "error": "Resource not found"
}
500 Internal Server Error
json
{
  "error": "Internal server error"
}
Data Models
User
json
{
  "id": "uuid",
  "email": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp",
  "email_verified": "boolean",
  "last_login": "timestamp"
}
Artist
json
{
  "id": "uuid",
  "user_id": "uuid",
  "artist_name": "string",
  "real_name": "string",
  "bio": "text",
  "genre": "string",
  "location": "string",
  "website_url": "string",
  "spotify_artist_id": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
Artist Persona
json
{
  "id": "uuid",
  "artist_id": "uuid",
  "persona_name": "string",
  "description": "text",
  "tone": "string",
  "target_audience": "text",
  "key_themes": ["string"],
  "voice_characteristics": "object",
  "created_at": "timestamp",
  "updated_at": "timestamp",
  "is_active": "boolean"
}
