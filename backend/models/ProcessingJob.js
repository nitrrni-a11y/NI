import mongoose from 'mongoose';

const processingJobSchema = new mongoose.Schema({
  batchId: {
    type: String,
    required: false
  },
  runId: {
    type: String,
    default: null
  },
  entityId: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['READY', 'PROCESSING', 'STOP_REQUESTED', 'CANCELLED', 'STOPPED', 'COMPLETED', 'FAILED', 'IDLE'],
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
  currentRunLimit: {
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
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  cancellationReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

const ProcessingJob = mongoose.model('ProcessingJob', processingJobSchema);
export default ProcessingJob;
