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
    await Document.deleteOne({ _id: document._id });
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
    
    const result = await Document.deleteMany({
      _id: { $in: documentIds }
    });
    
    res.json({ message: `${result.deletedCount} documents removed` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error bulk deleting documents' });
  }
};

export { getDocuments, getDocumentById, addDocument, uploadCsv, deleteDocument, bulkDeleteDocuments };
