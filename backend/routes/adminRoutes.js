import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import User from '../models/User.js';
import Narrative from '../models/Narrative.js';
import { reclassifyAllNarratives, getAttentionHighlightsForEntity } from '../controllers/aiDataController.js';

const router = express.Router();

router.get('/narratives', protect, admin, async (req, res) => {
  try {
    const query = req.query.entity_id ? { entityId: req.query.entity_id } : {};
    if (req.query.status === 'candidate') {
      query.isEligibleForDisplay = false;
    } else if (req.query.status === 'established') {
      query.isEligibleForDisplay = { $ne: false };
    }

    if (req.query.direction && req.query.direction !== 'all') {
      query.direction = req.query.direction;
    }
    if (req.query.priority && req.query.priority !== 'all') {
      query.priority = req.query.priority;
    }
    if (req.query.positive_significance && req.query.positive_significance !== 'all') {
      query.positiveSignificance = req.query.positive_significance;
    }

    const narratives = await Narrative.find(query).sort({ severityLevel: -1, lastObservedAt: -1 });
    res.json(narratives);
  } catch (error) {
    res.status(500).json({ message: 'Could not fetch narratives.' });
  }
});

// @desc    Get entity narratives requiring attention (Negative critical/high + Positive highlights)
// @route   GET /api/admin/dashboard/attention-narratives
// @access  Private/Admin
router.get('/dashboard/attention-narratives', protect, admin, async (req, res) => {
  try {
    const { entity_id } = req.query;
    if (!entity_id) {
      return res.status(400).json({ message: 'entity_id is required' });
    }

    const { negative, positive } = await getAttentionHighlightsForEntity(entity_id, { excludeModerated: false });

    res.json({
      entityId: entity_id,
      negative,
      positive
    });
  } catch (error) {
    console.error('Error fetching dashboard attention narratives:', error);
    res.status(500).json({ message: 'Could not fetch dashboard attention narratives.' });
  }
});

// @desc    Reclassify all narratives or entity narratives
// @route   POST /api/admin/narratives/reclassify
// @access  Private/Admin
router.post('/narratives/reclassify', protect, admin, async (req, res) => {
  try {
    const { entity_id } = req.body;
    const count = await reclassifyAllNarratives(entity_id);
    res.json({ success: true, reclassifiedCount: count });
  } catch (err) {
    console.error('Reclassification error:', err);
    res.status(500).json({ message: 'Error reclassifying narratives: ' + err.message });
  }
});

const reviewNarratives = async (req, res, status) => {
  try {
    const narrative = await Narrative.findById(req.params.id);
    if (!narrative) return res.status(404).json({ message: 'Narrative not found.' });
    narrative.publicationStatus = status;
    narrative.isPublished = status === 'Published';
    narrative.reviewedAt = new Date();
    narrative.reviewedBy = req.user._id;
    if (status === 'Published') {
      narrative.publishedAt = new Date();
      narrative.publishedBy = req.user._id;
    }
    await narrative.save();
    res.json(narrative);
  } catch (error) {
    res.status(500).json({ message: 'Could not update narrative.' });
  }
};

router.put('/narratives/:id/publish', protect, admin, (req, res) => reviewNarratives(req, res, 'Published'));
router.put('/narratives/:id/hold', protect, admin, (req, res) => reviewNarratives(req, res, 'Held'));
router.put('/narratives/:id/reject', protect, admin, (req, res) => reviewNarratives(req, res, 'Rejected'));
router.put('/narratives/:id/unpublish', protect, admin, (req, res) => reviewNarratives(req, res, 'Held'));
router.put('/narratives/bulk-publish', protect, admin, async (req, res) => {
  const ids = req.body.ids;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'Provide a non-empty ids array.' });
  try {
    const now = new Date();
    const result = await Narrative.updateMany({ _id: { $in: ids } }, { $set: {
      publicationStatus: 'Published', isPublished: true, publishedAt: now,
      publishedBy: req.user._id, reviewedAt: now, reviewedBy: req.user._id,
    } });
    res.json({ modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: 'Could not publish selected narratives.' });
  }
});

// @desc    Create a new admin
// @route   POST /api/admin/admins
// @access  Private/Admin
router.post('/admins', protect, admin, async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: 'admin', 
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        message: 'Admin created successfully'
      });
    } else {
      res.status(400).json({ message: 'Invalid admin data' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
