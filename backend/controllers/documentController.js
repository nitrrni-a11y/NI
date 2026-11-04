import Document from '../models/Document.js';
import ProcessingJob from '../models/ProcessingJob.js';

// @desc    Get all documents with filtering, search, and pagination
// @route   GET /api/documents
// @access  Private (User/Admin)
const getDocuments = async (req, res) => {
  try {
    const { keyword, source, sourceType, status, pageNumber, limit: reqLimit, entity_id } = req.query;
    
    // Pagination defaults
    const page = Number(pageNumber) || 1;
    const limit = Number(reqLimit) || 12;
    const skip = limit * (page - 1);
    
    // Build query
    const query = {};
    if (entity_id) {
      query.entityId = entity_id;
    }
    
    if (keyword) {
      query.$or = [
        { title: { $regex: keyword, $options: 'i' } },
        { rawText: { $regex: keyword, $options: 'i' } }
      ];
    }
    
    if (source) query.source = source;
    if (sourceType) query.sourceType = sourceType;
    if (status) query.processingStatus = status;

    const count = await Document.countDocuments(query);
    const documents = await Document.find(query)
      .sort({ collectedDate: -1, publicationDate: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      documents,
      page,
      pages: Math.ceil(count / limit),
      total: count
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching documents' });
  }
};

// @desc    Get single document by ID
// @route   GET /api/documents/:id
// @access  Private (User/Admin)
const getDocumentById = async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (document) {
      res.json(document);
    } else {
      res.status(404).json({ message: 'Document not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching document' });
  }
};

// @desc    Add new document
// @route   POST /api/documents
// @access  Private/Admin
const addDocument = async (req, res) => {
  const { 
    title, rawText, source, sourceType, url, 
    author, publicationDate, collectedDate,
    entity_id, entityId
  } = req.body;

  try {
    const targetEntityId = entityId || entity_id;
    if (!targetEntityId) {
      return res.status(400).json({ message: 'Entity ID is required' });
    }

    // Basic validation
    if (!rawText) {
      return res.status(400).json({ message: 'Raw text is required' });
    }
    if (!source) {
      return res.status(400).json({ message: 'Source is required' });
    }

    const document = new Document({
      entityId: targetEntityId,
      title: title || 'Untitled',
      rawText,
      source,
      sourceType: sourceType || 'Unknown',
      url: url || '',
      author: author || 'Unknown',
      publicationDate: publicationDate || null,
      collectedDate: collectedDate || Date.now(),
      processingStatus: 'not_processed'
    });

    const createdDocument = await document.save();
    res.status(201).json(createdDocument);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message || 'Invalid data provided for document creation' });
  }
};

// @desc    Upload CSV to be parsed by AI service and saved to DB
// @route   POST /api/documents/upload
// @access  Private/Admin
const uploadCsv = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No CSV file uploaded' });
    }

    const { entity_id } = req.body;
    if (!entity_id) {
      return res.status(400).json({ message: 'entity_id is required' });
    }

    const aiService = (await import('../services/aiService.js')).default;
    
    // 0. Pre-flight health check to ensure Python AI service is accessible
    const health = await aiService.checkHealth();
    if (!health.healthy) {
      return res.status(503).json({
        success: false,
        code: 'AI_SERVICE_UNAVAILABLE',
        message: 'Python AI Service is currently offline or unreachable at ' + health.url + '. Please start the AI service on port 8000 and try again.',
        suggestion: 'Run "python -m uvicorn app.main:app --port 8000" in the ai directory.'
      });
    }

    // 1. Send file buffer to AI service to parse
    const aiResponse = await aiService.parseCSV(req.file.buffer, req.file.originalname);
    
    if (!aiResponse || !aiResponse.documents || aiResponse.documents.length === 0) {
      return res.status(400).json({ message: 'Failed to parse documents from CSV.' });
    }

    const parseDate = (dateStr) => {
      if (!dateStr) return null;
      let d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d;
      const parts = dateStr.split(' ')[0].split(/[-/]/);
      if (parts.length === 3) {
        d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        if (!isNaN(d.getTime())) return d;
      }
      return null;
    };

    const batchId = `BATCH_${Date.now()}`;

    // 2. Save parsed documents to database
    let savedCount = 0;
    for (const doc of aiResponse.documents) {
      const document = new Document({
        title: '',
        rawText: doc.text,
        source: doc.source,
        sourceType: doc.source_type,
        author: doc.author,
        publicationDate: parseDate(doc.published_at),
        collectedDate: parseDate(doc.collected_at) || Date.now(),
        processingStatus: 'not_processed',
        batchId: batchId,
        entityId: entity_id
      });
      await document.save();
      savedCount++;
    }

    if (savedCount > 0) {
      await ProcessingJob.create({
        batchId: batchId,
        entityId: entity_id,
        status: 'READY',
        totalDocuments: savedCount,
        processedDocuments: 0,
        newNarrativesAdded: 0,
        existingNarrativesUpdated: 0,
        claimsExtracted: 0
      });
    }

    res.status(201).json({
      success: true,
      message: `Successfully uploaded and parsed ${savedCount} documents from CSV!`,
      totalRows: aiResponse.total_rows,
      savedCount: savedCount
    });
  } catch (error) {
    console.error('CSV upload error:', error);
    if (error.code === 'AI_SERVICE_UNAVAILABLE' || error.isConnectionError) {
      return res.status(503).json({
        success: false,
        code: 'AI_SERVICE_UNAVAILABLE',
        message: error.message,
        suggestion: 'Run "python -m uvicorn app.main:app --port 8000" in the ai directory.'
      });
    }
    res.status(500).json({ message: error.message || 'Server error during CSV upload' });
  }
};

