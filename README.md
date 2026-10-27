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

## NIT Raipur institutional collection

The admin application has a manual collection page at **Education → NIT Raipur → Institution Intelligence**. It is admin-only and creates one collection job per click; no scheduled or startup scraping is configured. The page reads source documents and analysis narratives through the Express API.

Optional backend settings (all have defaults):

```env
NITRR_SITE_URL=https://www.nitrr.ac.in/
NITRR_MAX_PAGES=30
GDELT_DOC_URL=https://api.gdeltproject.org/api/v2/doc/doc
GDELT_QUERIES='"NIT Raipur";NITRR Raipur'
GDELT_MAX_RECORDS=50
AI_SERVICE_URL=http://localhost:8000
```

The official-site collector follows same-domain links and basic `robots.txt` disallow rules, with bounded page and response sizes. It extracts HTML text; PDF links are saved as metadata-only because this project does not currently include a PDF text parser. GDELT DOC 2.0 is queried over its rolling recent-news window and normally provides article metadata rather than article text. The existing FastAPI `/process/batch` service analyzes newly collected documents only when extracted text is available. Start the backend, MongoDB, AI service, and admin Vite app as usual; no external service is called until the admin starts a scrape.

If official-site requests fail with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, Node.js cannot validate the certificate chain presented on that machine. Keep TLS verification enabled. On Windows, Node.js v22.15+ supports `--use-system-ca`; start the backend with that flag when the required CA is trusted by Windows. Alternatively, set `NODE_EXTRA_CA_CERTS` to a trusted PEM CA bundle **before** starting Node. This setting is read at process startup, so placing it only in `backend/.env` is too late.

## Future Features (Next Phase)

The "Processing" section in the Admin Dashboard is currently a placeholder. Future iterations will include:

- Automated web scraping
- NLP Entity Extraction
- Sentiment & Stance Analysis
- Topic Modeling and Narrative Clustering
- LLM Integrations
