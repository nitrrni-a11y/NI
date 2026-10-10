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
