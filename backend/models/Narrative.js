import mongoose from 'mongoose';

const narrativeSchema = new mongoose.Schema(
  {
    narrativeId: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
      required: true,
    },
    claimIds: {
      type: [String],
      default: [],
    },
    sources: {
      type: [mongoose.Schema.Types.Mixed], // e.g., { source: 'News', claimCount: 5 }
      default: [],
    },
    score: {
      type: Number,
      default: 0,
    },
    scoreComponents: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    trend: {
      type: String,
      enum: ['increasing', 'decreasing', 'stable', 'unknown'],
      default: 'unknown',
    },
    trendStrength: {
      type: Number,
      default: 0,
    },
    firstObservedAt: {
      type: Date,
      default: Date.now,
    },
    lastObservedAt: {
      type: Date,
      default: Date.now,
    },
    intelligence: {
      type: String,
      default: '',
    },
    recommendation: {
      type: String,
      default: '',
    },
    supportingEvidence: {
      type: mongoose.Schema.Types.Mixed, // { claim_ids, document_ids, sources }
      default: {},
    },
    analysis: {
      type: mongoose.Schema.Types.Mixed, // { claim_count, source_count, sentiment, temporal_information, recurrence, strength }
      default: {},
    },
    confidence: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const Narrative = mongoose.model('Narrative', narrativeSchema);
export default Narrative;
