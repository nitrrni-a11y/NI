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
    trend: {
      type: String,
      enum: ['Rising', 'Declining', 'Stable', 'Insufficient Data'],
      default: 'Insufficient Data',
      index: true,
    },
    displayStatus: {
      type: String,
      enum: ['established', 'candidate'],
      default: 'established',
      index: true,
    },
    isEligibleForDisplay: {
      type: Boolean,
      default: true,
      index: true,
    },
    eligibilityReason: {
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
    isSecurityRisk: { type: Boolean, default: false, index: true },
    securityRiskCategory: { type: String, default: '' },
    direction: {
      type: String,
      enum: ['positive', 'negative', 'neutral', 'mixed'],
      default: 'neutral',
      index: true,
    },
    priority: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'none'],
      default: 'none',
      index: true,
    },
    positiveSignificance: {
      type: String,
      enum: ['significant', 'notable', 'general', 'none'],
      default: 'none',
      index: true,
    },
    classificationReason: {
      type: String,
      default: '',
    },
    impactIndicators: {
      type: [String],
      default: [],
    },
    supportingEvidence: {
      type: mongoose.Schema.Types.Mixed, // { claim_ids, document_ids, sources }
      default: {},
    },
    analysis: {
      type: mongoose.Schema.Types.Mixed, // { claim_count, source_count, sentiment, temporal_information, recurrence, trend, timeline, strength }
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

narrativeSchema.index({ entityId: 1, direction: 1, priority: 1 });
narrativeSchema.index({ entityId: 1, isEligibleForDisplay: 1 });

const Narrative = mongoose.model('Narrative', narrativeSchema);
export default Narrative;
