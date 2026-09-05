import mongoose from 'mongoose';

const newsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: '',
    },
    rawText: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      required: true,
    },
    sourceType: {
      type: String,
      default: 'Unknown',
    },
    author: {
      type: String,
      default: 'Unknown',
    },
    url: {
      type: String,
      default: '',
    },
    publicationDate: {
      type: Date,
      default: null,
    },
    collectedDate: {
      type: Date,
      default: Date.now,
    },
    originalLanguage: {
      type: String,
      default: 'en',
    },
    translatedText: {
      type: String,
      default: '',
    },
    topics: {
      type: [String],
      default: [],
    },
    entities: {
      type: [mongoose.Schema.Types.Mixed], // store entity objects { text, label }
      default: [],
    },
    processingStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'not_processed'],
      default: 'not_processed',
    },
    processingStartedAt: {
      type: Date,
      default: null,
    },
    processingCompletedAt: {
      type: Date,
      default: null,
    },
    processingError: {
      type: String,
      default: '',
    },
    // Keep old fields for backward compatibility during migration if necessary
    content: {
      type: String,
      default: '',
    },
    sourceUrl: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      default: '',
    },
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Optional middleware to sync old and new fields
newsSchema.pre('save', function (next) {
  if (this.isModified('rawText') && !this.content) {
    this.content = this.rawText;
  }
  if (this.isModified('content') && !this.rawText) {
    this.rawText = this.content;
  }
  if (this.isModified('url') && !this.sourceUrl) {
    this.sourceUrl = this.url;
  }
  if (this.isModified('sourceUrl') && !this.url) {
    this.url = this.sourceUrl;
  }
  if (this.isModified('publicationDate') && !this.publishedAt) {
    this.publishedAt = this.publicationDate;
  }
  if (this.isModified('publishedAt') && !this.publicationDate) {
    this.publicationDate = this.publishedAt;
  }
  next();
});

const News = mongoose.model('News', newsSchema);
export default News;
