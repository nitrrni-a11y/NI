import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import User from '../models/User.js';
import Narrative from '../models/Narrative.js';
import SecurityAlert from '../models/SecurityAlert.js';

const router = express.Router();

router.get('/alerts', protect, admin, async (req, res) => {
  try {
    const query = {};
    if (req.query.entity_id) query.entityId = req.query.entity_id;
    if (req.query.status) query.status = req.query.status;
    else query.status = { $in: ['Open', 'Confirmed'] };
    const alerts = await SecurityAlert.find(query)
      .populate('narrative', 'description topic isPublished publicationStatus')
      .sort({ severity: -1, lastTriggeredAt: -1 }).limit(200);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ message: 'Could not fetch security alerts.' });
  }
});

router.put('/alerts/:id/status', protect, admin, async (req, res) => {
  const allowedStatuses = ['Open', 'Confirmed', 'Unsubstantiated', 'Duplicate', 'Resolved'];
  if (!allowedStatuses.includes(req.body.status)) return res.status(400).json({ message: 'Invalid alert status.' });
  try {
    const alert = await SecurityAlert.findByIdAndUpdate(req.params.id, {
      $set: { status: req.body.status, reviewedAt: new Date(), reviewedBy: req.user._id },
    }, { new: true, runValidators: true });
    if (!alert) return res.status(404).json({ message: 'Alert not found.' });
    res.json(alert);
  } catch (error) {
    res.status(500).json({ message: 'Could not update alert status.' });
  }
});

router.get('/narratives', protect, admin, async (req, res) => {
  try {
    const query = req.query.entity_id ? { entityId: req.query.entity_id } : {};
    const narratives = await Narrative.find(query).sort({ severityLevel: -1, lastObservedAt: -1 });
    res.json(narratives);
  } catch (error) {
    res.status(500).json({ message: 'Could not fetch narratives.' });
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
