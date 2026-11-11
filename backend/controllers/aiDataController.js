import Narrative from '../models/Narrative.js';
import Document from '../models/Document.js';
import ProcessingJob from '../models/ProcessingJob.js';
import Entity from '../models/Entity.js';
import Topic from '../models/Topic.js';

// In-memory active runs registry: jobId -> { runId, jobId, batchId, entityId, abortController, startedAt }
const activeRuns = new Map();

/**
 * Reconciles any lingering jobs that were left in PROCESSING or STOP_REQUESTED
 * across server restarts, ensuring the database and UI never display stale processing states.
 */
const reconcileInterruptedJobs = async () => {
  try {
    const stuckJobs = await ProcessingJob.find({
      status: { $in: ['PROCESSING', 'STOP_REQUESTED'] }
    });
    for (const job of stuckJobs) {
      try {
        // 1. If entityId is missing on legacy records, populate it from associated batch documents
        if (!job.entityId && job.batchId) {
          const sampleDoc = await Document.findOne({ batchId: job.batchId, entityId: { $exists: true, $ne: null } });
          if (sampleDoc?.entityId) {
            job.entityId = sampleDoc.entityId;
          }
        }

        // 2. If entityId is still missing, check if this job has any documents at all
        if (!job.entityId) {
          let docCount = 0;
          if (job.batchId) {
            docCount = await Document.countDocuments({ batchId: job.batchId });
          }
          if (docCount === 0) {
            console.warn(`[Reconciliation] Removing orphaned ProcessingJob ${job._id} with no entityId and no documents.`);
            await ProcessingJob.deleteOne({ _id: job._id });
            continue;
          }
        }

        const wasStopping = job.stopRequested || job.status === 'STOP_REQUESTED';
        job.status = wasStopping ? 'CANCELLED' : 'STOPPED';
        job.stopRequested = false;
        job.completedAt = new Date();
        if (wasStopping) {
          job.cancelledAt = job.cancelledAt || new Date();
          job.cancellationReason = job.cancellationReason || 'Cancelled (reconciled after service interruption)';
        } else {
          job.error = job.error || 'Processing was interrupted by service restart';
        }

        if (job.entityId) {
          await job.save();
        } else {
          await ProcessingJob.updateOne(
            { _id: job._id },
            {
              $set: {
                status: job.status,
                stopRequested: false,
                completedAt: job.completedAt,
                cancelledAt: job.cancelledAt,
                cancellationReason: job.cancellationReason,
                error: job.error
              }
            }
          );
        }

        // Reset any documents stuck in 'processing' or 'pending' back to 'not_processed'
        const docQuery = { processingStatus: { $in: ['processing', 'pending'] } };
        if (job.batchId) docQuery.batchId = job.batchId;
        if (job.entityId) docQuery.entityId = job.entityId;
        await Document.updateMany(docQuery, { $set: { processingStatus: 'not_processed', processingStartedAt: null } });
      } catch (jobErr) {
        console.error(`[Reconciliation] Error reconciling job ${job._id}:`, jobErr.message);
      }
    }
    if (stuckJobs.length > 0) {
      console.log(`[Reconciliation] Reconciled ${stuckJobs.length} interrupted processing jobs.`);
    }
  } catch (err) {
    console.error('[Reconciliation] Error reconciling processing jobs:', err);
  }
};

// @desc    Get all unique sources
// @route   GET /api/sources
// @access  Private
const getSources = async (req, res) => {
  try {
    const targetEntityId = req.query.entity_id || req.query.entityId || req.query.entity;
    const matchStage = targetEntityId ? { $match: { entityId: targetEntityId } } : { $match: {} };

    // Aggregate distinct sources and count them
    const sources = await Document.aggregate([
      matchStage,
      { $group: { _id: { source: "$source", sourceType: "$sourceType" }, count: { $sum: 1 }, latestCollected: { $max: "$collectedDate" } } },
      { $sort: { count: -1 } }
    ]);
    
    // Format output
    const formatted = sources.map(s => ({
      name: s._id.source,
      type: s._id.sourceType || 'Unknown',
      count: s.count,
      latestDate: s.latestCollected
    }));

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching sources' });
  }
};

// Canonical topic mappings across all entities
const CANONICAL_TOPIC_REMAP = {
  "facilities": "Infrastructure & Facilities",
  "infrastructure": "Infrastructure & Facilities",
  "campus infrastructure": "Infrastructure & Facilities",
  "placement": "Placements & Careers",
  "placements": "Placements & Careers",
  "careers": "Placements & Careers",
  "exams": "Examinations",
  "exam": "Examinations",
  "examination": "Examinations",
  "accommodation": "Hostel & Accommodation",
  "hostel": "Hostel & Accommodation",
  "hostels": "Hostel & Accommodation",
  "events": "Campus Events",
  "campus event": "Campus Events",
  "partnerships": "Institutional Partnerships",
  "partnership": "Institutional Partnerships",
  "student feedback": "Student Experience",
  "feedback": "Student Experience",
  "student life": "Student Experience",
  "academics": "Academics & Curriculum",
  "curriculum": "Academics & Curriculum",
  "faculty": "Faculty & Teaching",
  "admissions": "Admissions & Enrollment",
  "administration": "Administration & Governance"
};

export const sanitizeTopicName = (name, entityName, domain) => {
  if (!name || typeof name !== 'string') return 'General';
  let clean = name.trim();
  clean = clean.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();

  if (entityName && entityName.toLowerCase() !== 'unknown') {
    const esc = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(`^${esc}\\s*[-–—:|/]?\\s*`, 'i'), '');
    clean = clean.replace(new RegExp(`\\s*[-–—:|/]?\\s*${esc}$`, 'i'), '');

    const parts = entityName.split(/\s+/).filter(p => p.length >= 3 && !['the', 'and', 'for', 'of'].includes(p.toLowerCase()));
    for (const p of parts) {
      const escP = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      clean = clean.replace(new RegExp(`^${escP}\\s*[-–—:|/]?\\s*`, 'i'), '');
      clean = clean.replace(new RegExp(`\\s*[-–—:|/]?\\s*${escP}$`, 'i'), '');
    }
  }

  if (domain && domain.toLowerCase() !== 'unknown') {
    const escD = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(`^${escD}\\s*[-–—:|/]?\\s*`, 'i'), '');
    clean = clean.replace(new RegExp(`\\s*[-–—:|/]?\\s*${escD}$`, 'i'), '');
  }

  clean = clean.replace(/^[\s\-–—:|/,.#'"]+|[\s\-–—:|/,.#'"]+$/g, '').trim();
  clean = clean.replace(/\s+(?:of|at|in|for|on|by|with|to|from)$/i, '').trim();
  clean = clean.replace(/^[\s\-–—:|/,.#'"]+|[\s\-–—:|/,.#'"]+$/g, '').trim();
  if (!clean) return 'General';

  const lower = clean.toLowerCase();
  if (CANONICAL_TOPIC_REMAP[lower]) {
    return CANONICAL_TOPIC_REMAP[lower];
  }
  return clean.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase());
};

const populateNarrativeTimeline = async (narrative) => {
  if (!narrative) return narrative;
  const narObj = narrative.toObject ? narrative.toObject() : { ...narrative };

  let timeline = narObj.analysis?.temporal_information?.timeline || narObj.analysis?.timeline || [];

  if (!timeline || timeline.length === 0) {
    const docIds = (narObj.supportingEvidence?.document_ids || []).filter(id => /^[a-f\d]{24}$/i.test(String(id)));
    if (docIds.length > 0) {
      const docs = await Document.find({ _id: { $in: docIds } }, 'publicationDate collectedDate createdAt source').lean();
      const dateMap = {};
      for (const d of docs) {
        const dt = d.publicationDate || d.collectedDate || d.createdAt;
        if (!dt) continue;
        const dStr = new Date(dt).toISOString().split('T')[0];
        if (!dateMap[dStr]) dateMap[dStr] = { date: dStr, claim_count: 0, avg_sentiment: narObj.analysis?.sentiment || 0, sources: new Set() };
        dateMap[dStr].claim_count += 1;
        if (d.source) dateMap[dStr].sources.add(d.source);
      }
      timeline = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date)).map(p => ({
        ...p,
        sources: Array.from(p.sources)
      }));
    }
  }

  let trend = narObj.trend || narObj.analysis?.trend || narObj.analysis?.recurrence;
  if (!trend || trend === 'stable' || trend === 'increasing' || trend === 'decreasing') {
    if (trend === 'increasing') trend = 'Rising';
    else if (trend === 'decreasing') trend = 'Declining';
    else if (trend === 'stable') {
      trend = timeline.length >= 2 ? 'Stable' : 'Insufficient Data';
    } else {
      trend = timeline.length >= 2 ? 'Stable' : 'Insufficient Data';
    }
  }

  narObj.trend = trend;
  narObj.timeline = timeline;
  if (!narObj.analysis) narObj.analysis = {};
  narObj.analysis.trend = trend;
  if (!narObj.analysis.temporal_information) narObj.analysis.temporal_information = {};
  narObj.analysis.temporal_information.timeline = timeline;

  return narObj;
};

