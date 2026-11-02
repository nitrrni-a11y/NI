import axios from 'axios';
import FormData from 'form-data';

const getAiServiceUrl = () => {
  return process.env.AI_SERVICE_URL || 'http://localhost:8000';
};

const aiService = {
  /**
   * Send a batch of documents and existing narratives to the AI service for processing.
   */
  processBatch: async (documents, existingNarratives, entityContext, existingTopics) => {
    try {
      const response = await axios.post(
        `${getAiServiceUrl()}/process/batch`,
        {
          documents,
          existing_narratives: existingNarratives,
          analysis_context: entityContext,
          existing_topics: existingTopics,
        },
        { timeout: 300000 } // 5 minutes timeout for heavy AI processing
      );
      return response.data;
    } catch (error) {
      let errorMsg = error.message;
      if (error.response?.data?.detail) {
        errorMsg = typeof error.response.data.detail === 'string' 
          ? error.response.data.detail 
          : JSON.stringify(error.response.data.detail);
      }
      throw new Error(`AI Service connection error: ${errorMsg}. Ensure Python FastAPI is running on port 8000.`);
    }
  },

  /**
   * Send a raw CSV file to the AI service to parse and normalize it into documents.
   */
  parseCSV: async (fileBuffer, originalFilename) => {
    try {
      const form = new FormData();
      form.append('file', fileBuffer, originalFilename);

      const response = await axios.post(
        `${getAiServiceUrl()}/process/csv`,
        form,
        {
          headers: {
            ...form.getHeaders(),
          },
          timeout: 60000,
        }
      );
      return response.data;
    } catch (error) {
      let errorMsg = error.message;
      if (error.response?.data?.detail) {
        errorMsg = typeof error.response.data.detail === 'string' 
          ? error.response.data.detail 
          : JSON.stringify(error.response.data.detail);
      }
      throw new Error(`AI Service CSV parse error: ${errorMsg}`);
    }
  },

  /**
   * Request YouTube data (transcript, comments, or both) and metadata extraction from Python AI service.
   */
  extractYouTubeData: async (url, options = {}) => {
    try {
      const response = await axios.post(
        `${getAiServiceUrl()}/extract/youtube`,
        { 
          url,
          extract_transcript: options.extractTranscript ?? true,
          extract_comments: options.extractComments ?? false,
          max_comments: options.maxComments ?? 50
        },
        { timeout: 90000 }
      );
      return response.data;
    } catch (error) {
      let errorMsg = error.message;
      if (error.response?.data?.detail) {
        errorMsg = typeof error.response.data.detail === 'string'
          ? error.response.data.detail
          : JSON.stringify(error.response.data.detail);
      }
      throw new Error(errorMsg || 'Failed to extract YouTube data');
    }
  },

  /**
   * Backward-compatible alias for YouTube extraction.
   */
  extractYouTubeTranscript: async function(url, options = {}) {
    return this.extractYouTubeData(url, options);
  },
};

export default aiService;
