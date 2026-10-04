import express from 'express';
import {
  getSources,
  getNarratives,
  getNarrativeById,
  getProcessingStatus,
  getJobStatus,
  startProcessingJob,
  stopProcessingJob
} from '../controllers/aiDataController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Publicly available (to authenticated users)
router.get('/sources', protect, getSources);
router.get('/narratives', protect, getNarratives);
router.get('/narratives/:id', protect, getNarrativeById);

// Admin only routes
router.get('/processing/status', protect, admin, getProcessingStatus);
router.get('/processing/job-status', protect, admin, getJobStatus);
router.post('/processing/start', protect, admin, startProcessingJob);
router.post('/processing/stop', protect, admin, stopProcessingJob);

export default router;
