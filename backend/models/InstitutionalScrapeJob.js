import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  institutionId: { type: String, required: true, index: true },
  activeKey: { type: String, default: undefined, unique: true, sparse: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['pending', 'running', 'completed', 'completed_with_errors', 'failed'], default: 'pending', index: true },
  startedAt: Date,
  completedAt: Date,
  sourcesRequested: { type: [String], default: ['official_website', 'external_news'] },
  sourcesCompleted: { type: [String], default: [] },
  pagesDiscovered: { type: Number, default: 0 },
  documentsDiscovered: { type: Number, default: 0 },
  documentsInserted: { type: Number, default: 0 },
  documentsUpdated: { type: Number, default: 0 },
  documentsUnchanged: { type: Number, default: 0 },
  documentsSkipped: { type: Number, default: 0 },
  extractionFailures: { type: Number, default: 0 },
  analysisQueued: { type: Number, default: 0 },
  analysisJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProcessingJob', default: null },
  errors: { type: [String], default: [] },
  summary: { type: String, default: '' },
}, { timestamps: true });

schema.index({ institutionId: 1, status: 1 });
export default mongoose.model('InstitutionalScrapeJob', schema);
