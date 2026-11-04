import axios from 'axios';
import FormData from 'form-data';

const getAiServiceUrl = () => {
  let url = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
  // Normalize localhost to 127.0.0.1 to avoid Node 18+ IPv6 (::1) ECONNREFUSED resolution mismatches
  url = url.replace('http://localhost:', 'http://127.0.0.1:').replace('https://localhost:', 'https://127.0.0.1:');
  return url.replace(/\/+$/, '');
};

const aiService = {
  /**
   * Pre-flight health check to verify Python FastAPI service availability.
   */
  checkHealth: async () => {
    const url = getAiServiceUrl();
    try {
      const res = await axios.get(`${url}/health`, { timeout: 3500 });
      return {
        healthy: res.status === 200 && (res.data?.status === 'ok' || res.data?.status === 'healthy'),
        url,
        data: res.data
      };
    } catch (err) {
      return {
        healthy: false,
        url,
        error: err.code || err.message
      };
    }
  },
  /**
   * Send a batch of documents and existing narratives to the AI service for processing.
   */
  processBatch: async (documents, existingNarratives, entityContext, existingTopics, options = {}) => {
    try {
      const axiosConfig = {
        timeout: 300000 // 5 minutes timeout for heavy AI processing
      };
      if (options.signal) {
        axiosConfig.signal = options.signal;
      }

      const response = await axios.post(
        `${getAiServiceUrl()}/process/batch`,
        {
          run_id: options.runId || undefined,
          documents,
          existing_narratives: existingNarratives,
          analysis_context: entityContext,
          existing_topics: existingTopics,
        },
        axiosConfig
      );
      return response.data;
    } catch (error) {
      if (axios.isCancel(error) || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        const cancelErr = new Error('Processing was cancelled by user');
        cancelErr.isCancelled = true;
        throw cancelErr;
      }
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
   * Send a cancellation request to the AI service for a specific run ID.
   */
  cancelBatch: async (runId) => {
    if (!runId) return { status: 'ignored' };
    try {
      const response = await axios.post(
        `${getAiServiceUrl()}/process/cancel`,
        { run_id: runId },
        { timeout: 10000 }
      );
      return response.data;
    } catch (error) {
      console.warn(`[AI Service] Cancel request for run ${runId} failed (AI service may be stopped or restarting):`, error.message);
      return { status: 'failed', error: error.message };
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
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        const connErr = new Error(`AI Service is unreachable at ${getAiServiceUrl()} (${error.code}). Please ensure the Python FastAPI service is running on port 8000.`);
        connErr.code = 'AI_SERVICE_UNAVAILABLE';
        connErr.isConnectionError = true;
        throw connErr;
      }
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
