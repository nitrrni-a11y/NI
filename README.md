# Narrative Intelligence for NIT Raipur

This is the initial foundation for the Narrative Intelligence web application, built using the MERN stack (MongoDB, Express, React, Node.js). 
In this phase, the application focuses purely on data collection and user management, establishing the infrastructure needed before integrating AI/NLP processing in the next phase.

## Tech Stack

**Frontend:**
- React (Vite)
- React Router DOM
- Axios for API requests
- Vanilla CSS for styling (Premium & Clean Architecture)

**Backend:**
- Node.js & Express.js
- MongoDB with Mongoose
- JSON Web Token (JWT) + HTTP-Only Cookies for Authentication
- Bcrypt for password hashing

## Folder Structure

```
project/
├── backend/
│   ├── config/          # Database configuration
│   ├── controllers/     # API route handlers
│   ├── middleware/      # Authentication & Authorization
│   ├── models/          # Mongoose schemas (User, News)
│   ├── routes/          # Express route definitions
│   ├── scripts/         # Utility scripts (create-admin)
│   └── server.js        # Entry point
└── frontend/
    ├── src/
    │   ├── components/  # Reusable UI elements (Navbar, Cards, ProtectedRoutes)
    │   ├── context/     # Global state (AuthContext)
    │   ├── pages/       # Application views (Landing, Auth, Dashboard, Admin)
    │   ├── services/    # API interaction layer
    │   ├── App.jsx      # Main router
    │   └── index.css    # Global stylesheet
```

## Environment Variables

### Backend (`backend/.env`)

Create a `.env` file in the `backend/` directory:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/nitr_narrative
JWT_SECRET=super_secret_jwt_key_change_in_production
FRONTEND_URL=http://localhost:5173
ADMIN_EMAIL=admin@nitrr.ac.in
ADMIN_PASSWORD=adminpassword
ADMIN_NAME=Super Admin
```

*(Note: Replace `MONGODB_URI` if you are using MongoDB Atlas.)*

## Installation & Setup

1. **Install Backend Dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Install Frontend Dependencies**
   ```bash
   cd frontend
   npm install
   ```

3. **Initialize Admin Account**
   Run the seed script in the backend directory to create the first admin user using the credentials from `.env`:
   ```bash
   cd backend
   npm run create-admin
   ```

## Running the Application

**Start the Backend Server (Port 5000):**
```bash
cd backend
npm run dev
```

**Start the Frontend Server (Port 5173):**
```bash
cd frontend
npm run dev
```

## Available API Routes

### Auth (`/api/auth`)
- `POST /register` - Register a new user
- `POST /login` - Login user & receive HTTP-Only cookie
- `POST /logout` - Logout user & clear cookie
- `GET /me` - Get current user profile (Protected)

### News/Data (`/api/news`)
- `GET /` - Get all uploaded data (Protected)
- `GET /:id` - Get a single data item (Protected)
- `POST /` - Add a new data entry (Admin Only)

## Future Features (Next Phase)

The "Processing" section in the Admin Dashboard is currently a placeholder. Future iterations will include:
- Automated web scraping
- NLP Entity Extraction
- Sentiment & Stance Analysis
- Topic Modeling and Narrative Clustering
- LLM Integrations

## Future Features (Next Phase)

The "Processing" section in the Admin Dashboard is currently a placeholder. Future iterations will include:

- Automated web scraping
- NLP Entity Extraction
- Sentiment & Stance Analysis
- Topic Modeling and Narrative Clustering
- LLM Integrations