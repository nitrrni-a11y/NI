import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import aiDataRoutes from './routes/aiDataRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import entityRoutes from './routes/entityRoutes.js';
import topicRoutes from './routes/topicRoutes.js';
import domainRoutes from './routes/domainRoutes.js';

dotenv.config();

connectDB();

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.ADMIN_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/data', documentRoutes); // Alias for documents
app.use('/api/admin', adminRoutes);
app.use('/api/entities', entityRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api', aiDataRoutes); // Exposes /api/sources, /api/topics, etc.

app.get('/', (req, res) => {
  res.send('API is running...');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));