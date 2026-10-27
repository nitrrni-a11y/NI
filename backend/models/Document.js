import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    entityId: {
      type: String,
      required: true,
      index: true
    },
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
    detectedLanguage: {
      type: String,
      default: 'en',
    },
    translatedText: {
      type: String,
      default: '',
    },
    processingText: {
      type: String,
      default: '',
    },
    translationStatus: {
      type: String,
      enum: ['not_required', 'translated', 'failed', 'skipped', ''],
      default: 'not_required',
    },
    institutionId: { type: String, default: '' },
    canonicalUrl: { type: String, default: '' },
    contentHash: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    extractionStatus: { type: String, enum: ['success', 'partial', 'failed', 'metadata_only', ''], default: '' },
    lastCollectedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

documentSchema.index({ institutionId:  1, canonicalUrl: 1 }, { unique: true, partialFilterExpression: { institutionId: { $type: 'string', $gt: '' }, canonicalUrl: { $type: 'string', $gt: '' } } });

const Document = mongoose.model('Document', documentSchema);
export default Document;
