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
  },
  {
    timestamps: true,
  }
);

const Narrative = mongoose.model('Narrative', narrativeSchema);
export default Narrative;
