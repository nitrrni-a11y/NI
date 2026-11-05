import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { 
  getDocuments, 
  getDocumentById, 
  addDocument, 
  deleteDocument, 
  bulkDeleteDocuments, 
  extractYouTube,
  ingestYouTube
} from '../controllers/documentController.js';
import { 
  extractLinkedIn, 
  ingestLinkedIn,
  discoverLinkedInOpinions,
  ingestDiscoveredLinkedIn,
  generateYouTubeQueries,
  discoverYouTubeReviews,
  ingestDiscoveredYouTube
} from '../controllers/scraperController.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.route('/')
  .get(protect, getDocuments)
  .post(protect, admin, addDocument);

router.post('/youtube/extract', protect, admin, extractYouTube);
router.post('/youtube/ingest', protect, admin, ingestYouTube);
router.post('/youtube/generate-queries', protect, admin, generateYouTubeQueries);
router.post('/youtube/discover', protect, admin, discoverYouTubeReviews);
router.post('/youtube/discover/ingest', protect, admin, ingestDiscoveredYouTube);

router.post('/linkedin/extract', protect, admin, extractLinkedIn);
router.post('/linkedin/ingest', protect, admin, ingestLinkedIn);

router.post('/linkedin/discover', protect, admin, discoverLinkedInOpinions);
router.post('/linkedin/discover/ingest', protect, admin, ingestDiscoveredLinkedIn);

router.post('/upload', protect, admin, upload.single('file'), async (req, res, next) => {
  const { uploadCsv } = await import('../controllers/documentController.js');
  uploadCsv(req, res, next);
});

router.post('/bulk-delete', protect, admin, bulkDeleteDocuments);

router.route('/:id')
  .get(protect, getDocumentById)
  .delete(protect, admin, deleteDocument);

export default router;
