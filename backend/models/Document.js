import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: '',
    },
    rawText: {
      type: String,
      required: true,
    },
    batchId: {
      type: String,
      default: '',
    },
    source: {
      type: String,
      required: true,
    },
    sourceType: {
      type: String,
      default: 'Unknown',
    },
    author: {
      type: String,
      default: 'Unknown',
    },
    url: {
      type: String,
      default: '',
    },
    publicationDate: {
      type: Date,
      default: null,
    },
    collectedDate: {
      type: Date,
      default: Date.now,
    },
    processingStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'not_processed'],
      default: 'not_processed',
    },
    processingStartedAt: {
      type: Date,
      default: null,
    },
    processingCompletedAt: {
      type: Date,
      default: null,
    },
    processingError: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

const Document = mongoose.model('Document', documentSchema);
export default Document;
