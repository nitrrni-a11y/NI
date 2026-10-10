import Topic from '../models/Topic.js';

// @desc    Get all topics for an analysis
// @route   GET /api/topics
// @access  Private
export const getTopics = async (req, res) => {
  try {
    const { entity_id } = req.query;
    const query = {};
    if (entity_id) {
      query.entityId = entity_id;
    }
    const topics = await Topic.find(query).sort({ name: 1 });
    res.json(topics);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching topics' });
  }
};
