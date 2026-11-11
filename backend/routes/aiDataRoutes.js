import express from 'express';
import {
  getSources,
  getNarratives,
  getNarrativeById,
  getDashboardHighlights,
  getProcessingStatus,
  getJobStatus,
  startProcessingJob,
  stopProcessingJob
} from '../controllers/aiDataController.js';
import { protect, optionalProtect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public / consumer routes (optionalProtect allows admins full visibility while scoping public/non-admins)
router.get('/sources', protect, getSources);
router.get('/narratives/highlights', optionalProtect, getDashboardHighlights);
router.get('/narratives', optionalProtect, getNarratives);
router.get('/narratives/:id', optionalProtect, getNarrativeById);

// Admin only routes
router.get('/processing/status', protect, admin, getProcessingStatus);
router.get('/processing/job-status', protect, admin, getJobStatus);
router.post('/processing/start', protect, admin, startProcessingJob);
router.post('/processing/stop', protect, admin, stopProcessingJob);

export default router;
