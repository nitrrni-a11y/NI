import express from 'express';
import { getNews, getNewsById, addNews } from '../controllers/newsController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getNews)
  .post(protect, admin, addNews);

router.route('/:id')
  .get(protect, getNewsById);

export default router;
