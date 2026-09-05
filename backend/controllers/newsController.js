import News from '../models/News.js';

// @desc    Get all news/documents with filtering, search, and pagination
// @route   GET /api/news
// @access  Private (User/Admin)
const getNews = async (req, res) => {
  try {
    const { keyword, source, sourceType, topic, status, pageNumber, limit: reqLimit } = req.query;
    
    // Pagination defaults
    const page = Number(pageNumber) || 1;
    const limit = Number(reqLimit) || 12;
    const skip = limit * (page - 1);
    
    // Build query
    const query = {};
    
    if (keyword) {
      query.$or = [
        { title: { $regex: keyword, $options: 'i' } },
        { rawText: { $regex: keyword, $options: 'i' } },
        { content: { $regex: keyword, $options: 'i' } }
      ];
    }
    
    if (source) query.source = source;
    if (sourceType) query.sourceType = sourceType;
    if (topic) query.topics = topic;
    if (status) query.processingStatus = status;

    const count = await News.countDocuments(query);
    const news = await News.find(query)
      .sort({ collectedDate: -1, publishedAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      documents: news,
      page,
      pages: Math.ceil(count / limit),
      total: count
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching documents' });
  }
};

// @desc    Get single news/document by ID
// @route   GET /api/news/:id
// @access  Private (User/Admin)
const getNewsById = async (req, res) => {
  try {
    const news = await News.findById(req.params.id);

    if (news) {
      res.json(news);
    } else {
      res.status(404).json({ message: 'Document not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching document' });
  }
};

// @desc    Add new document/news
// @route   POST /api/news
// @access  Private/Admin
const addNews = async (req, res) => {
  const { 
    title, rawText, content, source, sourceType, url, sourceUrl, 
    author, publicationDate, publishedAt, collectedDate 
  } = req.body;

  try {
    // Basic validation
    if (!rawText && !content) {
      return res.status(400).json({ message: 'Raw text or content is required' });
    }
    if (!source) {
      return res.status(400).json({ message: 'Source is required' });
    }

    const news = new News({
      title: title || 'Untitled',
      rawText: rawText || content, // use either
      content: content || rawText, // backward compatibility
      source,
      sourceType: sourceType || 'Unknown',
      url: url || sourceUrl || '',
      sourceUrl: sourceUrl || url || '', // backward compatibility
      author: author || 'Unknown',
      publicationDate: publicationDate || publishedAt || null,
      publishedAt: publishedAt || publicationDate || null, // backward comp
      collectedDate: collectedDate || Date.now(),
      processingStatus: 'not_processed'
    });

    const createdNews = await news.save();
    res.status(201).json(createdNews);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Invalid data provided for document creation' });
  }
};

export { getNews, getNewsById, addNews };
