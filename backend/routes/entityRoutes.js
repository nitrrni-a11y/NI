import express from 'express';
import {
  getEntities,
  getEntityById,
  createEntity,
  updateEntity,
  deleteEntity
} from '../controllers/entityController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getEntities)
  .post(protect, admin, createEntity);

router.route('/:id')
  .get(protect, getEntityById)
  .put(protect, admin, updateEntity)
  .delete(protect, admin, deleteEntity);

export default router;
