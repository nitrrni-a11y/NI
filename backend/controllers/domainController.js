import Domain from '../models/Domain.js';

// @desc    Get all domains
// @route   GET /api/domains
// @access  Private
const getDomains = async (req, res) => {
  try {
    const domains = await Domain.find({}).sort({ name: 1 });
    res.json(domains);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching domains' });
  }
};

// @desc    Add a domain
// @route   POST /api/domains
// @access  Private
const addDomain = async (req, res) => {
  const { name, description } = req.body;
  try {
    const domainExists = await Domain.findOne({ name });
    if (domainExists) {
      return res.status(400).json({ message: 'Domain already exists' });
    }
    const domain = await Domain.create({ name, description });
    res.status(201).json(domain);
  } catch (error) {
    res.status(500).json({ message: 'Server error adding domain' });
  }
};

// @desc    Update a domain
// @route   PUT /api/domains/:id
// @access  Private
const updateDomain = async (req, res) => {
  const { name, description } = req.body;
  try {
    const domain = await Domain.findById(req.params.id);
    if (!domain) {
      return res.status(404).json({ message: 'Domain not found' });
    }
    
    if (name && name !== domain.name) {
      const nameExists = await Domain.findOne({ name });
      if (nameExists) {
        return res.status(400).json({ message: 'Domain name already exists' });
      }
      
      const oldName = domain.name;
      domain.name = name;
      
      // Update all entities associated with this domain
      const Entity = (await import('../models/Entity.js')).default;
      await Entity.updateMany({ domain: oldName }, { domain: name });
    }
    
    if (description !== undefined) {
      domain.description = description;
    }
    
    const updatedDomain = await domain.save();
    res.json(updatedDomain);
  } catch (error) {
    console.error('Update domain error:', error);
    res.status(500).json({ message: 'Server error updating domain' });
  }
};

// @desc    Delete a domain
// @route   DELETE /api/domains/:id
// @access  Private
const deleteDomain = async (req, res) => {
  try {
    const domain = await Domain.findById(req.params.id);
    if (!domain) {
      return res.status(404).json({ message: 'Domain not found' });
    }

    const Entity = (await import('../models/Entity.js')).default;
    const hasEntities = await Entity.exists({ domain: domain.name });
    if (hasEntities) {
      return res.status(400).json({ message: 'Cannot delete domain because it contains entities. Please delete all entities within this domain first.' });
    }

    await Domain.deleteOne({ _id: domain._id });
    res.json({ message: 'Domain removed successfully' });
  } catch (error) {
    console.error('Delete domain error:', error);
    res.status(500).json({ message: 'Server error deleting domain' });
  }
};

export { getDomains, addDomain, updateDomain, deleteDomain };
