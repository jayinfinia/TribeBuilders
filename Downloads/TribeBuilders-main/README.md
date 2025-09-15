# UMG Artist Social Media Assistant API - TribeBuilders

A comprehensive Node.js/TypeScript API for artist social media management with AI-powered content generation and robust file upload capabilities.

## ✨ Features

- 🔐 **User Authentication** - JWT-based auth with bcrypt password hashing
- 🎨 **Artist Profile Management** - Complete artist profile CRUD operations
- 🤖 **AI Content Generation** - HuggingFace and OpenAI integration for social media content
- 📁 **File Upload System** - Support for JSON, CSV, PDF, and text file uploads
- 📊 **Persona Management** - Dynamic persona creation from questionnaire uploads
- 🧪 **Comprehensive Testing** - 60+ tests with full coverage (all passing)
- 📚 **API Documentation** - Swagger/OpenAPI documentation
- 🛡️ **Security Features** - Rate limiting, CORS, helmet, input validation

## 🚀 Quick Setup

### 1️⃣ Clone Repository
```bash
git clone https://github.com/jayinfinia/TribeBuilders.git
cd TribeBuilders
```

### 2️⃣ Install Dependencies
```bash
npm install
```

### 3️⃣ Environment Configuration
Create a `.env` file with your database credentials:
```env
DATABASE_URL=your_postgresql_connection_string
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anonymous_key
JWT_SECRET=your_jwt_secret_key
NODE_ENV=development
PORT=3000
```

### 4️⃣ Database Setup
Run the schema migration in your Supabase SQL editor:
```sql
-- Run src/database/001_initial_schema.sql
```

### 5️⃣ Start Development Server
```bash
npm run dev
```

### 6️⃣ Test the API
```bash
# Test health endpoint
curl http://localhost:3000/health

# Run test suite
npm test
```

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build TypeScript to JavaScript |
| `npm start` | Start production server |
| `npm test` | Run test suite (60+ tests) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

## 📂 Project Structure

```
src/
├── Config/
│   ├── connection.ts           # Database connection
│   ├── upload.ts              # File upload configuration
│   └── swagger.ts             # API documentation setup
├── routes/
│   ├── users.ts               # User authentication
│   ├── artists.ts             # Artist profile management
│   ├── personas.ts            # Persona management
│   ├── uploads.ts             # File upload endpoints
│   └── content.ts             # AI content generation
├── middleware/
│   └── authenticateToken.ts   # JWT authentication middleware
├── services/
│   ├── aiService.ts           # AI integration service
│   ├── uploadService.ts       # File processing service
│   └── templateService.ts     # Content template service
├── __tests__/
│   ├── api.test.ts            # API endpoint tests
│   ├── upload.test.ts         # File upload tests
│   ├── content.test.ts        # Content generation tests
│   └── setup.ts               # Test configuration
└── app.ts                     # Main application file
```

## 🧪 API Testing Examples

### User Authentication
```bash
# Register a user
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Artist Profile Management
```bash
# Create artist profile (use token from login)
curl -X POST http://localhost:3000/api/artists/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"artist_name":"Test Artist","genre":"Pop"}'
```

### File Upload (New!)
```bash
# Upload questionnaire file (JSON/CSV supported)
curl -X POST http://localhost:3000/api/uploads/persona/questionnaire \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@questionnaire.json"

# Upload transcript file
curl -X POST http://localhost:3000/api/uploads/persona/transcript \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@transcript.txt" \
  -F "source_type=podcast"

# List uploaded files
curl -X GET http://localhost:3000/api/uploads/persona/files \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### AI Content Generation
```bash
# Generate social media content
curl -X POST http://localhost:3000/api/content/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"content_type":"social_post","platform":"instagram","topic":"new song release"}'
```

## 🔑 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `SUPABASE_URL` | Your Supabase project URL | ✅ |
| `SUPABASE_ANON_KEY` | Your Supabase anonymous key | ✅ |
| `JWT_SECRET` | Secret for signing JWT tokens | ✅ |
| `NODE_ENV` | Environment (development/production) | ❌ |
| `PORT` | Server port (default: 3000) | ❌ |

## 🆕 Recent Updates & Bug Fixes

### Upload Functionality Improvements
- ✅ **Fixed critical null pointer bug** in persona creation
- ✅ **Improved database query handling** with proper null checks
- ✅ **Enhanced CSV file processing** with better error handling
- ✅ **Comprehensive test coverage** for all upload scenarios
- ✅ **Robust error handling** for edge cases

### Test Suite Enhancements
- 🧪 **60+ tests passing** (previously had failing tests)
- 🔧 **Fixed test mocking** for file upload scenarios
- 📊 **Full coverage** of upload, authentication, and content generation

## 🛠️ Troubleshooting

### Database Connection Issues
- Verify your `DATABASE_URL` is correct
- Check if Supabase project is active
- Ensure database accepts connections from your IP

### JWT Token Issues
- Make sure `JWT_SECRET` is set in `.env`
- Check token format: `"Bearer <token>"`
- Verify token hasn't expired (7 days default)

### File Upload Issues
- Check file size limits (10MB max)
- Verify supported file types: JSON, CSV, PDF, TXT, MD
- Ensure proper authentication headers

### Port Already in Use
```bash
# Change PORT in .env file or kill existing process
lsof -ti:3000 | xargs kill
```

## 📚 API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:3000/api-docs
- **OpenAPI JSON**: http://localhost:3000/api-docs.json

## 🏗️ Built With

- **Node.js** - Runtime environment
- **TypeScript** - Type-safe JavaScript
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **Supabase** - Database hosting & real-time features
- **JWT** - Authentication
- **Multer** - File upload handling
- **Jest** - Testing framework
- **Swagger** - API documentation
- **HuggingFace & OpenAI** - AI integration

## 📄 License

ISC License - see package.json for details

## 👥 Team

**Team Alpha - NextGenHSV**

---
🤖 *This project includes comprehensive debugging and testing improvements for production-ready file upload functionality.*