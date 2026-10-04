import Narrative from '../models/Narrative.js';
import Document from '../models/Document.js';
import ProcessingJob from '../models/ProcessingJob.js';

// @desc    Get all unique sources
// @route   GET /api/sources
// @access  Private
const getSources = async (req, res) => {
  try {
    // Aggregate distinct sources and count them
    const sources = await Document.aggregate([
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

// @desc    Get narratives
// @route   GET /api/narratives
// @access  Private
const getNarratives = async (req, res) => {
  try {

    const allNarratives = await Narrative.find({});
    const narratives = await Narrative.find({})
      .sort({ 'analysis.strength': -1, lastObservedAt: -1 })
      .limit(50);
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
// @access  Private
const getNarrativeById = async (req, res) => {
  try {
    const narrative = await Narrative.findById(req.params.id);
    if (narrative) {
      res.json(narrative);
    } else {
      res.status(404).json({ message: 'Narrative not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching narrative' });
  }
};

// @desc    Get processing status overview
// @route   GET /api/processing/status
// @access  Private/Admin
const getProcessingStatus = async (req, res) => {
  try {
    const stats = await Document.aggregate([
      { $group: { _id: "$processingStatus", count: { $sum: 1 } } }
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

    res.json({
      total,
      breakdown: statusMap,
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
    let jobs = await ProcessingJob.find().sort({ createdAt: -1 }).limit(10);
    let currentJob = null;
    
    // Find the most recent job that still has documents in the database
    for (const job of jobs) {
      if (job.batchId) {
        const docCount = await Document.countDocuments({ batchId: job.batchId });
        if (docCount > 0) {
          currentJob = job;
          break;
        }
      }
    }
    
    if (!currentJob) {
      // Return a dummy empty job if no valid batch exists
      currentJob = { status: 'IDLE', totalDocuments: 0, processedDocuments: 0 };
    }
    res.json(currentJob);
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
    let job = await ProcessingJob.findOne().sort({ createdAt: -1 });
    if (job && job.status === 'PROCESSING') {
      job.stopRequested = true;
      await job.save();
    }
    res.json({ success: true, message: 'Stop requested' });
  } catch (error) {
    res.status(500).json({ message: 'Server error stopping job' });
  }
};

// Background worker
const processDocumentsBackground = async (jobId) => {
  try {
    let job = await ProcessingJob.findById(jobId);
    if (!job) return;

    const batchSize = 10;
    
    while (true) {
      // Reload job to check for stop request
      job = await ProcessingJob.findById(jobId);
      if (job.stopRequested) {
        job.status = 'STOPPED';
        job.completedAt = new Date();
        await job.save();
        return;
      }
      
      if (job.processedDocuments >= job.requestedDocuments) {
        // We reached the limit for this run
        job.status = 'COMPLETED'; // UI uses COMPLETED to show summary, then allows starting again
        job.completedAt = new Date();
        await job.save();
        return;
      }

      const remainingToProcess = job.requestedDocuments - job.processedDocuments;
      const currentBatchSize = Math.min(batchSize, remainingToProcess);

      // Fetch unprocessed documents for this batch
      const query = { processingStatus: { $in: ['not_processed', 'pending', 'failed'] } };
      if (job.batchId) {
        query.batchId = job.batchId;
      }
      
      const unprocessedDocs = await Document.find(query).limit(currentBatchSize);

      if (unprocessedDocs.length === 0) {
        job.status = 'COMPLETED';
        job.completedAt = new Date();
        await job.save();
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
        source: d.source || 'Unknown',
        source_type: d.sourceType || 'Unknown',
        author: d.author || 'Unknown',
        published_at: d.publicationDate ? d.publicationDate.toISOString() : null,
        collected_at: d.collectedDate ? d.collectedDate.toISOString() : null
      }));

      // Fetch existing narratives
      const existingNarrativesList = await Narrative.find({});
      const formattedExisting = existingNarrativesList.map(n => ({
        narrative_id: n.narrativeId,
        text: n.description,
        topic: n.topic || 'Unknown',
        claim_count: n.analysis?.claim_count || 0,
        source_count: n.analysis?.source_count || 0,
        claim_ids: n.supportingEvidence?.claim_ids || [],
        document_ids: n.supportingEvidence?.document_ids || [],
        sources: n.supportingEvidence?.sources || [],
        sentiment: n.analysis?.sentiment || 0.0
      }));

      let aiResponse;
      try {
        const aiService = (await import('../services/aiService.js')).default;
        aiResponse = await aiService.processBatch(formattedDocs, formattedExisting);
      } catch (aiErr) {
        // AI Error
        await Document.updateMany({ _id: { $in: docIds } }, { $set: { processingStatus: 'failed', processingError: aiErr.message } });
        job.status = 'FAILED';
        job.error = aiErr.message;
        job.completedAt = new Date();
        await job.save();
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

          await Narrative.findOneAndUpdate(
            { narrativeId: nar.narrative_id },
            {
              $set: {
                narrativeId: nar.narrative_id,
                topic: nar.topic || 'Unknown',
                description: nar.narrative,
                intelligence: nar.intelligence || '',
                recommendation: nar.recommendation || '',
                supportingEvidence: nar.supporting_evidence || {},
                analysis: nar.analysis || {},
                lastObservedAt: new Date(),
              }
            },
            { upsert: true, new: true }
          );
        }
      }

      // Mark processed documents as completed
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
      
      // Update Job Progress
      job.processedDocuments += unprocessedDocs.length;
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
        job.status = 'FAILED';
        job.error = err.message;
        job.completedAt = new Date();
        await job.save();
      }
    } catch(e){}
  }
};

// @desc    Start AI processing job
// @route   POST /api/processing/start
// @access  Private/Admin
const startProcessingJob = async (req, res) => {
  try {
    const { batchId, limit } = req.body;
    let limitNum = Number(limit);
    if (!limitNum || limitNum <= 0) {
      return res.status(400).json({ message: 'Valid processing limit is required.' });
    }

    let job;
    if (batchId) {
      job = await ProcessingJob.findOne({ batchId: batchId }).sort({ createdAt: -1 });
    } else {
      job = await ProcessingJob.findOne().sort({ createdAt: -1 });
    }

    if (!job || job.status === 'IDLE') {
      return res.status(400).json({ message: 'No valid batch found to process.' });
    }

    if (job.status === 'PROCESSING') {
      return res.status(400).json({ message: 'A processing job is already running.' });
    }

    const query = { processingStatus: { $in: ['not_processed', 'pending', 'failed'] } };
    if (job.batchId) query.batchId = job.batchId;
    
    const unprocessedCount = await Document.countDocuments(query);
    if (unprocessedCount === 0) {
      return res.status(400).json({ message: 'No pending documents found to process in this batch.' });
    }
    
    if (limitNum > unprocessedCount) {
      limitNum = unprocessedCount;
    }

    // Update job to PROCESSING with new target
    job.status = 'PROCESSING';
    job.requestedDocuments = job.processedDocuments + limitNum;
    job.stopRequested = false;
    job.startedAt = new Date();
    job.error = null;
    await job.save();

    // Start background worker
    processDocumentsBackground(job._id);

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

export {
  getSources,
  getNarratives,
  getNarrativeById,
  getProcessingStatus,
  getJobStatus,
  startProcessingJob,
  stopProcessingJob
};
