import express from 'express';
import { getDomains, addDomain, updateDomain, deleteDomain } from '../controllers/domainController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getDomains)
  .post(protect, addDomain);

router.route('/:id')
  .put(protect, updateDomain)
  .delete(protect, deleteDomain);

export default router;
