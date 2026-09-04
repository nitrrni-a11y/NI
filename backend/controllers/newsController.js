import News from '../models/News.js';

// @desc    Get all news items
// @route   GET /api/news
// @access  Private (User/Admin)
const getNews = async (req, res) => {
  try {
    const news = await News.find({}).sort({ publishedAt: -1 });
    res.json(news);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single news item
// @route   GET /api/news/:id
// @access  Private (User/Admin)
const getNewsById = async (req, res) => {
  try {
    const news = await News.findById(req.params.id);

    if (news) {
      res.json(news);
    } else {
      res.status(404).json({ message: 'News item not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Add news item
// @route   POST /api/news
// @access  Private/Admin
const addNews = async (req, res) => {
  const { title, content, source, sourceUrl, author, publishedAt, category } = req.body;

  try {
    const news = new News({
      title,
      content,
      source,
      sourceUrl,
      author: author || 'Unknown',
      publishedAt: publishedAt || Date.now(),
      category,
    });

    const createdNews = await news.save();
    res.status(201).json(createdNews);
  } catch (error) {
    res.status(400).json({ message: 'Invalid data' });
  }
};

export { getNews, getNewsById, addNews };
