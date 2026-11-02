import mongoose from 'mongoose';

const evidenceSchema = new mongoose.Schema({
  documentId: { type: String, default: '' },
  source: { type: String, default: 'Unknown' },
  sourceType: { type: String, default: 'Unknown' },
  title: { type: String, default: '' },
  url: { type: String, default: '' },
  excerpt: { type: String, default: '' },
  publishedAt: { type: Date, default: null },
}, { _id: false });

const securityAlertSchema = new mongoose.Schema({
  alertKey: { type: String, required: true, unique: true, index: true },
  narrativeId: { type: String, required: true, index: true },
  narrative: { type: mongoose.Schema.Types.ObjectId, ref: 'Narrative', required: true },
  entityId: { type: String, required: true, index: true },
  severity: { type: String, enum: ['high', 'critical'], default: 'critical' },
  eventType: { type: String, enum: ['self_harm', 'violence_threat', 'public_safety'], required: true },
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  reason: { type: String, required: true },
  confidence: { type: Number, min: 0, max: 1, default: 0.4 },
  status: { type: String, enum: ['Open', 'Confirmed', 'Unsubstantiated', 'Duplicate', 'Resolved'], default: 'Open', index: true },
  evidence: { type: [evidenceSchema], default: [] },
  firstTriggeredAt: { type: Date, default: Date.now },
  lastTriggeredAt: { type: Date, default: Date.now },
  occurrenceCount: { type: Number, default: 1 },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

export default mongoose.model('SecurityAlert', securityAlertSchema);
