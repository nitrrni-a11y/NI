import mongoose from 'mongoose';

const domainSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

const Domain = mongoose.model('Domain', domainSchema);

export default Domain;
