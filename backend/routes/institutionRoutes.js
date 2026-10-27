import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { startInstitutionScrape, getInstitutionJobs, getInstitutionOverview, getInstitutionDocuments } from '../controllers/institutionController.js';

const router = express.Router();
router.use(protect, admin);
router.get('/nit-raipur', getInstitutionOverview);
router.get('/nit-raipur/documents', getInstitutionDocuments);
router.get('/nit-raipur/jobs', getInstitutionJobs);
router.post('/nit-raipur/scrape', startInstitutionScrape);
export default router;
