import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { scrapeAndIngestNews, previewNews } from '../controllers/scraperController.js';

const router = express.Router();

router.post('/scrape', protect, admin, scrapeAndIngestNews);
router.post('/preview', protect, admin, previewNews);

export default router;
