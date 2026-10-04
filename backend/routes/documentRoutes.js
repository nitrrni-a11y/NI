import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { getDocuments, getDocumentById, addDocument, deleteDocument, bulkDeleteDocuments } from '../controllers/documentController.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.route('/')
  .get(protect, getDocuments)
  .post(protect, admin, addDocument);

router.post('/upload', protect, admin, upload.single('file'), async (req, res, next) => {
  const { uploadCsv } = await import('../controllers/documentController.js');
  uploadCsv(req, res, next);
});

router.post('/bulk-delete', protect, admin, bulkDeleteDocuments);

router.route('/:id')
  .get(protect, getDocumentById)
  .delete(protect, admin, deleteDocument);

export default router;
