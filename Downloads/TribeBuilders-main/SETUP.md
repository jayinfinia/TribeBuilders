UMG Social Assistant API Setup Guide
Team Alpha Backend Development
Prerequisites
Node.js 18+ installed
PostgreSQL or Supabase account
Git for version control
Quick Setup Steps
Clone Repository
bash
git clone <your-repo-url>
cd umg-social-assistant-api
Install Dependencies
bash
npm install
Environment Configuration Copy the .env file contents and update with your actual database credentials:
bash
cp .env.example .env
# Edit .env with your actual database URL and secrets
Database Setup Run the schema migration:
bash
# If using Supabase, run this in your Supabase SQL editor
# Or connect to your PostgreSQL and run:
psql -d your_database -f src/database/001_initial_schema.sql
Start Development Server
bash
npm run dev
Test the API
bash
# Test health endpoint
curl http://localhost:3000/health

# Or visit in browser: http://localhost:3000/health
Available Scripts
npm run dev - Start development server with hot reload
npm run build - Build TypeScript to JavaScript
npm start - Start production server
npm test - Run tests
npm run test:watch - Run tests in watch mode
Project Structure
src/
├── config/
│   └── connection.ts     # Database connection
├── routes/
│   ├── users.ts         # User authentication
│   ├── artists.ts       # Artist profile management  
│   └── personas.ts      # Persona questionnaires
├── database/
│   └── 001_initial_schema.sql  # Database schema
├── __tests__/
│   └── api.test.ts      # Basic tests
└── app.ts               # Main application file
Testing the API
Register a User
bash
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
Login
bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
Create Artist Profile (use token from login)
bash
curl -X POST http://localhost:3000/api/artists/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"artist_name":"Test Artist","genre":"Pop"}'
Environment Variables Explained
DATABASE_URL - PostgreSQL connection string
SUPABASE_URL - Your Supabase project URL
SUPABASE_ANON_KEY - Your Supabase anonymous key
JWT_SECRET - Secret for signing JWT tokens
NODE_ENV - Environment (development/production)
PORT - Server port (default: 3000)
Next Steps for Week 2
AI Integration Setup
Get Hugging Face API key
Set up OpenAI API key for future use
Test basic AI content generation
File Upload System
Implement file upload for persona transcripts
Add multer configuration for file handling
Enhanced Validation
Add more robust input validation
Implement rate limiting
Add request logging
Database Optimization
Add connection pooling configuration
Implement database transactions
Add database health checks
Troubleshooting
Database Connection Issues:

Verify your DATABASE_URL is correct
Check if Supabase project is active
Ensure database accepts connections from your IP
JWT Token Issues:

Make sure JWT_SECRET is set in .env
Check token format: "Bearer <token>"
Verify token hasn't expired (7 days default)
Port Already in Use:

Change PORT in .env file
Or kill existing process: lsof -ti:3000 | xargs kill
