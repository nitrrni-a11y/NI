import Entity from '../models/Entity.js';
import Document from '../models/Document.js';
import Narrative from '../models/Narrative.js';
import Topic from '../models/Topic.js';
import { v4 as uuidv4 } from 'uuid';

export const getEntities = async (req, res) => {
  try {
    const entities = await Entity.find().sort({ createdAt: -1 });
    res.json(entities);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching entities' });
  }
};

export const getEntityStats = async (req, res) => {
  try {
    const targetEntityId = req.params.id;
    const isAdmin = req.user?.role === 'admin';
    const entity = await Entity.findOne({ entityId: targetEntityId });
    if (!entity) {
      return res.status(404).json({ message: 'Entity not found' });
    }

    const narrativeMatch = {
      entityId: targetEntityId,
      isEligibleForDisplay: { $ne: false },
      ...(isAdmin ? {} : { publicationStatus: { $nin: ['Held', 'Rejected'] } }),
    };

    const [
      totalDocuments,
      processedDocuments,
      distinctSources,
      narratives,
      topicDocsCount,
    ] = await Promise.all([
      Document.countDocuments({ entityId: targetEntityId }),
      Document.countDocuments({ entityId: targetEntityId, processingStatus: 'completed' }),
      Document.distinct('source', { entityId: targetEntityId }),
      Narrative.find(narrativeMatch).select('topic direction priority isSecurityRisk severityLevel'),
      Topic.countDocuments({ entityId: targetEntityId }),
    ]);

    const sentimentBreakdown = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
    const topicSet = new Set();
    let criticalCount = 0;

    narratives.forEach((n) => {
      const dir = n.direction || 'neutral';
      if (sentimentBreakdown[dir] !== undefined) sentimentBreakdown[dir] += 1;
      else sentimentBreakdown.neutral += 1;

      if (
        dir === 'negative' &&
        (n.priority === 'critical' || n.priority === 'high' || n.isSecurityRisk || n.severityLevel === 'critical')
      ) {
        criticalCount += 1;
      }

      if (n.topic && n.topic.trim() && n.topic.trim().toLowerCase() !== 'unknown') {
        topicSet.add(n.topic.trim());
      }
    });

    res.json({
      entityId: targetEntityId,
      totalDocuments,
      processedDocuments,
      activeSources: Array.isArray(distinctSources) ? distinctSources.length : 0,
      totalNarratives: narratives.length,
      topicCount: Math.max(topicDocsCount, topicSet.size),
      criticalCount,
      sentimentBreakdown,
    });
  } catch (error) {
    console.error('Error fetching entity stats:', error);
    res.status(500).json({ message: 'Server error fetching entity stats' });
  }
};

export const getEntityById = async (req, res) => {
  try {
    const entity = await Entity.findOne({ entityId: req.params.id });
    if (entity) {
      res.json(entity);
    } else {
      res.status(404).json({ message: 'Entity not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching entity' });
  }
};

export const createEntity = async (req, res) => {
  try {
    const { name, entityType, domain, description } = req.body;
    
    if (!name || !entityType || !domain) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const entity = new Entity({
      entityId: `ENT_${uuidv4().replace(/-/g, '').substring(0, 8)}`,
      name,
      entityType,
      domain,
      description
    });

    const savedEntity = await entity.save();
    res.status(201).json(savedEntity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error creating entity' });
  }
};

export const updateEntity = async (req, res) => {
  try {
    const { name, entityType, domain, description } = req.body;
    
    const entity = await Entity.findOne({ entityId: req.params.id });
    if (!entity) {
      return res.status(404).json({ message: 'Entity not found' });
    }

    if (name) entity.name = name;
    if (entityType) entity.entityType = entityType;
    if (domain) entity.domain = domain;
    if (description !== undefined) entity.description = description;

    const updatedEntity = await entity.save();
    res.json(updatedEntity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error updating entity' });
  }
};

export const deleteEntity = async (req, res) => {
  try {
    const entity = await Entity.findOne({ entityId: req.params.id });
    if (!entity) {
      return res.status(404).json({ message: 'Entity not found' });
    }
    
    await Entity.deleteOne({ _id: entity._id });
    
    res.json({ message: 'Entity removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error deleting entity' });
  }
};
