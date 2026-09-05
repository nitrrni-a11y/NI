import mongoose from 'mongoose';

const claimSchema = new mongoose.Schema(
  {
    claimId: {
      type: String,
      required: true,
      unique: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'News',
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      required: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    sentiment: {
      type: String,
      enum: ['positive', 'negative', 'neutral', 'unclear'],
      default: 'unclear',
    },
    sentimentConfidence: {
      type: Number,
      default: 0,
    },
    stance: {
      type: String,
      enum: ['support', 'against', 'neutral', 'unclear'],
      default: 'unclear',
    },
    stanceTarget: {
      type: String,
      default: '',
    },
    stanceConfidence: {
      type: Number,
      default: 0,
    },
    embeddingMetadata: {
      type: mongoose.Schema.Types.Mixed, // e.g., { model: '...', dimension: 384 }
      default: {},
    },
    groupId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Claim = mongoose.model('Claim', claimSchema);
export default Claim;
