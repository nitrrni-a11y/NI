import axios from 'axios';
import FormData from 'form-data';

const getAiServiceUrl = () => {
  const raw = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000').trim();
  try {
    const parsed = new URL(raw);
    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1';
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return raw.replace(/\/+$/, '');
  }
};

const getAiAuthHeaders = () => {
  const token = process.env.AI_SERVICE_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const aiService = {
  /**
   * Pre-flight health check to verify Python FastAPI service availability.
   */
  checkHealth: async () => {
    const url = getAiServiceUrl();
    try {
      const res = await axios.get(`${url}/health`, {
        headers: getAiAuthHeaders(),
        timeout: 3500
      });
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
        headers: getAiAuthHeaders(),
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
        {
          headers: getAiAuthHeaders(),
          timeout: 10000
        }
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
            ...getAiAuthHeaders(),
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
        {
          headers: getAiAuthHeaders(),
          timeout: 90000
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
      throw new Error(errorMsg || 'Failed to extract YouTube data');
    }
  },

  /**
   * Backward-compatible alias for YouTube extraction.
   */
  extractYouTubeTranscript: async function(url, options = {}) {
    return this.extractYouTubeData(url, options);
  },

  /**
   * Classify discovered LinkedIn posts for direct opinions using the Llama-3.1-8B SLM via AI service.
   */
  classifyLinkedInOpinions: async (organisationName, aliases = [], posts = []) => {
    try {
      const response = await axios.post(
        `${getAiServiceUrl()}/classify/linkedin-opinions`,
        {
          organisation_name: organisationName,
          aliases,
          posts: posts.map(p => ({ id: p.id, text: p.rawText || p.text || '' }))
        },
        {
          headers: getAiAuthHeaders(),
          timeout: 240000
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
      throw new Error(`AI Service opinion classification error: ${errorMsg}`);
    }
  },

  /**
   * Detect language and translate non-English text into English on demand via AI service.
   */
  translateText: async (text, sourceLanguage = null) => {
    try {
      const response = await axios.post(
        `${getAiServiceUrl()}/translate/text`,
        {
          text,
          source_language: sourceLanguage || null,
        },
        {
          headers: getAiAuthHeaders(),
          timeout: 120000,
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
      throw new Error(errorMsg || 'Failed to translate text');
    }
  },
};

export default aiService;
