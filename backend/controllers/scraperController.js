import scraperService from '../services/scraperService.js';
import gdeltService from '../services/gdeltService.js';
import linkedinService from '../services/linkedinService.js';
import linkedinDiscoveryService from '../services/linkedinDiscoveryService.js';
import youtubeDiscoveryService from '../services/youtubeDiscoveryService.js';
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

// @desc    Extract LinkedIn post and comments via Apify (preview without saving)
// @route   POST /api/scraper/linkedin/extract
// @access  Private/Admin
export const extractLinkedIn = async (req, res) => {
  try {
    const { url, postUrl, numComments = 100 } = req.body;
    const targetUrl = url || postUrl;

    if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.trim()) {
      return res.status(400).json({ message: 'LinkedIn post URL is required' });
    }

    const data = await linkedinService.scrapeLinkedInPost({
      postUrl: targetUrl.trim(),
      numComments: Number(numComments) || 100
    });

    res.json(data);
  } catch (error) {
    console.error('LinkedIn extraction error:', error);
    res.status(400).json({ message: error.message || 'Failed to extract LinkedIn post data' });
  }
};

// @desc    Ingest cleaned LinkedIn post and comments into Document collection
// @route   POST /api/scraper/linkedin/ingest
// @access  Private/Admin
export const ingestLinkedIn = async (req, res) => {
  try {
    const { entityId, entity_id, post, comments } = req.body;
    const targetEntityId = entityId || entity_id;

    if (!targetEntityId) {
      return res.status(400).json({ message: 'Entity ID is required for ingestion' });
    }

    if (!post || !post.rawText) {
      return res.status(400).json({ message: 'Post content is required for ingestion' });
    }

    const result = await linkedinService.ingestLinkedInData({
      entityId: targetEntityId,
      post,
      comments: Array.isArray(comments) ? comments : []
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('LinkedIn ingestion error:', error);
    res.status(400).json({ message: error.message || 'Failed to ingest LinkedIn data' });
  }
};

// @desc    Discover LinkedIn posts by organisation & aliases and classify opinions using Llama-3.1-8B
// @route   POST /api/scraper/linkedin/discover
// @access  Private/Admin
export const discoverLinkedInOpinions = async (req, res) => {
  try {
    const { organisation, organization, aliases = [], limit = 20, maxResultsPerQuery, entityId, entity_id } = req.body;
    const targetOrg = organisation || organization;

    if (!targetOrg || typeof targetOrg !== 'string' || !targetOrg.trim()) {
      return res.status(400).json({ message: 'Organisation name is required for opinion discovery.' });
    }

    const data = await linkedinDiscoveryService.discoverAndClassifyOpinions({
      organisation: targetOrg.trim(),
      aliases: Array.isArray(aliases) ? aliases : [],
      maxResultsPerQuery: Number(limit || maxResultsPerQuery) || 20,
      entityId: entityId || entity_id || null,
    });

    res.json(data);
  } catch (error) {
    console.error('LinkedIn opinion discovery error:', error);
    res.status(400).json({ message: error.message || 'Failed to discover and classify LinkedIn opinions' });
  }
};

// @desc    Ingest selected discovered LinkedIn opinion posts into Document collection
// @route   POST /api/scraper/linkedin/discover/ingest
// @access  Private/Admin
export const ingestDiscoveredLinkedIn = async (req, res) => {
  try {
    const { entityId, entity_id, posts } = req.body;
    const targetEntityId = entityId || entity_id;

    if (!targetEntityId) {
      return res.status(400).json({ message: 'Entity ID is required for ingestion.' });
    }

    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ message: 'At least one post must be selected for ingestion.' });
    }

    const result = await linkedinDiscoveryService.ingestDiscoveredPosts({
      entityId: targetEntityId,
      posts
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('LinkedIn discovered posts ingestion error:', error);
    res.status(400).json({ message: error.message || 'Failed to ingest discovered LinkedIn posts' });
  }
};

// @desc    Generate review search queries for YouTube based on entity name, domain, and aliases
// @route   POST /api/scraper/youtube/generate-queries
// @access  Private/Admin
export const generateYouTubeQueries = async (req, res) => {
  try {
    const { entityId, entity_id, entityName, domain, entityType, aliases } = req.body;
    let name = entityName;
    let entityDomain = domain;
    let type = entityType;

    const targetEntityId = entityId || entity_id;
    if (targetEntityId && !name) {
      const entity = await Entity.findOne({ entityId: targetEntityId });
      if (entity) {
        name = entity.name;
        entityDomain = entityDomain || entity.domain;
        type = type || entity.entityType;
      }
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Entity name is required to generate search queries.' });
    }

    const queries = youtubeDiscoveryService.generateSearchQueries({
      entityName: name,
      domain: entityDomain,
      entityType: type,
      aliases: Array.isArray(aliases) ? aliases : []
    });

    res.json({
      success: true,
      entityName: name,
      domain: entityDomain,
      queries
    });
  } catch (error) {
    console.error('YouTube query generation error:', error);
    res.status(400).json({ message: error.message || 'Failed to generate YouTube search queries' });
  }
};

// @desc    Discover YouTube reviews using Apify and extract transcripts
// @route   POST /api/scraper/youtube/discover
// @access  Private/Admin
export const discoverYouTubeReviews = async (req, res) => {
  try {
    const {
      queries,
      maxResultsPerQuery,
      limit,
      extractTranscripts = true,
      extractComments = false,
      maxComments = 30,
      entityId,
      entity_id
    } = req.body;

    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({ message: 'At least one search query is required for YouTube discovery.' });
    }

    const data = await youtubeDiscoveryService.discoverYouTubeVideos({
      queries,
      maxResultsPerQuery: Number(limit || maxResultsPerQuery) || 10,
      extractTranscripts: Boolean(extractTranscripts),
      extractComments: Boolean(extractComments),
      maxComments: Math.max(1, Math.min(Number(maxComments) || 30, 500)),
      entityId: entityId || entity_id || null
    });

    res.json(data);
  } catch (error) {
    console.error('YouTube review discovery error:', error);
    res.status(400).json({ message: error.message || 'Failed to discover YouTube reviews' });
  }
};

// @desc    Ingest selected discovered YouTube reviews into Document collection
// @route   POST /api/scraper/youtube/discover/ingest
// @access  Private/Admin
export const ingestDiscoveredYouTube = async (req, res) => {
  try {
    const { entityId, entity_id, videos } = req.body;
    const targetEntityId = entityId || entity_id;

    if (!targetEntityId) {
      return res.status(400).json({ message: 'Entity ID is required for ingestion.' });
    }

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return res.status(400).json({ message: 'At least one video must be selected for ingestion.' });
    }

    const result = await youtubeDiscoveryService.ingestDiscoveredVideos({
      entityId: targetEntityId,
      videos
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('YouTube discovered reviews ingestion error:', error);
    res.status(400).json({ message: error.message || 'Failed to ingest discovered YouTube reviews' });
  }
};

export default {
  scrapeAndIngestNews,
  previewNews,
  extractLinkedIn,
  ingestLinkedIn,
  discoverLinkedInOpinions,
  ingestDiscoveredLinkedIn,
  generateYouTubeQueries,
  discoverYouTubeReviews,
  ingestDiscoveredYouTube
};
