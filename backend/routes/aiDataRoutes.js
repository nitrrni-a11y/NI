import express from 'express';
import {
  getSources,
  getTopics,
  getClaims,
  getClaimById,
  getNarratives,
  getNarrativeById,
  getProcessingStatus
} from '../controllers/aiDataController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Publicly available (to authenticated users)
router.get('/sources', protect, getSources);
router.get('/topics', protect, getTopics);
router.get('/claims', protect, getClaims);
router.get('/claims/:id', protect, getClaimById);
router.get('/narratives', protect, getNarratives);
router.get('/narratives/:id', protect, getNarrativeById);

// Admin only routes
router.get('/processing/status', protect, admin, getProcessingStatus);

export default router;