// Shared highlight selection & ranking (used by both consumer highlights & admin dashboard)
const getAttentionHighlightsForEntity = async (entityId, { excludeModerated = true } = {}) => {
  const baseQuery = {
    entityId,
    $or: [
      { isEligibleForDisplay: { $ne: false } },
      { isSecurityRisk: true },
      { severityLevel: 'critical' },
      { priority: 'critical' },
    ],
  };

  if (excludeModerated) {
    baseQuery.publicationStatus = { $nin: ['Held', 'Rejected'] };
  }

  // 1. Negative narratives requiring attention:
  const negativeCandidates = await Narrative.find({
    ...baseQuery,
    direction: 'negative',
    priority: { $in: ['critical', 'high', 'medium'] },
  }).sort({ lastObservedAt: -1 }).limit(30);

  const scoredNegative = negativeCandidates.map((nar) => {
    let score = 0;
    if (nar.priority === 'critical' || nar.isSecurityRisk) score += 1000;
    else if (nar.priority === 'high') score += 500;
    else if (nar.priority === 'medium') {
      const claims = nar.analysis?.claim_count || nar.supportingEvidence?.claim_ids?.length || 0;
      const sources = nar.analysis?.source_count || nar.supportingEvidence?.sources?.length || 0;
      const isRising = (nar.trend || nar.analysis?.trend) === 'Rising';
      if (claims < 3 && sources < 2 && !isRising) {
        return null;
      }
      score += 100 + claims * 10 + (isRising ? 50 : 0);
    }
    return { narrative: nar, score };
  }).filter(Boolean);

  scoredNegative.sort((a, b) => b.score - a.score);
  const negative = scoredNegative.slice(0, 5).map((item) => item.narrative);

  // 2. Positive Institutional Highlights:
  const positiveCandidates = await Narrative.find({
    ...baseQuery,
    direction: 'positive',
    positiveSignificance: { $in: ['significant', 'notable', 'general'] },
  }).sort({ lastObservedAt: -1 }).limit(20);

  const scoredPositive = positiveCandidates.map((nar) => {
    let score = 0;
    if (nar.positiveSignificance === 'significant') score += 500;
    else if (nar.positiveSignificance === 'notable') score += 200;
    else score += 50;
    const strength = nar.analysis?.strength || 0;
    score += strength * 100;
    return { narrative: nar, score };
  });

  scoredPositive.sort((a, b) => b.score - a.score);
  const positive = scoredPositive.slice(0, 3).map((item) => item.narrative);

  return { negative, positive };
};

// @desc    Get dashboard attention/highlight narratives for consumer or admin
// @route   GET /api/narratives/highlights
// @access  Public / Consumer / Admin
const getDashboardHighlights = async (req, res) => {
  try {
    const targetEntityId = req.query.entity_id || req.query.entityId || req.query.entity;
    if (!targetEntityId) {
      return res.status(400).json({ message: 'entity_id is required' });
    }
    const isAdmin = req.user?.role === 'admin';
    const { negative, positive } = await getAttentionHighlightsForEntity(targetEntityId, {
      excludeModerated: !isAdmin,
    });
    res.json({
      entityId: targetEntityId,
      negative,
      positive,
    });
  } catch (error) {
    console.error('Error fetching dashboard highlights:', error);
    res.status(500).json({ message: 'Could not fetch dashboard highlight narratives.' });
  }
};

// @desc    Get narratives
// @route   GET /api/narratives
// @access  Private / Consumer (optionalProtect)
const getNarratives = async (req, res) => {
  try {
    const {
      entity_id,
      entityId,
      entity,
      domain,
      category,
      search,
      is_published,
      status,
      include_candidates,
      direction,
      priority,
      positive_significance,
      limit: reqLimit,
    } = req.query;
    const targetEntityId = entity_id || entityId || entity;
    const isAdmin = req.user?.role === 'admin';
    const query = {};
    if (is_published === 'true') {
      query.isPublished = true;
    } else if (!isAdmin) {
      query.publicationStatus = { $nin: ['Held', 'Rejected'] };
    }
    if (targetEntityId) {
      query.entityId = targetEntityId;
    }
    if (category) query.topic = category;
    if (domain) {
      const escapedDomain = String(domain).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matchingEntities = await Entity.find({ domain: new RegExp(`^${escapedDomain}$`, 'i') }).distinct('entityId');
      query.entityId = { $in: matchingEntities };
      if (targetEntityId) query.entityId = { $in: matchingEntities.includes(targetEntityId) ? [targetEntityId] : [] };
    }
    if (search && String(search).trim()) {
      const safeSearch = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [{ description: new RegExp(safeSearch, 'i') }, { intelligence: new RegExp(safeSearch, 'i') }, { topic: new RegExp(safeSearch, 'i') }];
    }

    if (direction && direction !== 'all') {
      query.direction = direction;
    }
    if (priority && priority !== 'all') {
      query.priority = priority;
    }
    if (positive_significance && positive_significance !== 'all') {
      query.positiveSignificance = positive_significance;
    }

    // Low-evidence filtering: non-admins are strictly restricted to established narratives
    if (!isAdmin) {
      query.isEligibleForDisplay = { $ne: false };
    } else if (status === 'candidate') {
      query.isEligibleForDisplay = false;
    } else if (status === 'all' || include_candidates === 'true') {
      // include all
    } else {
      // Default: only established / display-eligible narratives
      query.isEligibleForDisplay = { $ne: false };
    }

    const parsedLimit = Math.min(500, Math.max(1, Number(reqLimit) || 250));
    const narratives = await Narrative.find(query)
      .sort({ 'analysis.strength': -1, lastObservedAt: -1 })
      .limit(parsedLimit);
    res.json(narratives);
  } catch (error) {
    console.error('Narratives error:', error);
    res.status(500).json({
      message: 'Server error fetching narratives'
    });
  }
};

// @desc    Get single narrative
// @route   GET /api/narratives/:id
// @access  Private / Consumer (optionalProtect)
const getNarrativeById = async (req, res) => {
  try {
    const narrative = await Narrative.findById(req.params.id);
    if (!narrative) {
      return res.status(404).json({ message: 'Narrative not found' });
    }
    const isAdmin = req.user?.role === 'admin';
    if (!isAdmin && (['Held', 'Rejected'].includes(narrative.publicationStatus) || narrative.isEligibleForDisplay === false)) {
      return res.status(404).json({ message: 'Narrative not found' });
    }
    const populated = await populateNarrativeTimeline(narrative);
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching narrative' });
  }
};