// @desc    Delete a document
// @route   DELETE /api/documents/:id
// @access  Private/Admin
const deleteDocument = async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    const batchId = document.batchId;
    const entityId = document.entityId;

    await Document.deleteOne({ _id: document._id });

    // Reconcile associated processing job if document belonged to a batch
    if (batchId) {
      try {
        const remainingTotal = await Document.countDocuments({ batchId });
        const remainingCompleted = await Document.countDocuments({ batchId, processingStatus: 'completed' });
        const remainingFailed = await Document.countDocuments({ batchId, processingStatus: 'failed' });
        const remainingUnprocessed = await Document.countDocuments({ batchId, processingStatus: { $in: ['not_processed', 'pending'] } });

        const updateData = {
          totalDocuments: remainingTotal,
          processedDocuments: remainingCompleted,
          failedDocuments: remainingFailed
        };
        if (remainingTotal === 0) {
          updateData.status = 'IDLE';
        } else if (remainingUnprocessed === 0 && remainingCompleted === remainingTotal) {
          updateData.status = 'COMPLETED';
        }

        await ProcessingJob.updateMany({ batchId }, { $set: updateData });
      } catch (syncErr) {
        console.error('[deleteDocument] Error syncing job counts:', syncErr.message);
      }
    }

    res.json({ message: 'Document removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error deleting document' });
  }
};

// @desc    Bulk delete documents
// @route   POST /api/documents/bulk-delete
// @access  Private/Admin
const bulkDeleteDocuments = async (req, res) => {
  try {
    const { documentIds } = req.body;
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ message: 'No document IDs provided' });
    }
    
    // Identify distinct batches and entities affected before deletion
    const affectedDocs = await Document.find({ _id: { $in: documentIds } }, { batchId: 1, entityId: 1 }).lean();
    const batchSet = new Set();
    affectedDocs.forEach(d => {
      if (d.batchId) batchSet.add(d.batchId);
    });

    const result = await Document.deleteMany({
      _id: { $in: documentIds }
    });

    // Reconcile all affected processing jobs
    for (const bId of batchSet) {
      try {
        const remainingTotal = await Document.countDocuments({ batchId: bId });
        const remainingCompleted = await Document.countDocuments({ batchId: bId, processingStatus: 'completed' });
        const remainingFailed = await Document.countDocuments({ batchId: bId, processingStatus: 'failed' });
        const remainingUnprocessed = await Document.countDocuments({ batchId: bId, processingStatus: { $in: ['not_processed', 'pending'] } });

        const updateData = {
          totalDocuments: remainingTotal,
          processedDocuments: remainingCompleted,
          failedDocuments: remainingFailed
        };
        if (remainingTotal === 0) {
          updateData.status = 'IDLE';
        } else if (remainingUnprocessed === 0 && remainingCompleted === remainingTotal) {
          updateData.status = 'COMPLETED';
        }

        await ProcessingJob.updateMany({ batchId: bId }, { $set: updateData });
      } catch (syncErr) {
        console.error(`[bulkDeleteDocuments] Error syncing job counts for batch ${bId}:`, syncErr.message);
      }
    }
    
    res.json({ message: `${result.deletedCount} documents removed` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error bulk deleting documents' });
  }
};

// @desc    Extract YouTube transcript, comments, or both
// @route   POST /api/documents/youtube/extract
// @access  Private/Admin
const extractYouTube = async (req, res) => {
  try {
    const { 
      url,
      extractTranscript = true,
      extractComments = false,
      maxComments = 50
    } = req.body;

    if (!url || !url.trim()) {
      return res.status(400).json({ message: 'YouTube URL is required' });
    }

    if (!extractTranscript && !extractComments) {
      return res.status(400).json({ message: 'At least one extraction option (Transcript or Comments) must be selected.' });
    }

    const youtubeService = (await import('../services/youtubeService.js')).default;
    const result = await youtubeService.extractYouTubeData({
      url: url.trim(),
      extractTranscript: Boolean(extractTranscript),
      extractComments: Boolean(extractComments),
      maxComments: Number(maxComments) || 50
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('[YouTube-Extract-Error]', error.message);
    return res.status(400).json({ message: error.message || 'Failed to extract selected YouTube data' });
  }
};

// @desc    Ingest extracted YouTube data (transcript, comments, or both) into MongoDB Document collection
// @route   POST /api/documents/youtube/ingest
// @access  Private/Admin
const ingestYouTube = async (req, res) => {
  try {
    const {
      entityId,
      entity_id,
      videoId,
      videoUrl,
      videoTitle,
      videoAuthor,
      videoPublicationDate,
      transcript,
      comments
    } = req.body;

    const targetEntityId = entityId || entity_id;
    if (!targetEntityId) {
      return res.status(400).json({ message: 'Entity ID is required' });
    }
    if (!videoId) {
      return res.status(400).json({ message: 'Video ID is required' });
    }

    const youtubeService = (await import('../services/youtubeService.js')).default;
    const result = await youtubeService.ingestYouTubeData({
      entityId: targetEntityId,
      videoId,
      videoUrl,
      videoTitle,
      videoAuthor,
      videoPublicationDate,
      transcript,
      comments
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error('[YouTube-Ingest-Error]', error.message);
    return res.status(400).json({ message: error.message || 'Failed to ingest YouTube data' });
  }
};

export { 
  getDocuments, 
  getDocumentById, 
  addDocument, 
  uploadCsv, 
  deleteDocument, 
  bulkDeleteDocuments, 
  extractYouTube,
  ingestYouTube
};
