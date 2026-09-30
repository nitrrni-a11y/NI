import Claim from '../models/Claim.js';
import Narrative from '../models/Narrative.js';
import News from '../models/News.js';

// @desc    Get all unique sources
// @route   GET /api/sources
// @access  Private
const getSources = async (req, res) => {
  try {
    // Aggregate distinct sources and count them
    const sources = await News.aggregate([
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

// @desc    Get all topics
// @route   GET /api/topics
// @access  Private
const getTopics = async (req, res) => {
  try {
    // Unwind topics array and count occurrences
    const topics = await News.aggregate([
      { $unwind: "$topics" },
      { $group: { _id: "$topics", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const formatted = topics.map(t => ({
      topic: t._id,
      count: t.count
    }));

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching topics' });
  }
};

// @desc    Get claims (placeholder/future-ready)
// @route   GET /api/claims
// @access  Private
const getClaims = async (req, res) => {
  try {
    const claims = await Claim.find({}).sort({ createdAt: -1 }).limit(50).populate('documentId', 'title source');
    res.json(claims);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching claims' });
  }
};

// @desc    Get single claim
// @route   GET /api/claims/:id
// @access  Private
const getClaimById = async (req, res) => {
  try {
    const claim = await Claim.findById(req.params.id).populate('documentId', 'title source rawText');
    if (claim) {
      res.json(claim);
    } else {
      res.status(404).json({ message: 'Claim not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching claim' });
  }
};

// @desc    Get narratives
// @route   GET /api/narratives
// @access  Private
const getNarratives = async (req, res) => {
  try {
    const narratives = await Narrative.find({}).sort({ score: -1, lastObservedAt: -1 }).limit(20);
    res.json(narratives);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching narratives' });
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
    const stats = await News.aggregate([
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

// @desc    Trigger AI processing batch for unprocessed documents
// @route   POST /api/processing/run-batch
// @access  Private/Admin
const runBatchProcessing = async (req, res) => {
  try {
    const batchSize = Number(req.query.batchSize) || 10;

    // 1. Fetch unprocessed documents
    const unprocessedDocs = await News.find({
      processingStatus: { $in: ['not_processed', 'pending', 'failed'] }
    }).limit(batchSize);

    if (unprocessedDocs.length === 0) {
      return res.json({
        success: true,
        message: 'No pending documents found to process.',
        documentsProcessed: 0
      });
    }

    const docIds = unprocessedDocs.map(d => d._id);

    // 2. Mark documents as 'processing'
    await News.updateMany(
      { _id: { $in: docIds } },
      { $set: { processingStatus: 'processing', processingStartedAt: new Date() } }
    );

    // 3. Format documents for AI service schema
    const formattedDocs = unprocessedDocs.map(d => ({
      document_id: d._id.toString(),
      text: d.rawText || d.content,
      source: d.source || 'Unknown',
      source_type: d.sourceType || 'Unknown',
      author: d.author || 'Unknown',
      published_at: d.publicationDate ? d.publicationDate.toISOString() : null,
      collected_at: d.collectedDate ? d.collectedDate.toISOString() : null
    }));

    // 4. Fetch existing narratives from DB for identity resolution
    const existingNarrativesList = await Narrative.find({}, { narrativeId: 1, description: 1 });
    const formattedExisting = existingNarrativesList.map(n => ({
      narrative_id: n.narrativeId,
      text: n.description
    }));

    // 5. Call AI microservice
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    let aiResponse;
    try {
      const response = await axios.post(`${aiServiceUrl}/process/batch`, {
        documents: formattedDocs,
        existing_narratives: formattedExisting
      }, { timeout: 120000 }); // 2 min timeout for AI calls
      aiResponse = response.data;
    } catch (aiErr) {
      // Revert status to failed
      await News.updateMany(
        { _id: { $in: docIds } },
        { 
          $set: { 
            processingStatus: 'failed', 
            processingError: aiErr.response?.data?.detail || aiErr.message 
          } 
        }
      );
      return res.status(502).json({
        message: `AI Service connection error: ${aiErr.response?.data?.detail || aiErr.message}. Ensure Python FastAPI is running on port 8000.`,
      });
    }

    // 6. Save or update Narratives
    if (aiResponse.narratives && Array.isArray(aiResponse.narratives)) {
      for (const nar of aiResponse.narratives) {
        await Narrative.findOneAndUpdate(
          { narrativeId: nar.narrative_id },
          {
            $set: {
              narrativeId: nar.narrative_id,
              description: nar.narrative,
              intelligence: nar.intelligence || '',
              recommendation: nar.recommendation || '',
              supportingEvidence: nar.supporting_evidence || {},
              analysis: nar.analysis || {},
              score: nar.analysis?.strength || 0,
              scoreComponents: nar.analysis || {},
              trend: nar.analysis?.recurrence === 'high' ? 'increasing' : 'stable',
              trendStrength: nar.analysis?.strength || 0,
              lastObservedAt: new Date(),
            },
            $addToSet: {
              claimIds: { $each: nar.supporting_evidence?.claim_ids || [] }
            }
          },
          { upsert: true, new: true }
        );
      }
    }

    // 7. Mark processed documents as completed
    await News.updateMany(
      { _id: { $in: docIds } },
      { 
        $set: { 
          processingStatus: 'completed', 
          processingCompletedAt: new Date(),
          processingError: ''
        } 
      }
    );

    res.json({
      success: true,
      message: `Successfully processed ${unprocessedDocs.length} documents!`,
      documentsProcessed: unprocessedDocs.length,
      narrativesCount: aiResponse.narratives?.length || 0,
      data: aiResponse
    });

  } catch (error) {
    console.error('Batch processing error:', error);
    res.status(500).json({ message: 'Internal server error during batch processing' });
  }
};

export {
  getSources,
  getTopics,
  getClaims,
  getClaimById,
  getNarratives,
  getNarrativeById,
  getProcessingStatus,
  runBatchProcessing
};

