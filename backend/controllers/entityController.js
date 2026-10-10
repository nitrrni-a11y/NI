import Entity from '../models/Entity.js';
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