// @desc    Get processing status overview
// @route   GET /api/processing/status
// @access  Private/Admin
const getProcessingStatus = async (req, res) => {
  try {
    const { entity_id } = req.query;

    // Auto-reconcile orphaned processing/pending documents if no worker is actively running
    const hasActiveWorker = Array.from(activeRuns.values()).some(run => !entity_id || run.entityId === entity_id);
    if (!hasActiveWorker) {
      const activeJobQuery = { status: { $in: ['PROCESSING', 'STOP_REQUESTED'] } };
      if (entity_id) activeJobQuery.entityId = entity_id;
      const runningJobCount = await ProcessingJob.countDocuments(activeJobQuery);
      if (runningJobCount === 0) {
        const cleanupQuery = { processingStatus: { $in: ['processing', 'pending'] } };
        if (entity_id) cleanupQuery.entityId = entity_id;
        await Document.updateMany(cleanupQuery, { $set: { processingStatus: 'not_processed', processingStartedAt: null } });
      }
    }

    const matchStage = entity_id ? { $match: { entityId: entity_id } } : { $match: {} };

    const [stats, sourceStats] = await Promise.all([
      Document.aggregate([
        matchStage,
        { $group: { _id: "$processingStatus", count: { $sum: 1 } } }
      ]),
      Document.aggregate([
        matchStage,
        {
          $group: {
            _id: {
              source: { $ifNull: ["$source", "Unknown"] },
              status: { $ifNull: ["$processingStatus", "not_processed"] }
            },
            count: { $sum: 1 }
          }
        }
      ])
    ]);
    
    const statusMap = {
      not_processed: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    };
    
    let total = 0;
    stats.forEach(s => {
      const statusStr = s._id || 'not_processed';
      if (statusMap[statusStr] !== undefined) {
        statusMap[statusStr] = s.count;
      }
      total += s.count;
    });

    // Compile source-wise breakdown
    const sourceMap = {};
    sourceStats.forEach(item => {
      const srcName = item._id.source || 'Unknown';
      const st = item._id.status || 'not_processed';
      if (!sourceMap[srcName]) {
        sourceMap[srcName] = { source: srcName, total: 0, completed: 0, unprocessed: 0, processing: 0, failed: 0 };
      }
      sourceMap[srcName].total += item.count;
      if (st === 'completed') sourceMap[srcName].completed += item.count;
      else if (st === 'processing') sourceMap[srcName].processing += item.count;
      else if (st === 'failed') sourceMap[srcName].failed += item.count;
      else sourceMap[srcName].unprocessed += item.count;
    });
    const sourceBreakdown = Object.values(sourceMap).sort((a, b) => b.total - a.total);

    res.json({
      total,
      breakdown: statusMap,
      sourceBreakdown,
      aiIntegrationEnabled: true,
      message: 'AI processing pipeline is active and ready to process batches.'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching processing status' });
  }
};

// @desc    Get current active processing job status
// @route   GET /api/processing/job-status
// @access  Private/Admin
const getJobStatus = async (req, res) => {
  try {
    const { entity_id, batch_id } = req.query;
    const query = {};
    if (entity_id) {
      query.entityId = entity_id;
    }
    let jobs = await ProcessingJob.find(query).sort({ createdAt: -1 }).limit(20);
    
    const availableBatches = [];
    let candidateJob = null;

    for (const job of jobs) {
      if (!job.batchId) continue;
      const actualTotal = await Document.countDocuments({ batchId: job.batchId });
      if (actualTotal === 0) continue;

      const actualCompleted = await Document.countDocuments({ batchId: job.batchId, processingStatus: 'completed' });
      const actualFailed = await Document.countDocuments({ batchId: job.batchId, processingStatus: 'failed' });
      const actualUnprocessed = await Document.countDocuments({ batchId: job.batchId, processingStatus: { $in: ['not_processed', 'pending'] } });

      let needsSave = false;
      if (job.totalDocuments !== actualTotal) {
        job.totalDocuments = actualTotal;
        needsSave = true;
      }
      if (job.processedDocuments !== actualCompleted) {
        job.processedDocuments = actualCompleted;
        needsSave = true;
      }
      if (job.failedDocuments !== actualFailed) {
        job.failedDocuments = actualFailed;
        needsSave = true;
      }
      if (actualUnprocessed === 0 && actualCompleted === actualTotal && !['PROCESSING', 'STOP_REQUESTED'].includes(job.status)) {
        if (job.status !== 'COMPLETED') {
          job.status = 'COMPLETED';
          needsSave = true;
        }
      } else if (actualUnprocessed > 0 && !['PROCESSING', 'STOP_REQUESTED'].includes(job.status)) {
        if (job.status === 'COMPLETED') {
          // Reconcile: A batch with remaining unprocessed documents is PARTIALLY PROCESSED / READY, not COMPLETED
          job.status = 'READY';
          needsSave = true;
        }
      }
      if (needsSave && job.entityId) {
        await job.save();
      }

      availableBatches.push({
        batchId: job.batchId,
        createdAt: job.createdAt,
        totalDocuments: actualTotal,
        processedDocuments: actualCompleted,
        unprocessedDocuments: actualUnprocessed,
        failedDocuments: actualFailed,
        status: job.status
      });

      // Priority selection for candidateJob:
      // 1. Explicitly requested batch_id match
      if (batch_id && job.batchId === batch_id) {
        candidateJob = job;
      } else if (!candidateJob) {
        // 2. Actively running or stopping job
        if (['PROCESSING', 'STOP_REQUESTED'].includes(job.status)) {
          candidateJob = job;
        } else if (actualUnprocessed > 0) {
          // 3. Batch with unprocessed documents waiting
          candidateJob = job;
        }
      }
    }

    let currentJob = candidateJob || (jobs.length > 0 ? jobs[0] : null);

    if (!currentJob) {
      // Return a dummy empty job if no valid batch exists
      currentJob = { status: 'IDLE', totalDocuments: 0, processedDocuments: 0 };
    } else if (currentJob.status === 'PROCESSING' || currentJob.status === 'STOP_REQUESTED') {
      // Auto-reconciliation: If job is marked PROCESSING / STOP_REQUESTED but has no active in-memory worker
      // (e.g. backend service was restarted or worker crashed), reconcile it immediately.
      const isActivelyRunning = activeRuns.has(currentJob._id.toString());
      if (!isActivelyRunning) {
        console.log(`[JobStatus] Detected stale processing job ${currentJob._id} without active worker. Reconciling...`);
        const wasStopping = currentJob.stopRequested || currentJob.status === 'STOP_REQUESTED';
        currentJob.status = wasStopping ? 'CANCELLED' : 'STOPPED';
        currentJob.stopRequested = false;
        currentJob.completedAt = new Date();
        if (wasStopping) {
          currentJob.cancelledAt = currentJob.cancelledAt || new Date();
          currentJob.cancellationReason = currentJob.cancellationReason || 'Cancelled (reconciled after service interruption)';
        } else {
          currentJob.error = 'Processing was interrupted (service restarted or worker stopped)';
        }

        if (!currentJob.entityId && currentJob.batchId) {
          const sampleDoc = await Document.findOne({ batchId: currentJob.batchId, entityId: { $exists: true, $ne: null } });
          if (sampleDoc?.entityId) {
            currentJob.entityId = sampleDoc.entityId;
          }
        }
        
        // Revert any lingering 'processing' or 'pending' documents in this batch
        const resetQuery = { processingStatus: { $in: ['processing', 'pending'] } };
        if (currentJob.batchId) resetQuery.batchId = currentJob.batchId;
        if (currentJob.entityId) resetQuery.entityId = currentJob.entityId;
        await Document.updateMany(resetQuery, { $set: { processingStatus: 'not_processed', processingStartedAt: null } });
        
        if (currentJob.entityId) {
          await currentJob.save();
        } else {
          await ProcessingJob.updateOne(
            { _id: currentJob._id },
            {
              $set: {
                status: currentJob.status,
                stopRequested: false,
                completedAt: currentJob.completedAt,
                cancelledAt: currentJob.cancelledAt,
                cancellationReason: currentJob.cancellationReason,
                error: currentJob.error
              }
            }
          );
        }
      }
    }
    const jobObj = currentJob.toObject ? currentJob.toObject() : { ...currentJob };
    jobObj.availableBatches = availableBatches;
    res.json(jobObj);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching job status' });
  }
};

// @desc    Stop processing job
// @route   POST /api/processing/stop
// @access  Private/Admin
const stopProcessingJob = async (req, res) => {
  try {
    const { entityId, batchId, force } = req.body;
    const query = {};
    if (entityId) query.entityId = entityId;
    if (batchId) query.batchId = batchId;

    // Look for currently active or stopping jobs first
    let job = await ProcessingJob.findOne({
      ...query,
      status: { $in: ['PROCESSING', 'STOP_REQUESTED'] }
    }).sort({ createdAt: -1 });

    if (!job) {
      // If none active, find latest job
      job = await ProcessingJob.findOne(query).sort({ createdAt: -1 });
    }

    if (!job || ['COMPLETED', 'CANCELLED', 'STOPPED', 'FAILED', 'IDLE'].includes(job.status)) {
      return res.json({
        success: true,
        message: 'Processing is not running or already stopped.',
        status: job?.status || 'IDLE',
        job
      });
    }

    // Immediately mark stopRequested and STOP_REQUESTED in MongoDB
    job.stopRequested = true;
    job.status = 'STOP_REQUESTED';
    await job.save();

    const activeRun = activeRuns.get(job._id.toString());

    if (activeRun) {
      // Signal Python AI service to halt processing
      try {
        const aiService = (await import('../services/aiService.js')).default;
        aiService.cancelBatch(activeRun.runId).catch(err => {
          console.warn('[StopJob] Non-fatal AI cancel signal warning:', err.message);
        });
      } catch (e) {}

      // Abort in-flight Axios HTTP request
      try {
        activeRun.abortController.abort();
      } catch (e) {}
    }

    if (force || !activeRun) {
      // If force requested or no active worker in memory, finalize directly to CANCELLED
      job.status = 'CANCELLED';
      job.stopRequested = false;
      job.cancelledAt = new Date();
      job.completedAt = new Date();
      job.cancellationReason = force ? 'Force stopped by administrator' : 'Cancelled by administrator';

      if (!job.entityId && job.batchId) {
        const sampleDoc = await Document.findOne({ batchId: job.batchId });
        if (sampleDoc?.entityId) job.entityId = sampleDoc.entityId;
      }
      if (job.entityId) {
        await job.save();
      } else {
        await ProcessingJob.updateOne({ _id: job._id }, { $set: { status: 'CANCELLED', stopRequested: false, cancelledAt: job.cancelledAt, completedAt: job.completedAt, cancellationReason: job.cancellationReason } });
      }

      // Reset documents from processing back to not_processed
      const docQuery = { processingStatus: { $in: ['processing', 'pending'] } };
      if (job.batchId) docQuery.batchId = job.batchId;
      if (job.entityId) docQuery.entityId = job.entityId;
      await Document.updateMany(docQuery, { $set: { processingStatus: 'not_processed', processingStartedAt: null } });

      activeRuns.delete(job._id.toString());

      return res.json({
        success: true,
        message: 'Processing cancelled successfully.',
        status: 'CANCELLED',
        job
      });
    }

    res.json({
      success: true,
      message: 'Stop requested. Cancellation in progress.',
      status: 'STOP_REQUESTED',
      job
    });
  } catch (error) {
    console.error('Stop processing error:', error);
    res.status(500).json({ message: 'Server error stopping job' });
  }
};

// Background worker
const processDocumentsBackground = async (jobId, runId) => {
  let activeRun = activeRuns.get(jobId.toString());
  if (!activeRun) {
    const generatedRunId = runId || ('RUN_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));
    activeRun = {
      runId: generatedRunId,
      jobId: jobId.toString(),
      abortController: new AbortController(),
      startedAt: new Date()
    };
    activeRuns.set(jobId.toString(), activeRun);
  }

  const effectiveRunId = activeRun.runId;

  try {
    let job = await ProcessingJob.findById(jobId);
    if (!job) {
      activeRuns.delete(jobId.toString());
      return;
    }

    // Batch size allows processing up to 10 documents per AI batch chunk,
    // while honoring smaller requested limits (e.g., 1, 2, 4, 5).
    const batchSize = 10;
    
    while (true) {
      // Reload job to check for stop request
      job = await ProcessingJob.findById(jobId);
      if (!job) break;

      const isCancelled = job.stopRequested || job.status === 'STOP_REQUESTED' || activeRun.abortController.signal.aborted;
      if (isCancelled) {
        job.status = 'CANCELLED';
        job.stopRequested = false;
        job.cancelledAt = new Date();
        job.completedAt = new Date();
        job.cancellationReason = 'Cancelled by administrator';
        await job.save();

        // Revert any lingering 'processing' or 'pending' documents in this batch to not_processed
        const resetQuery = { processingStatus: { $in: ['processing', 'pending'] } };
        if (job.batchId) resetQuery.batchId = job.batchId;
        if (job.entityId) resetQuery.entityId = job.entityId;
        await Document.updateMany(resetQuery, { $set: { processingStatus: 'not_processed', processingStartedAt: null } });

        activeRuns.delete(jobId.toString());
        return;
      }
      
      if (job.processedDocuments >= job.requestedDocuments) {
        // We reached the configured target limit for this run
        const remainingDocsCount = await Document.countDocuments({
          batchId: job.batchId,
          processingStatus: { $in: ['not_processed', 'pending', 'failed'] }
        });

        const isCancelled = job.stopRequested || job.status === 'STOP_REQUESTED';
        if (isCancelled) {
          job.status = 'CANCELLED';
          job.cancelledAt = new Date();
          job.cancellationReason = 'Cancelled by administrator';
        } else if (remainingDocsCount === 0) {
          // All documents in this batch have reached terminal state -> COMPLETED
          job.status = 'COMPLETED';
        } else {
          // Current run target finished, but batch has remaining unprocessed documents -> READY for next chunk
          job.status = 'READY';
        }
        job.completedAt = new Date();
        await job.save();
        activeRuns.delete(jobId.toString());
        return;
      }

      const remainingToProcess = job.requestedDocuments - job.processedDocuments;
      const currentBatchSize = Math.min(batchSize, remainingToProcess);

      // Fetch unprocessed documents for this batch
      const query = { processingStatus: { $in: ['not_processed', 'pending', 'failed'] }, entityId: job.entityId };
      if (job.batchId) {
        query.batchId = job.batchId;
      }
      
      const unprocessedDocs = await Document.find(query).limit(currentBatchSize);

      if (unprocessedDocs.length === 0) {
        const remainingDocsCount = await Document.countDocuments({
          batchId: job.batchId,
          processingStatus: { $in: ['not_processed', 'pending', 'failed'] }
        });
        const isCancelled = job.stopRequested || job.status === 'STOP_REQUESTED';
        if (isCancelled) {
          job.status = 'CANCELLED';
          job.cancelledAt = new Date();
          job.cancellationReason = 'Cancelled by administrator';
        } else if (remainingDocsCount === 0) {
          job.status = 'COMPLETED';
        } else {
          job.status = 'READY';
        }
        job.completedAt = new Date();
        await job.save();
        activeRuns.delete(jobId.toString());
        return;
      }

      const docIds = unprocessedDocs.map(d => d._id);
      
      // Mark as processing
      await Document.updateMany(
        { _id: { $in: docIds } },
        { $set: { processingStatus: 'processing', processingStartedAt: new Date() } }
      );

      // Format for AI
      const formattedDocs = unprocessedDocs.map(d => ({
        document_id: d._id.toString(),
        text: d.rawText,
        original_text: d.rawText,
        detected_language: d.detectedLanguage || undefined,
        translated_text: d.translatedText || undefined,
        processing_text: d.processingText || undefined,
        translation_status: d.translationStatus || undefined,
        source: d.source || 'Unknown',
        source_type: d.sourceType || 'Unknown',
        author: d.author || 'Unknown',
        published_at: d.publicationDate ? d.publicationDate.toISOString() : null,
        collected_at: d.collectedDate ? d.collectedDate.toISOString() : null
      }));

      const existingNarrativesList = await Narrative.find({ entityId: job.entityId });
      const formattedExisting = existingNarrativesList.map(n => ({
        narrative_id: n.narrativeId,
        text: n.description,
        topic: n.topic || 'Unknown',
        claim_count: n.analysis?.claim_count || 0,
        source_count: n.analysis?.source_count || 0,
        claim_ids: n.supportingEvidence?.claim_ids || [],
        document_ids: n.supportingEvidence?.document_ids || [],
        sources: n.supportingEvidence?.sources || [],
        sentiment: n.analysis?.sentiment || 0.0,
        temporal_information: n.analysis?.temporal_information || {},
        timeline: n.analysis?.temporal_information?.timeline || n.analysis?.timeline || []
      }));

      // Fetch entity context
      const entityObj = await Entity.findOne({ entityId: job.entityId });
      const entityContext = entityObj ? {
        entity_id: entityObj.entityId,
        entity_name: entityObj.name,
        entity_type: entityObj.entityType,
        domain: entityObj.domain
      } : {
        entity_id: job.entityId,
        entity_name: "Unknown",
        entity_type: "Unknown",
        domain: "Unknown"
      };

      // Fetch existing topics
      const existingTopics = await Topic.find({ entityId: job.entityId });
      const formattedTopics = existingTopics.map(t => ({
        topic_id: t.topicId || `TOPIC_LEGACY_${t._id.toString()}`,
        name: t.name
      }));

      let aiResponse;
      try {
        const aiService = (await import('../services/aiService.js')).default;
        aiResponse = await aiService.processBatch(
          formattedDocs, 
          formattedExisting, 
          entityContext, 
          formattedTopics,
          { runId: effectiveRunId, signal: activeRun.abortController.signal }
        );
      } catch (aiErr) {
        // Check if error was caused by cancellation
        const wasCancelled = aiErr.isCancelled || 
          activeRun.abortController.signal.aborted || 
          job.stopRequested || 
          job.status === 'STOP_REQUESTED';

        if (wasCancelled) {
          console.log(`[BackgroundWorker] Intercepted cancellation during AI batch processing for job ${jobId}.`);
          // Revert documents back to not_processed
          await Document.updateMany(
            { _id: { $in: docIds }, processingStatus: { $in: ['processing', 'pending'] } },
            { $set: { processingStatus: 'not_processed', processingStartedAt: null } }
          );

          job.status = 'CANCELLED';
          job.stopRequested = false;
          job.cancelledAt = new Date();
          job.completedAt = new Date();
          job.cancellationReason = 'Cancelled by administrator';
          await job.save();
          activeRuns.delete(jobId.toString());
          return;
        }

        // Real AI Error: Mark only this current sub-batch documents as failed
        await Document.updateMany({ _id: { $in: docIds } }, { $set: { processingStatus: 'failed', processingError: aiErr.message } });
        job.status = 'FAILED';
        job.error = aiErr.message;
        job.failedDocuments = (job.failedDocuments || 0) + docIds.length;
        job.completedAt = new Date();
        await job.save();
        activeRuns.delete(jobId.toString());
        return;
      }

      // Check if cancellation occurred while AI was executing or if AI returned cancelled status
      const wasCancelledPostAI = aiResponse?.status === 'cancelled' ||
        activeRun.abortController.signal.aborted ||
        job.stopRequested ||
        job.status === 'STOP_REQUESTED';

      if (wasCancelledPostAI) {
        console.log(`[BackgroundWorker] AI response indicated cancellation for job ${jobId}. Halting and preserving clean state.`);
        await Document.updateMany(
          { _id: { $in: docIds }, processingStatus: { $in: ['processing', 'pending'] } },
          { $set: { processingStatus: 'not_processed', processingStartedAt: null } }
        );

        job.status = 'CANCELLED';
        job.stopRequested = false;
        job.cancelledAt = new Date();
        job.completedAt = new Date();
        job.cancellationReason = 'Cancelled by administrator';
        await job.save();
        activeRuns.delete(jobId.toString());
        return;
      }

      // Save Narratives
      let newCount = 0;
      let updatedCount = 0;
      let claimCount = 0;
      
      if (aiResponse.narratives && Array.isArray(aiResponse.narratives)) {
        for (const nar of aiResponse.narratives) {
          const existing = await Narrative.findOne({ narrativeId: nar.narrative_id });
          if (existing) updatedCount++;
          else newCount++;
          
          claimCount += nar.analysis?.claim_count || 0;

          const referencedDocumentIds = (nar.supporting_evidence?.document_ids || []).filter(id => /^[a-f\d]{24}$/i.test(String(id)));
          const sourceDocuments = referencedDocumentIds.length
            ? await Document.find({ _id: { $in: referencedDocumentIds } }).limit(20)
            : [];
          const risk = detectSecurityRisk(nar, sourceDocuments);
          const classification = classifyNarrative(nar, sourceDocuments, risk);

          const cCount = nar.analysis?.claim_count || 0;
          const sCount = nar.analysis?.source_count || (nar.supporting_evidence?.sources?.length || 0);
          const strength = nar.analysis?.strength || 0;
          const isSecurityRisk = classification.isSecurityRisk || classification.priority === 'critical';

          // Display eligibility: low-evidence (1 claim, 1 source) kept as candidate observation
          // Elevated security risk requires immediate visibility, but normal high priority negative complaints do NOT bypass evidence criteria
          const isEligible = isSecurityRisk
            ? true
            : (nar.is_eligible !== undefined 
                ? nar.is_eligible 
                : ((sCount >= 2) || (cCount >= 2 && strength >= 0.35)));
          const displayStatus = isEligible ? 'established' : 'candidate';
          const eligibilityReason = isSecurityRisk
            ? 'Safety-critical observation requires immediate operational visibility'
            : (nar.eligibility_reason || (isEligible 
                ? 'Corroborated by multiple sources or claims' 
                : 'Single claim from single source - retained as candidate observation'));

          // Clean topic to ensure no entity or domain prefixes/suffixes
          const cleanTopic = sanitizeTopicName(nar.topic, entityObj?.name, entityObj?.domain);

          // Standardize trend classification
          let narTrend = nar.trend || nar.analysis?.trend || nar.analysis?.recurrence || 'Insufficient Data';
          if (narTrend === 'increasing') narTrend = 'Rising';
          else if (narTrend === 'decreasing') narTrend = 'Declining';
          else if (narTrend === 'stable') narTrend = 'Stable';

          const updateFields = {
            narrativeId: nar.narrative_id,
            entityId: job.entityId,
            topic: cleanTopic,
            description: nar.narrative,
            intelligence: nar.intelligence || '',
            recommendation: nar.recommendation || '',
            trend: narTrend,
            displayStatus: displayStatus,
            isEligibleForDisplay: isEligible,
            eligibilityReason: eligibilityReason,
            direction: classification.direction,
            priority: classification.priority,
            positiveSignificance: classification.positiveSignificance,
            classificationReason: classification.classificationReason,
            impactIndicators: classification.impactIndicators,
            supportingEvidence: nar.supporting_evidence || {},
            analysis: {
              ...(nar.analysis || {}),
              trend: narTrend,
              display_status: displayStatus,
              is_eligible: isEligible,
              eligibility_reason: eligibilityReason,
              direction: classification.direction,
              priority: classification.priority,
              positive_significance: classification.positiveSignificance,
              classification_reason: classification.classificationReason,
              impact_indicators: classification.impactIndicators
            },
            lastObservedAt: new Date(),
            severityLevel: classification.severityLevel,
            severityReason: classification.severityReason,
            isSecurityRisk: classification.isSecurityRisk,
            securityRiskCategory: classification.securityRiskCategory,
          };
          // A new critical finding always returns to moderation, even if an
          // earlier version of the same narrative had been published.
          const hasNewEvidence = referencedDocumentIds.some(id =>
            !(existing?.supportingEvidence?.document_ids || []).map(String).includes(String(id))
          );
          if (classification.priority === 'critical' && (!existing || existing.priority !== 'critical' || hasNewEvidence)) {
            updateFields.publicationStatus = 'Pending Review';
            updateFields.isPublished = false;
          }

          await Narrative.findOneAndUpdate(
            { narrativeId: nar.narrative_id },
            { $set: updateFields },
            { upsert: true, new: true }
          );

          // Save new topic if the AI decided to create one
          if (cleanTopic && cleanTopic !== 'Unknown' && cleanTopic !== 'General') {
            try {
              const topicIdToSave = nar.topic_id || `TOPIC_${Date.now()}`;
              await Topic.updateOne(
                { entityId: job.entityId, name: cleanTopic },
                { $set: { topicId: topicIdToSave, name: cleanTopic, entityId: job.entityId } },
                { upsert: true }
              );
            } catch (err) {
              console.error('Error saving new topic:', err);
            }
          }
        }
      }

      // Persist document language, translation status, and completion
      let failedDocIds = [];
      let successDocIds = [];

      if (aiResponse.processed_documents && Array.isArray(aiResponse.processed_documents)) {
        for (const pDoc of aiResponse.processed_documents) {
          const isTransFailed = pDoc.translation_status === 'failed';
          if (isTransFailed) {
            failedDocIds.push(pDoc.document_id);
          } else {
            successDocIds.push(pDoc.document_id);
          }

          await Document.updateOne(
            { _id: pDoc.document_id },
            {
              $set: {
                detectedLanguage: pDoc.detected_language || pDoc.detectedLanguage || 'en',
                translationStatus: pDoc.translation_status || pDoc.translationStatus || 'not_required',
                processingText: pDoc.processing_text || pDoc.processingText || '',
                translatedText: pDoc.translated_text || pDoc.translatedText || '',
                processingStatus: isTransFailed ? 'failed' : 'completed',
                processingCompletedAt: isTransFailed ? null : new Date(),
                processingError: isTransFailed ? (pDoc.metadata?.translation_error || 'Translation failed') : ''
              }
            }
          );
        }
      } else {
        successDocIds = docIds.map(id => id.toString());
        await Document.updateMany(
          { _id: { $in: docIds } },
          { 
            $set: { 
              processingStatus: 'completed', 
              processingCompletedAt: new Date(),
              processingError: ''
            } 
          }
        );
      }
      
      // Update Job Progress
      job.processedDocuments += successDocIds.length;
      if (failedDocIds.length > 0) {
        job.failedDocuments = (job.failedDocuments || 0) + failedDocIds.length;
      }
      job.newNarrativesAdded += newCount;
      job.existingNarrativesUpdated += updatedCount;
      job.claimsExtracted += claimCount;
      await job.save();
    }
  } catch (err) {
    console.error('Background worker error:', err);
    try {
      let job = await ProcessingJob.findById(jobId);
      if (job) {
        const isCancelled = job.stopRequested || job.status === 'STOP_REQUESTED';
        job.status = isCancelled ? 'CANCELLED' : 'FAILED';
        if (isCancelled) {
          job.cancelledAt = new Date();
          job.cancellationReason = 'Cancelled by administrator';
        } else {
          job.error = err.message;
        }
        job.completedAt = new Date();
        await job.save();
      }
    } catch(e){}
  } finally {
    activeRuns.delete(jobId.toString());
  }
};

const detectSecurityRisk = (narrative, documents = []) => {
  const narrativeText = [narrative.narrative || narrative.description, narrative.intelligence, narrative.recommendation, narrative.topic].filter(Boolean).join(' ');
  const candidates = [
    { documentId: null, text: narrativeText },
    ...documents.map(doc => ({ documentId: doc._id.toString(), text: doc.processingText || doc.translatedText || doc.rawText || '' })),
  ];

  // Prevention and awareness indicators that distinguish educational/institutional workshops from real incidents
  const preventionRegex = /\b(prevention|preventing|workshop|seminar|awareness|counseling|counselor|helpline|anti[- ]suicide|committee|session|training|drill|hypothetical|guidelines|mental health awareness|talk on)\b/i;
  // Specific markers of a completed/ongoing tragic incident
  const actualIncidentMarkers = /\b(died|found dead|committed|hanged|jumped|body found|dead body|passed away|lost (their|his|her) life|critical condition|hospitalized|tragic demise)\b/i;

  const selfHarm = /\b(suicid(e|al)|self[- ]harm|attempted suicide|took (their|his|her) own life|died by suicide)\b/i;
  const selfHarmEvent = /\b(death|died|dead|case|incident|attempt|attempted|found|reported|alleged|student|faculty|staff|institution|campus)\b/i;
  
  const selfHarmMatches = candidates.filter(candidate => {
    if (!selfHarm.test(candidate.text)) return false;
    const hasPrevention = preventionRegex.test(candidate.text);
    const hasTragedy = actualIncidentMarkers.test(candidate.text);
    if (hasPrevention && !hasTragedy) return false;
    return selfHarmEvent.test(candidate.text);
  });

  if (selfHarmMatches.length) {
    return {
      eventType: 'self_harm',
      severity: 'critical',
      title: 'Possible suicide or self-harm incident',
      reason: 'Processed narrative or source text mentions suicide or self-harm together with an incident, death, attempt, or institutional context. Verify the source and recency before treating this as confirmed.',
      matchedDocumentIds: selfHarmMatches.map(item => item.documentId).filter(Boolean)
    };
  }

  const immediateThreat = /\b(active shooter|bomb threat|threat to (kill|attack)|imminent attack|shooting|stabbing|mass casualty|terrorist attack)\b/i;
  const threatMatches = candidates.filter(candidate => {
    if (!immediateThreat.test(candidate.text)) return false;
    if (preventionRegex.test(candidate.text) && !actualIncidentMarkers.test(candidate.text)) return false;
    return true;
  });

  if (threatMatches.length) {
    return {
      eventType: 'violence_threat',
      severity: 'critical',
      title: 'Possible immediate violence or threat',
      reason: 'Processed narrative or source text contains language associated with an immediate threat or serious violent incident. Human review is required.',
      matchedDocumentIds: threatMatches.map(item => item.documentId).filter(Boolean)
    };
  }

  const seriousSafetyEvent = /\b(killed|fatality|fatal|explosion|fire|outbreak|emergency evacuation)\b/i;
  const safetyMatches = candidates.filter(candidate =>
    seriousSafetyEvent.test(candidate.text) &&
    /\b(institution|campus|school|university|college|hospital|facility|attack|incident|emergency)\b/i.test(candidate.text)
  );
  if (safetyMatches.length) {
    return {
      eventType: 'public_safety',
      severity: 'high',
      title: 'Possible serious public safety incident',
      reason: 'Processed narrative or source text may describe a serious safety event connected to an institution. Verify before acting.',
      matchedDocumentIds: safetyMatches.map(item => item.documentId).filter(Boolean)
    };
  }
  return null;
};

const classifyNarrative = (narrative, documents = [], securityRisk = null) => {
  const risk = securityRisk || detectSecurityRisk(narrative, documents);
  const narrativeText = [
    narrative.narrative || narrative.description,
    narrative.intelligence,
    narrative.recommendation,
    narrative.topic
  ].filter(Boolean).join(' ');

  const docTexts = (documents || []).map(d => d.processingText || d.translatedText || d.rawText || '').join(' ');
  const combinedText = `${narrativeText} ${docTexts}`.toLowerCase();

  const claimCount = narrative.analysis?.claim_count || narrative.supportingEvidence?.claim_ids?.length || 1;
  const sourceCount = narrative.analysis?.source_count || narrative.supportingEvidence?.sources?.length || 1;
  const trend = narrative.trend || narrative.analysis?.trend || 'Stable';
  const sentimentVal = narrative.analysis?.sentiment !== undefined ? Number(narrative.analysis.sentiment) : 0;

  // Collect categorical impact indicators
  const indicators = new Set(narrative.impactIndicators || narrative.analysis?.impact_indicators || []);

  const hasPlacement = /\b(placement|placed|package|lpa|ctc|recruiter|recruitment|hiring|unplaced|internship|job offer|highest package)\b/i.test(combinedText);
  const hasInfrastructure = /\b(hostel|water|mess|food poisoning|electricity|washroom|facility|infrastructure|canteen|hygiene|cleanliness|drinking water)\b/i.test(combinedText);
  const hasAcademic = /\b(faculty|professors|curriculum|exam|syllabus|accreditation|grading|classes|teaching|prof|attendance)\b/i.test(combinedText);
  const hasAchievement = /\b(rank|nirf|hackathon|winner|record|award|patent|grant|milestone|achievement|championship)\b/i.test(combinedText);

  if (hasPlacement) indicators.add('placement_impact');
  if (hasInfrastructure) indicators.add('infrastructure');
  if (hasAcademic) indicators.add('academic');
  if (hasAchievement) indicators.add('achievement');
  if (claimCount >= 3 || sourceCount >= 2) indicators.add('recurring');

  // Safety-critical override
  if (risk && risk.severity === 'critical') {
    indicators.add('safety_critical');
    return {
      direction: 'negative',
      priority: 'critical',
      positiveSignificance: 'none',
      classificationReason: risk.reason || 'Immediate safety, security, or self-harm concern requiring executive review.',
      impactIndicators: Array.from(indicators),
      severityLevel: 'critical',
      severityReason: risk.reason || '',
      isSecurityRisk: true,
      securityRiskCategory: risk.eventType || 'safety'
    };
  }

  // 1. Direction Determination
  let direction = narrative.direction || narrative.analysis?.direction;
  const validDirections = ['positive', 'negative', 'neutral', 'mixed'];
  if (!direction || !validDirections.includes(direction) || direction === 'neutral') {
    const posPattern = /\b(placement|achieve|excellent|strength|success|growth|improved|upgrade|outstanding|top|record|best|happy|satisfied|praise|award|winner|boost|supportive|modern|smooth|great)\b/gi;
    const negPattern = /\b(poor|bad|problem|issue|complaint|deficien|fail|delay|shortage|lack|dirty|broken|protest|unplaced|crisis|harass|corrupt|scam|unhappy|dissatisfied|worse|terrible|horrible|struggle|unhygienic|worst)\b/gi;

    const posMatches = (combinedText.match(posPattern) || []).length;
    const negMatches = (combinedText.match(negPattern) || []).length;

    if (posMatches >= 2 && negMatches >= 2 && Math.min(posMatches, negMatches) / Math.max(posMatches, negMatches) >= 0.4) {
      direction = 'mixed';
    } else if (sentimentVal <= -0.15 || negMatches > posMatches + 1) {
      direction = 'negative';
    } else if (sentimentVal >= 0.15 || posMatches > negMatches + 1) {
      direction = 'positive';
    } else if (posMatches > 0 && negMatches === 0) {
      direction = 'positive';
    } else if (negMatches > 0 && posMatches === 0) {
      direction = 'negative';
    } else {
      direction = 'neutral';
    }
  }

  let priority = 'none';
  let positiveSignificance = 'none';
  let classificationReason = '';

  if (direction === 'negative') {
    const isMajorPlacementCrisis = hasPlacement && /\b(unplaced|scam|blacklisted|boycott|fraud|zero offers|cancelled placements|package drop)\b/i.test(combinedText);
    const isSevereInfrastructure = hasInfrastructure && /\b(contamination|poisoning|no water|uninhabitable|severe|epidemic|hospitalized|crisis|sewage)\b/i.test(combinedText);
    const isHighRecurrence = (claimCount >= 4 || (claimCount >= 2 && sourceCount >= 2)) && sentimentVal <= -0.3;
    const isInstitutionalCrisis = /\b(mass protest|accreditation (loss|revocation|cancelled)|paper leak|exam cancellation|widespread corruption|faculty strike)\b/i.test(combinedText);

    if (isMajorPlacementCrisis) {
      priority = 'high';
      indicators.add('campus_wide');
      classificationReason = 'Major placement crisis or systemic recruitment shortcoming affecting students.';
    } else if (isSevereInfrastructure) {
      priority = 'high';
      indicators.add('campus_wide');
      classificationReason = 'Severe living condition or health-impacting facility deficiency.';
    } else if (isInstitutionalCrisis) {
      priority = 'high';
      indicators.add('campus_wide');
      classificationReason = 'Major institutional controversy or administrative crisis.';
    } else if (isHighRecurrence) {
      priority = 'high';
      indicators.add('campus_wide');
      classificationReason = 'Persistent recurring grievance corroborated across multiple sources or high claim density.';
    } else if ((hasInfrastructure || hasAcademic) && (claimCount >= 2 || /\b(broken|faulty|shortage|unhygienic|leakage|curfew|strict|poor quality|bad food)\b/i.test(combinedText))) {
      priority = 'medium';
      classificationReason = 'Meaningful institutional concern requiring operational or administrative resolution.';
    } else if (claimCount >= 2 || trend === 'Rising') {
      priority = 'medium';
      classificationReason = 'Recurring institutional feedback requiring administrative monitoring.';
    } else {
      priority = 'low';
      indicators.add('routine_feedback');
      classificationReason = 'Routine student feedback or isolated minor inconvenience.';
    }
  } else if (direction === 'positive') {
    const isMajorAchievement = hasAchievement || (hasPlacement && /\b(100%|highest|record|international|crore|top tier|dream offer|faang)\b/i.test(combinedText)) || /\b(top [0-9]+ (rank|nirf|qs)|patent|prestigious)\b/i.test(combinedText);
    const isNotableStrengths = (claimCount >= 2 && sourceCount >= 2) || hasPlacement || hasAcademic || /\b(excellent|outstanding|great support|well organized|state of the art|successful)\b/i.test(combinedText);

    if (isMajorAchievement) {
      positiveSignificance = 'significant';
      indicators.add('record_achievement');
      classificationReason = 'Major institutional milestone, standout placement outcome, or prestigious achievement.';
    } else if (isNotableStrengths) {
      positiveSignificance = 'notable';
      classificationReason = 'Notable highlight reflecting consistent institutional strengths or successful programs.';
    } else {
      positiveSignificance = 'general';
      indicators.add('routine_feedback');
      classificationReason = 'General positive student sentiment and routine positive feedback.';
    }
  } else {
    classificationReason = direction === 'mixed'
      ? 'Balanced multi-faceted observation containing both positive aspects and areas for improvement.'
      : 'Factual procedural observation or informational institutional narrative.';
  }

  // Preserve backwards-compatible severityLevel
  let legacySeverity = 'normal';
  let legacyReason = '';
  if (risk) {
    legacySeverity = risk.severity;
    legacyReason = risk.reason;
  } else if (priority === 'critical') {
    legacySeverity = 'critical';
    legacyReason = classificationReason;
  } else if (priority === 'high' && direction === 'negative') {
    legacySeverity = 'high';
    legacyReason = classificationReason;
  }

  return {
    direction,
    priority,
    positiveSignificance,
    classificationReason,
    impactIndicators: Array.from(indicators),
    severityLevel: legacySeverity,
    severityReason: legacyReason,
    isSecurityRisk: Boolean(risk && risk.severity === 'critical'),
    securityRiskCategory: risk?.eventType || ''
  };
};

const classifySeverity = (narrative, risk) => {
  const result = classifyNarrative(narrative, [], risk);
  return { severityLevel: result.severityLevel, severityReason: result.severityReason };
};


// @desc    Start AI processing job
// @route   POST /api/processing/start
// @access  Private/Admin
const startProcessingJob = async (req, res) => {
  try {
    const { batchId, limit, entityId } = req.body;
    let limitNum = Number(limit);
    if (!limitNum || limitNum <= 0) {
      return res.status(400).json({ message: 'Valid processing limit is required.' });
    }

    let job;
    const query = {};
    if (entityId) query.entityId = entityId;

    if (batchId && batchId !== 'all') {
      query.batchId = batchId;
      job = await ProcessingJob.findOne(query).sort({ createdAt: -1 });
    } else {
      // Find a job for this entity with unprocessed documents
      const candidateJobs = await ProcessingJob.find(query).sort({ createdAt: -1 });
      for (const cj of candidateJobs) {
        if (cj.batchId) {
          const unp = await Document.countDocuments({ batchId: cj.batchId, processingStatus: { $in: ['not_processed', 'pending', 'failed'] } });
          if (unp > 0) {
            job = cj;
            break;
          }
        }
      }
      if (!job && candidateJobs.length > 0) {
        job = candidateJobs[0];
      }
    }

    if (!job || job.status === 'IDLE') {
      return res.status(400).json({ message: 'No valid batch found to process.' });
    }

    // Ensure entityId is present before updating
    if (!job.entityId) {
      if (entityId) {
        job.entityId = entityId;
      } else if (job.batchId) {
        const sampleDoc = await Document.findOne({ batchId: job.batchId, entityId: { $exists: true, $ne: null } });
        if (sampleDoc?.entityId) {
          job.entityId = sampleDoc.entityId;
        }
      }
    }

    if (job.status === 'PROCESSING') {
      return res.status(400).json({ message: 'A processing job is already running.' });
    }

    // Sync current job totals with actual document counts in DB before running
    if (job.batchId) {
      const actualTotal = await Document.countDocuments({ batchId: job.batchId });
      const actualCompleted = await Document.countDocuments({ batchId: job.batchId, processingStatus: 'completed' });
      job.totalDocuments = actualTotal;
      job.processedDocuments = actualCompleted;
    }

    // Reset any lingering 'processing' or 'pending' documents from interrupted runs to not_processed
    const resetQuery = { processingStatus: { $in: ['processing', 'pending'] } };
    if (job.batchId) resetQuery.batchId = job.batchId;
    if (job.entityId) resetQuery.entityId = job.entityId;
    await Document.updateMany(resetQuery, { $set: { processingStatus: 'not_processed', processingStartedAt: null } });

    const docQuery = { processingStatus: { $in: ['not_processed', 'pending', 'failed'] } };
    if (job.batchId) docQuery.batchId = job.batchId;
    if (job.entityId) docQuery.entityId = job.entityId;
    
    const unprocessedCount = await Document.countDocuments(docQuery);
    if (unprocessedCount === 0) {
      return res.status(400).json({ message: 'No pending documents found to process in this batch.' });
    }
    
    if (limitNum > unprocessedCount) {
      limitNum = unprocessedCount;
    }

    // Generate a fresh unique runId for this execution
    const runId = 'RUN_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const abortController = new AbortController();

    // Update job to PROCESSING with new target
    job.runId = runId;
    job.status = 'PROCESSING';
    job.currentRunLimit = limitNum;
    job.requestedDocuments = job.processedDocuments + limitNum;
    job.failedDocuments = 0;
    job.stopRequested = false;
    job.cancelledAt = null;
    job.cancellationReason = null;
    job.startedAt = new Date();
    job.error = null;
    await job.save();

    activeRuns.set(job._id.toString(), {
      runId,
      jobId: job._id.toString(),
      batchId: job.batchId,
      entityId: job.entityId,
      abortController,
      startedAt: new Date()
    });

    // Start background worker
    processDocumentsBackground(job._id, runId);

    res.json({
      success: true,
      message: `Processing started for ${limitNum} documents.`,
      job
    });

  } catch (error) {
    console.error('Start processing error:', error);
    res.status(500).json({ message: 'Internal server error starting job' });
  }
};

const normalizeExistingNarrativesAndTopics = async () => {
  try {
    const narratives = await Narrative.find({});
    for (const nar of narratives) {
      let needsSave = false;
      const entity = await Entity.findOne({ entityId: nar.entityId });
      const cleanTopic = sanitizeTopicName(nar.topic, entity?.name, entity?.domain);
      if (cleanTopic !== nar.topic) {
        nar.topic = cleanTopic;
        needsSave = true;
      }

      let currentTrend = nar.trend || nar.analysis?.trend || nar.analysis?.recurrence;
      if (!currentTrend || currentTrend === 'stable' || currentTrend === 'increasing' || currentTrend === 'decreasing') {
        const timeline = nar.analysis?.temporal_information?.timeline || [];
        if (currentTrend === 'increasing') nar.trend = 'Rising';
        else if (currentTrend === 'decreasing') nar.trend = 'Declining';
        else if (timeline.length >= 2) nar.trend = 'Stable';
        else nar.trend = 'Insufficient Data';
        needsSave = true;
      }

      if (nar.isEligibleForDisplay === undefined || nar.displayStatus === undefined) {
        const cCount = nar.analysis?.claim_count || 0;
        const sCount = nar.analysis?.source_count || (nar.supportingEvidence?.sources?.length || 0);
        const strength = nar.analysis?.strength || 0;
        const isEligible = (sCount >= 2) || (cCount >= 2 && strength >= 0.35) || (nar.severityLevel !== 'normal');
        nar.displayStatus = isEligible ? 'established' : 'candidate';
        nar.isEligibleForDisplay = isEligible;
        nar.eligibilityReason = isEligible ? 'Corroborated by multiple sources or claims' : 'Single claim from single source - retained as candidate observation';
        needsSave = true;
      }

      if (!nar.direction || !nar.priority || (nar.direction === 'negative' && nar.priority === 'none') || (nar.direction === 'positive' && nar.positiveSignificance === 'none')) {
        const referencedDocumentIds = (nar.supportingEvidence?.document_ids || []).filter(id => /^[a-f\d]{24}$/i.test(String(id)));
        const sourceDocs = referencedDocumentIds.length
          ? await Document.find({ _id: { $in: referencedDocumentIds } }).limit(20)
          : [];
        const risk = detectSecurityRisk(nar, sourceDocs);
        const classification = classifyNarrative(nar, sourceDocs, risk);

        nar.direction = classification.direction;
        nar.priority = classification.priority;
        nar.positiveSignificance = classification.positiveSignificance;
        nar.classificationReason = classification.classificationReason;
        nar.impactIndicators = classification.impactIndicators;
        nar.severityLevel = classification.severityLevel;
        nar.severityReason = classification.severityReason;
        nar.isSecurityRisk = classification.isSecurityRisk;
        nar.securityRiskCategory = classification.securityRiskCategory;
        needsSave = true;
      }

      if (needsSave) {
        if (!nar.analysis) nar.analysis = {};
        nar.analysis.trend = nar.trend;
        nar.analysis.display_status = nar.displayStatus;
        nar.analysis.is_eligible = nar.isEligibleForDisplay;
        nar.analysis.eligibility_reason = nar.eligibilityReason;
        nar.analysis.direction = nar.direction;
        nar.analysis.priority = nar.priority;
        nar.analysis.positive_significance = nar.positiveSignificance;
        nar.analysis.classification_reason = nar.classificationReason;
        nar.analysis.impact_indicators = nar.impactIndicators;
        await nar.save();
      }
    }

    const topics = await Topic.find({});
    const entities = await Entity.find({});
    const singleEntityId = entities.length === 1 ? entities[0].entityId : null;

    for (const t of topics) {
      try {
        let dirty = false;

        // If topic record is missing entityId, attempt to recover it
        if (!t.entityId) {
          const matchingNar = await Narrative.findOne({
            topic: t.name,
            entityId: { $exists: true, $ne: null }
          });
          if (matchingNar?.entityId) {
            t.entityId = matchingNar.entityId;
            dirty = true;
          } else if (singleEntityId) {
            t.entityId = singleEntityId;
            dirty = true;
          }
        }

        if (!t.entityId) {
          console.warn(`[Topic Normalization] Skipping legacy topic "${t.name}" without entityId`);
          continue;
        }

        const entity = entities.find(e => e.entityId === t.entityId) || await Entity.findOne({ entityId: t.entityId });
        const cleanName = sanitizeTopicName(t.name, entity?.name, entity?.domain);

        if (cleanName !== t.name) {
          // Check for collision with an existing topic under the same entity
          const existingSameName = await Topic.findOne({
            entityId: t.entityId,
            name: cleanName,
            _id: { $ne: t._id }
          });
          if (existingSameName) {
            // Re-point any narratives using the old name and remove the duplicate topic record
            await Narrative.updateMany({ entityId: t.entityId, topic: t.name }, { topic: cleanName });
            await Topic.deleteOne({ _id: t._id });
            continue;
          }
          t.name = cleanName;
          dirty = true;
        }

        if (dirty) {
          await t.save();
        }
      } catch (topicErr) {
        console.warn(`[Topic Normalization] Could not normalize topic "${t.name}":`, topicErr.message);
      }
    }
  } catch (err) {
    console.error('Error during startup normalization of narratives and topics:', err);
  }
};

/**
 * Reclassifies all existing narratives or those belonging to a specific entity.
 */
const reclassifyAllNarratives = async (entityId = null) => {
  try {
    const query = entityId ? { entityId } : {};
    const narratives = await Narrative.find(query);
    let count = 0;
    for (const nar of narratives) {
      const referencedDocumentIds = (nar.supportingEvidence?.document_ids || []).filter(id => /^[a-f\d]{24}$/i.test(String(id)));
      const sourceDocs = referencedDocumentIds.length
        ? await Document.find({ _id: { $in: referencedDocumentIds } }).limit(20)
        : [];
      const risk = detectSecurityRisk(nar, sourceDocs);
      const classification = classifyNarrative(nar, sourceDocs, risk);

      nar.direction = classification.direction;
      nar.priority = classification.priority;
      nar.positiveSignificance = classification.positiveSignificance;
      nar.classificationReason = classification.classificationReason;
      nar.impactIndicators = classification.impactIndicators;
      nar.severityLevel = classification.severityLevel;
      nar.severityReason = classification.severityReason;
      nar.isSecurityRisk = classification.isSecurityRisk;
      nar.securityRiskCategory = classification.securityRiskCategory;

      if (!nar.analysis) nar.analysis = {};
      nar.analysis.direction = classification.direction;
      nar.analysis.priority = classification.priority;
      nar.analysis.positive_significance = classification.positiveSignificance;
      nar.analysis.classification_reason = classification.classificationReason;
      nar.analysis.impact_indicators = classification.impactIndicators;

      await nar.save();
      count++;
    }
    console.log(`[Reclassification] Successfully reclassified ${count} narratives${entityId ? ` for entity ${entityId}` : ''}.`);
    return count;
  } catch (err) {
    console.error('Error in reclassifyAllNarratives:', err);
    throw err;
  }
};

/**
 * Reconciles all ProcessingJob records against authoritative document counts in MongoDB.
 * Corrects stale totalDocuments / processedDocuments caused by document deletions.
 */
const reconcileJobDocumentCounts = async () => {
  try {
    const jobs = await ProcessingJob.find({});
    for (const job of jobs) {
      if (!job.batchId) continue;
      const actualTotal = await Document.countDocuments({ batchId: job.batchId });
      if (actualTotal === 0) {
        if (job.status !== 'IDLE') {
          job.status = 'IDLE';
          job.totalDocuments = 0;
          job.processedDocuments = 0;
          job.failedDocuments = 0;
          await job.save();
        }
        continue;
      }
      const actualCompleted = await Document.countDocuments({ batchId: job.batchId, processingStatus: 'completed' });
      const actualFailed = await Document.countDocuments({ batchId: job.batchId, processingStatus: 'failed' });
      const actualUnprocessed = await Document.countDocuments({ batchId: job.batchId, processingStatus: { $in: ['not_processed', 'pending'] } });

      let needsSave = false;
      if (job.totalDocuments !== actualTotal) {
        job.totalDocuments = actualTotal;
        needsSave = true;
      }
      if (job.processedDocuments !== actualCompleted) {
        job.processedDocuments = actualCompleted;
        needsSave = true;
      }
      if (job.failedDocuments !== actualFailed) {
        job.failedDocuments = actualFailed;
        needsSave = true;
      }
      if (actualUnprocessed === 0 && actualCompleted === actualTotal && !['PROCESSING', 'STOP_REQUESTED'].includes(job.status)) {
        if (job.status !== 'COMPLETED') {
          job.status = 'COMPLETED';
          needsSave = true;
        }
      } else if (actualUnprocessed > 0 && !['PROCESSING', 'STOP_REQUESTED'].includes(job.status)) {
        if (job.status === 'COMPLETED') {
          // Reconcile: A batch with remaining unprocessed documents is PARTIALLY PROCESSED / READY, not COMPLETED
          job.status = 'READY';
          needsSave = true;
        }
      }
      if (needsSave && job.entityId) {
        await job.save();
      }
    }
    console.log('[Reconciliation] Synced all ProcessingJob records with authoritative MongoDB documents.');
  } catch (err) {
    console.error('Error in reconcileJobDocumentCounts:', err);
  }
};

export {
  getSources,
  getNarratives,
  getNarrativeById,
  getDashboardHighlights,
  getAttentionHighlightsForEntity,
  getProcessingStatus,
  getJobStatus,
  startProcessingJob,
  stopProcessingJob,
  processDocumentsBackground,
  reconcileInterruptedJobs,
  normalizeExistingNarrativesAndTopics,
  reconcileJobDocumentCounts,
  reclassifyAllNarratives,
  classifyNarrative,
  detectSecurityRisk
};
