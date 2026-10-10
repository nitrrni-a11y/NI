import express from 'express';
import { getTopics } from '../controllers/topicController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getTopics);

export default router;
