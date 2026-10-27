import Narrative from '../models/Narrative.js';
import Document from '../models/Document.js';
import ProcessingJob from '../models/ProcessingJob.js';
import Entity from '../models/Entity.js';
import Topic from '../models/Topic.js';

// @desc    Get all unique sources
// @route   GET /api/sources
// @access  Private
const getSources = async (req, res) => {
  try {
    const { entity_id } = req.query;
    const matchStage = entity_id ? { $match: { entityId: entity_id } } : { $match: {} };

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

// @desc    Get narratives
// @route   GET /api/narratives
// @access  Private
const getNarratives = async (req, res) => {
  try {

    const { entity_id } = req.query;
    const query = {};
    if (entity_id) {
      query.entityId = entity_id;
    }
    
    const allNarratives = await Narrative.find(query);
    const narratives = await Narrative.find(query)
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
    const { entity_id } = req.query;
    const matchStage = entity_id ? { $match: { entityId: entity_id } } : { $match: {} };

    const stats = await Document.aggregate([
      matchStage,
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
    const { entity_id } = req.query;
    const query = {};
    if (entity_id) {
      query.entityId = entity_id;
    }
    let jobs = await ProcessingJob.find(query).sort({ createdAt: -1 }).limit(10);
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
    const { entityId } = req.body;
    const query = entityId ? { entityId } : {};
    let job = await ProcessingJob.findOne(query).sort({ createdAt: -1 });
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

    // Batch size allows processing up to 10 documents per AI batch chunk,
    // while honoring smaller requested limits (e.g., 1, 2, 4, 5).
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
      const query = { processingStatus: { $in: ['not_processed', 'pending', 'failed'] }, entityId: job.entityId };
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
        sentiment: n.analysis?.sentiment || 0.0
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
        aiResponse = await aiService.processBatch(formattedDocs, formattedExisting, entityContext, formattedTopics);
      } catch (aiErr) {
        // AI Error: Mark only this current sub-batch documents as failed
        await Document.updateMany({ _id: { $in: docIds } }, { $set: { processingStatus: 'failed', processingError: aiErr.message } });
        job.status = 'FAILED';
        job.error = aiErr.message;
        job.failedDocuments = (job.failedDocuments || 0) + docIds.length;
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
                entityId: job.entityId,
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

          // Save new topic if the AI decided to create one
          if (nar.is_new_topic && nar.topic && nar.topic !== 'Unknown') {
            try {
              const topicIdToSave = nar.topic_id || `TOPIC_${Date.now()}`;
              await Topic.updateOne(
                { entityId: job.entityId, name: nar.topic },
                { $set: { topicId: topicIdToSave, name: nar.topic, entityId: job.entityId } },
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
    const { batchId, limit, entityId } = req.body;
    let limitNum = Number(limit);
    if (!limitNum || limitNum <= 0) {
      return res.status(400).json({ message: 'Valid processing limit is required.' });
    }

    let job;
    const query = {};
    if (entityId) query.entityId = entityId;

    if (batchId) {
      query.batchId = batchId;
      job = await ProcessingJob.findOne(query).sort({ createdAt: -1 });
    } else {
      job = await ProcessingJob.findOne(query).sort({ createdAt: -1 });
    }

    if (!job || job.status === 'IDLE') {
      return res.status(400).json({ message: 'No valid batch found to process.' });
    }

    if (job.status === 'PROCESSING') {
      return res.status(400).json({ message: 'A processing job is already running.' });
    }

    // Reset any lingering 'processing' documents from interrupted runs to pending
    const resetQuery = { processingStatus: 'processing' };
    if (job.batchId) resetQuery.batchId = job.batchId;
    if (job.entityId) resetQuery.entityId = job.entityId;
    await Document.updateMany(resetQuery, { $set: { processingStatus: 'pending' } });

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

    // Update job to PROCESSING with new target
    job.status = 'PROCESSING';
    job.currentRunLimit = limitNum;
    job.requestedDocuments = job.processedDocuments + limitNum;
    job.failedDocuments = 0;
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
  stopProcessingJob,
  processDocumentsBackground
};
