import mongoose from 'mongoose';

const narrativeSchema = new mongoose.Schema(
  {
    narrativeId: {
      type: String,
      required: true,
      unique: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true
    },
    topic: {
      type: String,
      default: 'Unknown',
    },
    description: {
      type: String,
      required: true,
    },
    intelligence: {
      type: String,
      default: '',
    },
    recommendation: {
      type: String,
      default: '',
    },
    publicationStatus: {
      type: String,
      enum: ['Pending Review', 'Published', 'Held', 'Rejected'],
      default: 'Pending Review',
      index: true,
    },
    isPublished: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    severityLevel: { type: String, enum: ['normal', 'high', 'critical'], default: 'normal', index: true },
    severityReason: { type: String, default: '' },
    supportingEvidence: {
      type: mongoose.Schema.Types.Mixed, // { claim_ids, document_ids, sources }
      default: {},
    },
    analysis: {
      type: mongoose.Schema.Types.Mixed, // { claim_count, source_count, sentiment, temporal_information, recurrence, strength }
      default: {},
    },
    lastObservedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const Narrative = mongoose.model('Narrative', narrativeSchema);
export default Narrative;
