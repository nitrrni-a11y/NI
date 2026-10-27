import crypto from 'node:crypto';
import Document from '../models/Document.js';
import Entity from '../models/Entity.js';
import ProcessingJob from '../models/ProcessingJob.js';
import ScrapeJob from '../models/InstitutionalScrapeJob.js';
import { extractOfficial, extractGdelt, hash, normalizeUrl } from '../services/institutionScraper.js';
import { processDocumentsBackground } from './aiDataController.js';

const INSTITUTION = { institutionId: 'nit-raipur', entityId: 'ENT_45528e0f', name: 'National Institute of Technology Raipur' };
const canonical = (url) => normalizeUrl(url, 'https://www.nitrr.ac.in/');
const findInstitutionEntity = () => Entity.findOne({ entityId: INSTITUTION.entityId });

async function persistRecords(records, job, batchId, entityId) {
  for (const record of records) {
    const canonicalUrl = canonical(record.url);
    if (!canonicalUrl) { job.documentsSkipped++; continue; }
    const content = String(record.text || '').trim(); const contentHash = hash(content || `${record.title}\n${canonicalUrl}`);
    const prev = await Document.findOne({ institutionId: INSTITUTION.institutionId, canonicalUrl });
    if (!prev) {
      await Document.create({ entityId, institutionId: INSTITUTION.institutionId, title: record.title || '', rawText: content || record.title || canonicalUrl, source: record.metadata?.publisher || (record.metadata?.provenance === 'GDELT' ? 'GDELT' : 'NIT Raipur'), sourceType: record.metadata?.provenance === 'GDELT' ? 'external_news' : 'official_website', author: record.metadata?.publisher || 'Unknown', url: record.url, canonicalUrl, publicationDate: record.publishedAt || null, collectedDate: new Date(), lastCollectedAt: new Date(), contentHash, metadata: { ...(record.metadata || {}), documentType: record.documentType || 'document' }, extractionStatus: record.extractionStatus, processingStatus: content ? 'pending' : 'not_processed', batchId: content ? batchId : '' });
      job.documentsInserted++;
      if (content) job.analysisQueued++;
      continue;
    }
    const contentChanged = content && contentHash !== prev.contentHash;
    const hasUsefulContent = content && content.length > (prev.rawText || '').length;
    const metadataChanged = record.title !== prev.title || (record.publishedAt && String(record.publishedAt) !== String(prev.publicationDate));
    const update = { lastCollectedAt: new Date(), extractionStatus: record.text ? record.extractionStatus : (prev.extractionStatus || record.extractionStatus), metadata: { ...(prev.metadata || {}), ...(record.metadata || {}), documentType: record.documentType || prev.metadata?.documentType || 'document' } };
    if (record.title) update.title = record.title;
    if (record.publishedAt) update.publicationDate = record.publishedAt;
    if (record.text && (contentChanged || hasUsefulContent)) {
      update.rawText = content; update.contentHash = contentHash; update.processingStatus = 'pending'; update.processingError = ''; update.batchId = batchId;
      job.documentsUpdated++; job.analysisQueued++;
    } else if (metadataChanged) job.documentsUpdated++;
    else job.documentsUnchanged++;
    await Document.updateOne({ _id: prev._id }, { $set: update });
  }
}

