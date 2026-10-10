import mongoose from 'mongoose';

const entitySchema = new mongoose.Schema({
  entityId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  entityType: {
    type: String,
    required: true
  },
  domain: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

const Entity = mongoose.model('Entity', entitySchema);
export default Entity;
