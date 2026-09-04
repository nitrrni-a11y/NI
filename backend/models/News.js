import mongoose from 'mongoose';

const newsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      required: true,
    },
    sourceUrl: {
      type: String,
      required: true,
    },
    author: {
      type: String,
      default: 'Unknown',
    },
    publishedAt: {
      type: Date,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const News = mongoose.model('News', newsSchema);
export default News;
