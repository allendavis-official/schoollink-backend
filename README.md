# SchoolLink Backend API

Liberian School Management System - Backend API

## Features

- 🏫 Multi-tenant school management
- 👨‍🎓 Student Information System (SIS)
- 👨‍🏫 Teacher & Staff Management
- 📚 Academic Year Configuration (Liberian 2-semester model)
- 🎯 Class & Subject Management
- 🔐 JWT-based authentication
- 📊 Role-based access control
- 📝 Audit logging
- 🔒 Security best practices

## Tech Stack

- Node.js + Express
- PostgreSQL
- JWT Authentication
- bcrypt for password hashing

## Getting Started

### Prerequisites

- Node.js >= 18
- PostgreSQL >= 14
- npm >= 9

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. Create the database:
```bash
createdb schoollink
```

4. Run database migrations:
```bash
psql -U postgres -d schoollink -f schema.sql
```

5. Start the development server:
```bash
npm run dev
```

The API will be available at `http://localhost:5000/api/v1`

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh-token` - Refresh access token
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/profile` - Get user profile
- `PUT /api/v1/auth/profile` - Update profile
- `PUT /api/v1/auth/change-password` - Change password

### Schools
- `POST /api/v1/schools` - Create school (Super Admin)
- `GET /api/v1/schools` - Get all schools
- `GET /api/v1/schools/:id` - Get school by ID
- `PUT /api/v1/schools/:id` - Update school
- `DELETE /api/v1/schools/:id` - Delete school
- `GET /api/v1/schools/:schoolId/dashboard` - Get dashboard stats

### Academic Years
- `POST /api/v1/academic/years` - Create academic year
- `GET /api/v1/academic/years` - Get all academic years
- `GET /api/v1/academic/years/:id` - Get academic year details
- `PUT /api/v1/academic/years/:id/set-current` - Set as current year
- `PUT /api/v1/academic/semesters/:id/set-current` - Set current semester
- `PUT /api/v1/academic/periods/:id/toggle-lock` - Lock/unlock period
- `POST /api/v1/academic/grading-config` - Update grading config
- `GET /api/v1/academic/grading-config` - Get grading config

### Students
- `POST /api/v1/students` - Create student
- `GET /api/v1/students` - Get all students
- `GET /api/v1/students/:id` - Get student details
- `PUT /api/v1/students/:id` - Update student
- `POST /api/v1/students/enroll` - Enroll student in class

### Teachers
- `POST /api/v1/teachers` - Create teacher
- `GET /api/v1/teachers` - Get all teachers
- `GET /api/v1/teachers/:id` - Get teacher details
- `PUT /api/v1/teachers/:id` - Update teacher

### Classes & Subjects
- `POST /api/v1/classes` - Create class
- `GET /api/v1/classes` - Get all classes
- `POST /api/v1/classes/subjects` - Create subject
- `GET /api/v1/classes/subjects` - Get all subjects
- `POST /api/v1/classes/assign-subject` - Assign subject to class
- `GET /api/v1/classes/:classId/subjects` - Get class subjects

## Database Schema

The database follows a multi-tenant architecture with these main tables:
- schools
- users
- academic_years
- semesters
- assessment_periods
- students
- teachers
- classes
- subjects
- student_enrollments
- class_subjects
- grading_config

## Security

- Passwords are hashed using bcrypt
- JWT tokens for authentication
- Rate limiting on API endpoints
- Input sanitization
- CORS configuration
- Helmet for security headers
- Role-based access control

## Testing

```bash
npm test
```

## Production Deployment

```bash
npm start
```

## License

MIT
