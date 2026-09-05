import Claim from '../models/Claim.js';
import Narrative from '../models/Narrative.js';
import News from '../models/News.js';

// @desc    Get all unique sources
// @route   GET /api/sources
// @access  Private
const getSources = async (req, res) => {
  try {
    // Aggregate distinct sources and count them
    const sources = await News.aggregate([
      { $group: { _id: { source: "$source", sourceType: "$sourceType" }, count: { $sum: 1 }, latestCollected: { $max: "$collectedDate" } } },
      { $sort: { count: -1 } }
    ]);
    
    // Format output
    const formatted = sources.map(s => ({
      name: s._id.source,
      type: s._id.sourceType || 'Unknown',
      count: s.count,
      latestDate: s.latestCollected
    }));

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching sources' });
  }
};

// @desc    Get all topics
// @route   GET /api/topics
// @access  Private
const getTopics = async (req, res) => {
  try {
    // Unwind topics array and count occurrences
    const topics = await News.aggregate([
      { $unwind: "$topics" },
      { $group: { _id: "$topics", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const formatted = topics.map(t => ({
      topic: t._id,
      count: t.count
    }));

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching topics' });
  }
};

// @desc    Get claims (placeholder/future-ready)
// @route   GET /api/claims
// @access  Private
const getClaims = async (req, res) => {
  try {
    const claims = await Claim.find({}).sort({ createdAt: -1 }).limit(50).populate('documentId', 'title source');
    res.json(claims);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching claims' });
  }
};

// @desc    Get single claim
// @route   GET /api/claims/:id
// @access  Private
const getClaimById = async (req, res) => {
  try {
    const claim = await Claim.findById(req.params.id).populate('documentId', 'title source rawText');
    if (claim) {
      res.json(claim);
    } else {
      res.status(404).json({ message: 'Claim not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching claim' });
  }
};

// @desc    Get narratives
// @route   GET /api/narratives
// @access  Private
const getNarratives = async (req, res) => {
  try {
    const narratives = await Narrative.find({}).sort({ score: -1, lastObservedAt: -1 }).limit(20);
    res.json(narratives);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching narratives' });
  }
};

// @desc    Get single narrative
// @route   GET /api/narratives/:id
// @access  Private
const getNarrativeById = async (req, res) => {
  try {
    const narrative = await Narrative.findById(req.params.id);
    if (narrative) {
      res.json(narrative);
    } else {
      res.status(404).json({ message: 'Narrative not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching narrative' });
  }
};

// @desc    Get processing status overview
// @route   GET /api/processing/status
// @access  Private/Admin
const getProcessingStatus = async (req, res) => {
  try {
    const stats = await News.aggregate([
      { $group: { _id: "$processingStatus", count: { $sum: 1 } } }
    ]);
    
    const statusMap = {
      not_processed: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    };
    
    let total = 0;
    stats.forEach(s => {
      const statusStr = s._id || 'not_processed';
      if (statusMap[statusStr] !== undefined) {
        statusMap[statusStr] = s.count;
      }
      total += s.count;
    });

    res.json({
      total,
      breakdown: statusMap,
      aiIntegrationEnabled: false,
      message: 'AI processing integration will be enabled in the next phase.'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching processing status' });
  }
};

export {
  getSources,
  getTopics,
  getClaims,
  getClaimById,
  getNarratives,
  getNarrativeById,
  getProcessingStatus
};
