import mongoose from 'mongoose';

const processingJobSchema = new mongoose.Schema({
  batchId: {
    type: String,
    required: false
  },
  status: {
    type: String,
    enum: ['READY', 'PROCESSING', 'COMPLETED', 'FAILED', 'STOPPED', 'IDLE'],
    default: 'READY'
  },
  totalDocuments: {
    type: Number,
    default: 0
  },
  processedDocuments: {
    type: Number,
    default: 0
  },
  requestedDocuments: {
    type: Number,
    default: 0
  },
  failedDocuments: {
    type: Number,
    default: 0
  },
  newNarrativesAdded: {
    type: Number,
    default: 0
  },
  existingNarrativesUpdated: {
    type: Number,
    default: 0
  },
  claimsExtracted: {
    type: Number,
    default: 0
  },
  error: {
    type: String,
    default: null
  },
  stopRequested: {
    type: Boolean,
    default: false
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

const ProcessingJob = mongoose.model('ProcessingJob', processingJobSchema);
export default ProcessingJob;
