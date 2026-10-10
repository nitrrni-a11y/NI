import mongoose from 'mongoose';

const topicSchema = new mongoose.Schema({
  topicId: {
    type: String,
    required: true,
    unique: true
  },
  entityId: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Ensure topic names are unique per analysis
topicSchema.index({ entityId: 1, name: 1 }, { unique: true });

const Topic = mongoose.model('Topic', topicSchema);
export default Topic;