async function runCollection(jobId) {
  const job = await ScrapeJob.findById(jobId); if (!job) return;
  job.status = 'running'; job.startedAt = new Date(); await job.save();
  const batchId = `NITRR_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  try {
    const entity = await findInstitutionEntity();
    if (!entity) throw new Error('The selected Education entity ENT_45528e0f is missing.');
    const results = await Promise.allSettled([extractOfficial(), extractGdelt()]);
    const records = [];
    for (let i = 0; i < results.length; i++) {
      const source = i === 0 ? 'official_website' : 'external_news'; const result = results[i];
      if (result.status === 'fulfilled') {
        if (!result.value.errors.length || result.value.records.length > 0) job.sourcesCompleted.push(source);
        records.push(...result.value.records); job.pagesDiscovered += result.value.pagesDiscovered || 0; job.errors.push(...result.value.errors);
      } else job.errors.push(`${source}: ${result.reason?.message || 'collection failed'}`);
    }
    const unique = [...new Map(records.map(r => [canonical(r.url), r])).values()];
    job.documentsDiscovered = unique.length; job.extractionFailures += unique.filter(r => r.extractionStatus === 'failed').length; await persistRecords(unique, job, batchId, entity.entityId);
    if (job.analysisQueued > 0) {
      const procJob = await ProcessingJob.create({ batchId, entityId: entity.entityId, status: 'PROCESSING', totalDocuments: job.analysisQueued, requestedDocuments: job.analysisQueued, processedDocuments: 0, startedAt: new Date() });
      job.analysisJobId = procJob._id;
      processDocumentsBackground(procJob._id).catch(err => console.error('NIT Raipur analysis worker failed:', err.message));
    }
    job.status = job.errors.length ? (job.sourcesCompleted.length ? 'completed_with_errors' : 'failed') : 'completed';
    job.summary = `Found ${job.documentsDiscovered}; inserted ${job.documentsInserted}, updated ${job.documentsUpdated}, unchanged ${job.documentsUnchanged}; queued ${job.analysisQueued} for analysis.`;
  } catch (error) {
    job.status = job.documentsDiscovered ? 'completed_with_errors' : 'failed'; job.errors.push(error.message);
  } finally {
    job.completedAt = new Date(); job.activeKey = undefined; await job.save();
  }
}

export async function startInstitutionScrape(req, res) {
  try {
    const entity = await findInstitutionEntity();
    if (!entity) return res.status(404).json({ message: 'NIT Raipur entity was not found.' });
    let job;
    try { job = await ScrapeJob.create({ institutionId: INSTITUTION.institutionId, activeKey: INSTITUTION.institutionId, requestedBy: req.user?._id }); }
    catch (error) { if (error.code === 11000) return res.status(409).json({ message: 'A NIT Raipur collection is already running.' }); throw error; }
    runCollection(job._id).catch(error => console.error('Institution collection failed:', error.message));
    return res.status(202).json({ jobId: job._id, status: job.status, message: 'Manual NIT Raipur collection started.' });
  } catch (error) { return res.status(500).json({ message: 'Could not start institutional collection.' }); }
}

export async function getInstitutionJobs(req, res) {
  const jobs = await ScrapeJob.find({ institutionId: INSTITUTION.institutionId }).sort({ createdAt: -1 }).limit(20).populate('analysisJobId', 'status processedDocuments requestedDocuments failedDocuments error').lean();
  res.json(jobs);
}

export async function getInstitutionOverview(req, res) {
  const entity = await findInstitutionEntity();
  if (!entity) return res.status(404).json({ message: 'NIT Raipur entity was not found.' });
  const [stats, recent, latestJob] = await Promise.all([
    Document.aggregate([{ $match: { entityId: entity.entityId, institutionId: INSTITUTION.institutionId } }, { $group: { _id: null, total: { $sum: 1 }, official: { $sum: { $cond: [{ $eq: ['$sourceType', 'official_website'] }, 1, 0] } }, news: { $sum: { $cond: [{ $eq: ['$sourceType', 'external_news'] }, 1, 0] } }, analyzed: { $sum: { $cond: [{ $eq: ['$processingStatus', 'completed'] }, 1, 0] } }, pending: { $sum: { $cond: [{ $in: ['$processingStatus', ['pending', 'not_processed', 'processing']] }, 1, 0] } }, failed: { $sum: { $cond: [{ $eq: ['$processingStatus', 'failed'] }, 1, 0] } }, latest: { $max: '$lastCollectedAt' } } }]),
    Document.find({ entityId: entity.entityId, institutionId: INSTITUTION.institutionId }).sort({ publicationDate: -1, lastCollectedAt: -1 }).limit(100).lean(),
    ScrapeJob.findOne({ institutionId: INSTITUTION.institutionId }).sort({ createdAt: -1 }).lean()
  ]);
  const metrics = stats[0] || { total: 0, official: 0, news: 0, analyzed: 0, pending: 0, failed: 0, latest: null };
  metrics.latest = latestJob && ['completed', 'completed_with_errors'].includes(latestJob.status) ? latestJob.completedAt : null;
  res.json({ institution: INSTITUTION, metrics, documents: recent, latestJob });
}

export async function getInstitutionDocuments(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const entity = await findInstitutionEntity();
  if (!entity) return res.status(404).json({ message: 'NIT Raipur entity was not found.' });
  const query = { entityId: entity.entityId, institutionId: INSTITUTION.institutionId };
  if (req.query.sourceType) query.sourceType = req.query.sourceType;
  if (req.query.status) query.processingStatus = req.query.status;
  const [documents, total] = await Promise.all([Document.find(query).sort({ publicationDate: -1, lastCollectedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Document.countDocuments(query)]);
  res.json({ documents, total, page, pages: Math.ceil(total / limit) });
}
