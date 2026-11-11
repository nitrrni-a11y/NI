import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import aiDataRoutes from './routes/aiDataRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import entityRoutes from './routes/entityRoutes.js';
import topicRoutes from './routes/topicRoutes.js';
import domainRoutes from './routes/domainRoutes.js';
import scraperRoutes from './routes/scraperRoutes.js';
import { reconcileInterruptedJobs, normalizeExistingNarrativesAndTopics, reconcileJobDocumentCounts } from './controllers/aiDataController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is loaded from backend directory regardless of process cwd
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config();

connectDB().then(() => {
  reconcileInterruptedJobs().catch(err => console.error('Startup reconciliation error:', err));
  reconcileJobDocumentCounts().catch(err => console.error('Startup job counts reconciliation error:', err));
  normalizeExistingNarrativesAndTopics().catch(err => console.error('Startup normalization error:', err));
});

const app = express();
app.set('trust proxy', 1);

const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/+$/, '');

const envOrigins = [process.env.ADMIN_URL, process.env.FRONTEND_URL]
  .filter(Boolean)
  .flatMap((val) => String(val).split(','))
  .map(normalizeOrigin)
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([
  'http://localhost:5174',
  'http://localhost:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5173',
  ...envOrigins,
]));

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server, or same-origin proxy)
    if (!origin || allowedOrigins.includes(normalizeOrigin(origin))) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200,
};

// CORS middleware registered before all API routes
app.use(cors(corsOptions));
// Handle preflight OPTIONS requests across all routes (Express 5 syntax)
app.options('{*path}', cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/data', documentRoutes); // Alias for documents
app.use('/api/admin', adminRoutes);
app.use('/api/entities', entityRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/scraper', scraperRoutes);
app.use('/api', aiDataRoutes); // Exposes /api/sources, /api/topics, etc.

app.get('/', (req, res) => {
  res.send('API is running...');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
