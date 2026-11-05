import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { 
  scrapeAndIngestNews, 
  previewNews,
  extractLinkedIn,
  ingestLinkedIn,
  discoverLinkedInOpinions,
  ingestDiscoveredLinkedIn,
  generateYouTubeQueries,
  discoverYouTubeReviews,
  ingestDiscoveredYouTube
} from '../controllers/scraperController.js';

const router = express.Router();

router.post('/scrape', protect, admin, scrapeAndIngestNews);
router.post('/preview', protect, admin, previewNews);

// Feature 1: Specific LinkedIn Post & Comments Scraper routes
router.post('/linkedin/extract', protect, admin, extractLinkedIn);
router.post('/linkedin/ingest', protect, admin, ingestLinkedIn);

// Feature 2: LinkedIn Opinion Discovery routes
router.post('/linkedin/discover', protect, admin, discoverLinkedInOpinions);
router.post('/linkedin/discover/ingest', protect, admin, ingestDiscoveredLinkedIn);

// Feature 3: YouTube Review Discovery routes
router.post('/youtube/generate-queries', protect, admin, generateYouTubeQueries);
router.post('/youtube/discover', protect, admin, discoverYouTubeReviews);
router.post('/youtube/discover/ingest', protect, admin, ingestDiscoveredYouTube);

export default router;
