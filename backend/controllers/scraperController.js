import scraperService from '../services/scraperService.js';
import gdeltService from '../services/gdeltService.js';
import Entity from '../models/Entity.js';

// @desc    Scrape news articles from web (Google News RSS or GDELT) and ingest into Document collection
// @route   POST /api/scraper/scrape
// @access  Private/Admin
export const scrapeAndIngestNews = async (req, res) => {
  try {
    const { 
      entityId, 
      entity_id, 
      query: inputQuery, 
      timeframe = '30d', 
      customStartDate, 
      customEndDate, 
      limit = 25,
      source = 'rss'
    } = req.body;

    const targetEntityId = entityId || entity_id;

    if (!targetEntityId) {
      return res.status(400).json({ message: 'Entity ID is required' });
    }

    let searchQuery = inputQuery ? inputQuery.trim() : '';

    // If query not specified, look up entity name
    if (!searchQuery) {
      const entity = await Entity.findOne({ entityId: targetEntityId });
      if (entity && entity.name) {
        searchQuery = entity.name;
      } else {
        return res.status(400).json({ message: 'Search query is required' });
      }
    }

    let result;
    if (source === 'gdelt') {
      result = await gdeltService.scrapeAndIngestGdelt({
        entityId: targetEntityId,
        query: searchQuery,
        timeframe,
        customStartDate,
        customEndDate,
        limit: Math.min(Number(limit) || 25, 100)
      });
    } else {
      result = await scraperService.scrapeAndIngest({
        entityId: targetEntityId,
        query: searchQuery,
        timeframe,
        customStartDate,
        customEndDate,
        limit: Math.min(Number(limit) || 25, 100)
      });
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({ message: error.message || 'Server error while scraping web articles' });
  }
};

// @desc    Preview news articles without saving
// @route   POST /api/scraper/preview
// @access  Private/Admin
export const previewNews = async (req, res) => {
  try {
    const { 
      entityId, 
      entity_id, 
      query: inputQuery, 
      timeframe = '30d', 
      customStartDate, 
      customEndDate, 
      limit = 10,
      source = 'rss'
    } = req.body;

    let searchQuery = inputQuery ? inputQuery.trim() : '';

    if (!searchQuery) {
      const targetEntityId = entityId || entity_id;
      if (targetEntityId) {
        const entity = await Entity.findOne({ entityId: targetEntityId });
        if (entity && entity.name) searchQuery = entity.name;
      }
    }

    if (!searchQuery) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    let articles;
    if (source === 'gdelt') {
      articles = await gdeltService.previewGdeltArticles({
        query: searchQuery,
        timeframe,
        customStartDate,
        customEndDate,
        limit: Math.min(Number(limit) || 10, 50),
        entityId: entityId || entity_id
      });
    } else {
      articles = await scraperService.fetchGoogleNewsArticles({
        query: searchQuery,
        timeframe,
        customStartDate,
        customEndDate,
        limit: Math.min(Number(limit) || 10, 50)
      });
    }

    res.json({
      success: true,
      source: source === 'gdelt' ? 'gdelt' : 'rss',
      count: articles.length,
      articles
    });
  } catch (error) {
    console.error('Scraper preview error:', error);
    res.status(500).json({ message: error.message || 'Server error while previewing news articles' });
  }
};

export default {
  scrapeAndIngestNews,
  previewNews
};
