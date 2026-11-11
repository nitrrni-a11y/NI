import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { 
  Search, PlusCircle, Database, Trash2, Upload, FileText, 
  ChevronLeft, ChevronRight, Globe, Calendar, Clock, Cpu, 
  CheckCircle2, AlertCircle, X, ExternalLink, Loader2, ArrowRight, Rss, Copy, Check,
  Download, Info, FileSpreadsheet, Compass
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useEntity } from '../context/EntityContext';

const LinkedinIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const YouTubeIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill={color} />
  </svg>
);

const DataManagement = () => {
  const { selectedEntity } = useEntity();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [csvFile, setCsvFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [csvError, setCsvError] = useState(null);
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [detectedColumns, setDetectedColumns] = useState([]);

  const [selectedDocs, setSelectedDocs] = useState(new Set());
  const [viewDoc, setViewDoc] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleCopyUrl = async (url) => {
    if (!url) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error('Clipboard API not available');
      }
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      el.setAttribute('readonly', '');
      el.style.position = 'absolute';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);

  // Web Scraper states
  const [showScraperModal, setShowScraperModal] = useState(false);
  const [scraperSource, setScraperSource] = useState('rss');
  const [scraperQuery, setScraperQuery] = useState('');
  const [timeframe, setTimeframe] = useState('30d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [scrapeLimit, setScrapeLimit] = useState(25);
  const [isScraping, setIsScraping] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewArticles, setPreviewArticles] = useState(null);
  const [scraperResult, setScraperResult] = useState(null);
  const [scraperError, setScraperError] = useState(null);

  // LinkedIn Scraper states
  const [showLinkedInModal, setShowLinkedInModal] = useState(false);
  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [linkedInNumComments, setLinkedInNumComments] = useState(100);
  const [isExtractingLinkedIn, setIsExtractingLinkedIn] = useState(false);
  const [linkedInExtractedData, setLinkedInExtractedData] = useState(null);
  const [linkedInExtractError, setLinkedInExtractError] = useState(null);
  const [isIngestingLinkedIn, setIsIngestingLinkedIn] = useState(false);
  const [linkedInIngestResult, setLinkedInIngestResult] = useState(null);
  const [linkedInIngestError, setLinkedInIngestError] = useState(null);
  const [commentsPage, setCommentsPage] = useState(1);
  const commentsPerPage = 6;

  const modalBodyRef = useRef(null);
  const scraperProgressRef = useRef(null);
  const scraperResultRef = useRef(null);
  const scraperErrorRef = useRef(null);
  const userScrolledUpRef = useRef(false);

  const handleModalBodyScroll = () => {
    const container = modalBodyRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    if (!isNearBottom && isScraping) {
      userScrolledUpRef.current = true;
    }
  };

  // Auto-scroll modal container to loading/progress indicator when scraping starts
  useEffect(() => {
    if (isScraping && modalBodyRef.current) {
      userScrolledUpRef.current = false;
      const timer = setTimeout(() => {
        const container = modalBodyRef.current;
        const progressEl = scraperProgressRef.current;
        if (container) {
          if (progressEl) {
            const containerRect = container.getBoundingClientRect();
            const progressRect = progressEl.getBoundingClientRect();
            const targetScrollTop = container.scrollTop + (progressRect.top - containerRect.top) - 20;
            container.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: 'smooth'
            });
          } else {
            container.scrollTo({
              top: container.scrollHeight,
              behavior: 'smooth'
            });
          }
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isScraping]);

  useEffect(() => {
    if (scraperResult && scraperResultRef.current && modalBodyRef.current) {
      const timer = setTimeout(() => {
        const containerEl = modalBodyRef.current;
        const resultEl = scraperResultRef.current;
        if (containerEl && resultEl) {
          const containerRect = containerEl.getBoundingClientRect();
          const resultRect = resultEl.getBoundingClientRect();
          const targetScrollTop = containerEl.scrollTop + (resultRect.top - containerRect.top) - 16;
          containerEl.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
          });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [scraperResult]);

  useEffect(() => {
    if (scraperError && scraperErrorRef.current && modalBodyRef.current) {
      const timer = setTimeout(() => {
        const containerEl = modalBodyRef.current;
        const errorEl = scraperErrorRef.current;
        if (containerEl && errorEl) {
          const containerRect = containerEl.getBoundingClientRect();
          const errorRect = errorEl.getBoundingClientRect();
          const targetScrollTop = containerEl.scrollTop + (errorRect.top - containerRect.top) - 16;
          containerEl.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
          });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [scraperError]);
  
  const fileInputRef = React.useRef(null);

  // Handle Escape key and body scroll lock for modals in DataManagement
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showFormatModal) {
          setShowFormatModal(false);
        } else if (deleteConfirmation) {
          setDeleteConfirmation(null);
        } else if (viewDoc) {
          setViewDoc(null);
        } else if (showScraperModal) {
          setShowScraperModal(false);
        } else if (showLinkedInModal && !isExtractingLinkedIn && !isIngestingLinkedIn) {
          setShowLinkedInModal(false);
        }
      }
    };

    const isAnyModalOpen = Boolean(viewDoc || showScraperModal || deleteConfirmation || showFormatModal || showLinkedInModal);
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewDoc, showScraperModal, deleteConfirmation, showFormatModal]);

  const handleDownloadCsvTemplate = () => {
    const csvContent = 
      "timestamp,raw_text,source,author,published_date\n" +
      "2025-01-15T10:30:00Z,\"Campus placements for CSE have seen significant improvement this year, with multiple tier-1 tech companies visiting.\",\"Google Reviews\",\"Student_A102\",\"2025-01-14\"\n" +
      "2025-01-20T14:15:00Z,\"Hostel Wi-Fi and mess food quality require urgent attention from administration.\",\"Shiksha\",\"Anonymous\",\"2025-01-19\"\n" +
      "2025-01-22T09:00:00Z,\"New lab equipment has been installed in the robotics research facility.\",\"LinkedIn\",\"Faculty_DrR\",\"2025-01-21\"\n";

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'ni_student_reviews_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCsvChange = (e) => {
    const file = e.target.files?.[0];
    setCsvError(null);
    setUploadResult(null);
    setDetectedColumns([]);

    if (!file) {
      setCsvFile(null);
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvError('Invalid file type. Please upload a file with a .csv extension.');
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size === 0) {
      setCsvError('The selected CSV file is empty (0 bytes).');
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) {
          setCsvError('CSV file must contain a header row and at least one data row.');
          setCsvFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        // Parse header row
        const headerLine = lines[0].replace(/^\ufeff/, ''); // remove UTF-8 BOM if present
        const headers = headerLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
        setDetectedColumns(headers);

        const textAliases = ['raw_text', 'text', 'review', 'content'];
        const foundTextCol = headers.find(h => textAliases.includes(h));

        if (!foundTextCol) {
          setCsvError(`Missing required review text column. CSV must contain "raw_text" (or aliases: ${textAliases.join(', ')}). Found columns: [${headers.join(', ')}]`);
          setCsvFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        setCsvFile(file);
      } catch (err) {
        setCsvError('Failed to read CSV file: ' + err.message);
        setCsvFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      setCsvError('Error reading CSV file from disk.');
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file.slice(0, 8192));
  };

  const handleCsvUpload = async () => {
    if (!csvFile) return;
    if (!selectedEntity?.entityId) {
      setUploadResult({
        success: false,
        message: 'Please select an entity before uploading CSV data.'
      });
      return;
    }
    setUploading(true);
    setUploadResult(null);
    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('entity_id', selectedEntity.entityId);

    try {
      const res = await axios.post('/api/documents/upload', formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setUploadResult({ 
        success: true, 
        message: res.data.message || 'Successfully uploaded and parsed documents from CSV!', 
        savedCount: res.data.savedCount, 
        totalRows: res.data.totalRows 
      });
      fetchData(query, 1);
      setCsvFile(null);
      setDetectedColumns([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      const respData = err.response?.data;
      setUploadResult({
        success: false,
        code: respData?.code,
        message: respData?.message || err.message,
        suggestion: respData?.suggestion
      });
    } finally {
      setUploading(false);
    }
  };

  const fetchData = async (searchQuery = '', page = 1) => {
    setLoading(true);
    try {
      let endpoint = `/api/documents?pageNumber=${page}&entity_id=${selectedEntity?.entityId || ''}`;
      if (searchQuery) {
        endpoint += `&keyword=${encodeURIComponent(searchQuery)}`;
      }
      
      const response = await axios.get(endpoint, { withCredentials: true });
      
      if (response.data && response.data.documents) {
        setData(response.data.documents);
        setCurrentPage(response.data.page);
        setTotalPages(response.data.pages);
        setTotalCount(response.data.total);
      } else {
        const resData = response.data || [];
        setData(Array.isArray(resData) ? resData : []);
        setTotalCount(Array.isArray(resData) ? resData.length : 0);
      }
      
      setSelectedDocs(new Set());
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedEntity) {
      fetchData('', currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, selectedEntity]);

  const handleSearch = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchData(query, 1);
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = data.map(doc => doc._id);
      setSelectedDocs(new Set(allIds));
    } else {
      setSelectedDocs(new Set());
    }
  };

  const handleSelectDoc = (id, checked) => {
    const newSelected = new Set(selectedDocs);
    if (checked) newSelected.add(id);
    else newSelected.delete(id);
    setSelectedDocs(newSelected);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (deleteConfirmation.type === 'bulk') {
        const ids = Array.from(selectedDocs);
        await axios.post('/api/documents/bulk-delete', { documentIds: ids }, { withCredentials: true });
        setSelectedDocs(new Set());
      } else if (deleteConfirmation.type === 'single') {
        await axios.delete(`/api/documents/${deleteConfirmation.doc}`, { withCredentials: true });
        setSelectedDocs(prev => {
          const newSet = new Set(prev);
          newSet.delete(deleteConfirmation.doc);
          return newSet;
        });
      }
      setDeleteConfirmation(null);
      fetchData(query, currentPage);
    } catch (err) {
      console.error(err);
      alert('Failed to delete document(s)');
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenScraperModal = () => {
    setScraperQuery(selectedEntity?.name || '');
    setScraperError(null);
    setScraperResult(null);
    setPreviewArticles(null);

    setShowScraperModal(true);
  };

  const handlePreviewScraper = async () => {
    if (!scraperQuery.trim()) {
      setScraperError('Please enter a search topic or keyword.');
      return;
    }
    if (timeframe === 'custom' && !customStartDate) {
      setScraperError('Please choose at least a start date for the custom range.');
      return;
    }
    setIsPreviewing(true);
    setScraperError(null);
    setScraperResult(null);

    try {
      const res = await axios.post('/api/scraper/preview', {
        entityId: selectedEntity?.entityId,
        query: scraperQuery.trim(),
        timeframe,
        source: scraperSource,

        customStartDate: timeframe === 'custom' ? customStartDate : undefined,
        customEndDate: timeframe === 'custom' ? customEndDate : undefined,
        limit: Math.min(Number(scrapeLimit) || 10, 25)
      }, { withCredentials: true });

      if (res.data && res.data.articles) {
        setPreviewArticles(res.data.articles);
        if (res.data.articles.length === 0) {
          setScraperError('No articles found matching your query and timeframe.');
        }
      }
    } catch (err) {
      console.error(err);
      setScraperError(err.response?.data?.message || err.message || 'Failed to preview news articles');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleRunScraper = async () => {
    if (!scraperQuery.trim()) {
      setScraperError('Please enter a search topic or keyword.');
      return;
    }
    if (timeframe === 'custom' && !customStartDate) {
      setScraperError('Please choose at least a start date for the custom range.');
      return;
    }
    setIsScraping(true);
    userScrolledUpRef.current = false;
    setScraperError(null);
    setScraperResult(null);

    try {
      const res = await axios.post('/api/scraper/scrape', {
        entityId: selectedEntity?.entityId,
        query: scraperQuery.trim(),
        timeframe,
        source: scraperSource,

        customStartDate: timeframe === 'custom' ? customStartDate : undefined,
        customEndDate: timeframe === 'custom' ? customEndDate : undefined,
        limit: Number(scrapeLimit) || 25
      }, { withCredentials: true });

      setScraperResult(res.data);
      // Refresh documents table automatically
      fetchData(query, 1);
    } catch (err) {
      console.error(err);
      setScraperError(err.response?.data?.message || err.message || 'Failed to scrape and ingest articles');
    } finally {
      setIsScraping(false);
    }
  };

  const handleOpenLinkedInModal = () => {
    setShowLinkedInModal(true);
    setLinkedInExtractError(null);
    setLinkedInIngestError(null);
  };

  const handleExtractLinkedIn = async (e) => {
    if (e) e.preventDefault();
    const trimmedUrl = linkedInUrl.trim();
    if (!trimmedUrl) {
      setLinkedInExtractError('Please enter a valid LinkedIn post URL.');
      return;
    }

    setIsExtractingLinkedIn(true);
    setLinkedInExtractError(null);
    setLinkedInIngestResult(null);
    setLinkedInIngestError(null);
    setCommentsPage(1);

    try {
      const res = await axios.post('/api/scraper/linkedin/extract', {
        url: trimmedUrl,
        numComments: linkedInNumComments
      }, { withCredentials: true });

      setLinkedInExtractedData(res.data);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to extract LinkedIn post data.';
      setLinkedInExtractError(msg);
    } finally {
      setIsExtractingLinkedIn(false);
    }
  };

  const handleIngestLinkedIn = async () => {
    if (!linkedInExtractedData || !linkedInExtractedData.post) return;
    if (!selectedEntity?.entityId) {
      setLinkedInIngestError('Please select an entity before ingesting documents.');
      return;
    }

    setIsIngestingLinkedIn(true);
    setLinkedInIngestError(null);

    try {
      const res = await axios.post('/api/scraper/linkedin/ingest', {
        entityId: selectedEntity.entityId,
        post: linkedInExtractedData.post,
        comments: linkedInExtractedData.comments || []
      }, { withCredentials: true });

      setLinkedInIngestResult(res.data);
      fetchData(query, 1);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to ingest LinkedIn documents.';
      setLinkedInIngestError(msg);
    } finally {
      setIsIngestingLinkedIn(false);
    }
  };

  const handleResetLinkedIn = () => {
    setLinkedInUrl('');
    setLinkedInExtractedData(null);
    setLinkedInExtractError(null);
    setLinkedInIngestResult(null);
    setLinkedInIngestError(null);
    setCommentsPage(1);
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="flex flex-col mb-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Data Management</h1>
            <p className="text-secondary" style={{ fontSize: '1.05rem' }}>
              Manage, scrape, and ingest intelligence documents for <span className="font-semibold text-primary">{selectedEntity?.name || 'Selected Entity'}</span>.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              type="button"
              onClick={handleOpenScraperModal}
              className="btn shadow-sm flex items-center gap-2"
              style={{ 
                padding: '0.75rem 1.4rem', 
                fontWeight: 600, 
                backgroundColor: '#2563eb', 
                color: '#ffffff',
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)',
                cursor: 'pointer'
              }}
            >
              <Globe size={18} />
              <span>Live Web Scraper</span>
            </button>
            <button 
              type="button"
              onClick={handleOpenLinkedInModal}
              className="btn shadow-sm flex items-center gap-2"
              style={{ 
                padding: '0.75rem 1.4rem', 
                fontWeight: 600, 
                backgroundColor: '#0a66c2', 
                color: '#ffffff',
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 2px 4px rgba(10, 102, 194, 0.25)',
                cursor: 'pointer'
              }}
            >
              <LinkedinIcon size={18} color="#ffffff" />
              <span>LinkedIn Post Scraper</span>
            </button>
            <Link 
              to={`/entity/${selectedEntity.entityId}/discovery/youtube`} 
              className="btn shadow-sm flex items-center gap-2"
              style={{ 
                padding: '0.75rem 1.4rem', 
                fontWeight: 600, 
                backgroundColor: '#dc2626', 
                color: '#ffffff',
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 2px 4px rgba(220, 38, 38, 0.25)',
                textDecoration: 'none'
              }}
            >
              <YouTubeIcon size={18} color="#ffffff" />
              <span>YouTube Discovery</span>
            </Link>
            <Link 
              to={`/entity/${selectedEntity.entityId}/discovery/linkedin`}
              className="btn shadow-sm flex items-center gap-2"
              style={{ 
                padding: '0.75rem 1.4rem', 
                fontWeight: 600, 
                backgroundColor: '#0284c7', 
                color: '#ffffff',
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)',
                textDecoration: 'none'
              }}
            >
              <Compass size={18} />
              <span>LinkedIn Discovery</span>
            </Link>
            <Link to={`/entity/${selectedEntity.entityId}/data/add`} className="btn btn-secondary shadow-sm flex items-center gap-2" style={{ padding: '0.75rem 1.4rem', fontWeight: 500, width: 'fit-content' }}>
              <PlusCircle size={18} />
              <span>Add Document</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
        {/* Scraper Quick Card */}
        <div 
          className="card shadow-sm flex flex-col justify-between"
          style={{
            borderColor: 'var(--border-color)',
            background: 'var(--surface-color)'
          }}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 
                className="text-lg font-semibold flex items-center gap-2"
                style={{ color: 'var(--text-primary)', margin: 0 }}
              >
                <div 
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-blue)'
                  }}
                >
                  <Globe size={18} />
                </div>
                <span>Live Web Scraper</span>
              </h3>

            </div>
            <p 
              className="text-sm leading-relaxed"
              style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}
            >
              Automated web scraping of real-time and historical news articles with exact publisher sources.
            </p>
          </div>
          <div>
            <button 
              type="button" 
              onClick={handleOpenScraperModal}
              className="btn w-full flex items-center justify-center gap-2 font-semibold shadow-sm"
              style={{
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              <Globe size={16} />
              <span>Scrape Web Data</span>
            </button>
          </div>
        </div>

        {/* LinkedIn Post Scraper Quick Card */}
        <div 
          className="card shadow-sm flex flex-col justify-between"
          style={{
            borderColor: 'var(--border-color)',
            background: 'var(--surface-color)'
          }}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 
                className="text-lg font-semibold flex items-center gap-2"
                style={{ color: 'var(--text-primary)', margin: 0 }}
              >
                <div 
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(10, 102, 194, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0a66c2'
                  }}
                >
                  <LinkedinIcon size={18} color="#0a66c2" />
                </div>
                <span>LinkedIn Post Scraper</span>
              </h3>
            </div>
            <p 
              className="text-sm leading-relaxed"
              style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}
            >
              Extract a single post URL and all its comments with noise filtering into individual documents.
            </p>
          </div>
          <div>
            <button 
              type="button" 
              onClick={handleOpenLinkedInModal}
              className="btn w-full flex items-center justify-center gap-2 font-semibold shadow-sm"
              style={{
                background: 'linear-gradient(135deg, #0a66c2 0%, #004182 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              <LinkedinIcon size={16} color="#ffffff" />
              <span>Scrape Post URL</span>
            </button>
          </div>
        </div>

        {/* LinkedIn Opinion Discovery Card */}
        <div 
          className="card shadow-sm flex flex-col justify-between"
          style={{
            borderColor: 'var(--border-color)',
            background: 'var(--surface-color)'
          }}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 
                className="text-lg font-semibold flex items-center gap-2"
                style={{ color: 'var(--text-primary)', margin: 0 }}
              >
                <div 
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(2, 132, 199, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0284c7'
                  }}
                >
                  <Compass size={18} color="#0284c7" />
                </div>
                <span>LinkedIn Discovery</span>
              </h3>
            </div>
            <p 
              className="text-sm leading-relaxed"
              style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}
            >
              Discover LinkedIn posts by organisation name and filter direct opinions using Llama-3.1-8B.
            </p>
          </div>
          <div>
            <Link 
              to={`/entity/${selectedEntity.entityId}/linkedin-discovery`}
              className="btn w-full flex items-center justify-center gap-2 font-semibold shadow-sm"
              style={{
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                cursor: 'pointer',
                textDecoration: 'none'
              }}
            >
              <Compass size={16} />
              <span>Discover Opinions</span>
            </Link>
          </div>
        </div>

        {/* YouTube Review Discovery Card */}
        <div 
          className="card shadow-sm flex flex-col justify-between"
          style={{
            borderColor: 'var(--border-color)',
            background: 'var(--surface-color)'
          }}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 
                className="text-lg font-semibold flex items-center gap-2"
                style={{ color: 'var(--text-primary)', margin: 0 }}
              >
                <div 
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ef4444'
                  }}
                >
                  <YouTubeIcon size={18} color="#ef4444" />
                </div>
                <span>YouTube Discovery</span>
              </h3>
            </div>
            <p 
              className="text-sm leading-relaxed"
              style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}
            >
              Discover video reviews, student experiences, and feedback with transcript extraction.
            </p>
          </div>
          <div>
            <Link 
              to={`/entity/${selectedEntity.entityId}/discovery/youtube`}
              className="btn w-full flex items-center justify-center gap-2 font-semibold shadow-sm"
              style={{
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                cursor: 'pointer',
                textDecoration: 'none'
              }}
            >
              <YouTubeIcon size={16} color="#ffffff" />
              <span>Discover Reviews</span>
            </Link>
          </div>
        </div>

        {/* Bulk Upload CSV Card */}
        <div 
          className="card shadow-sm flex flex-col justify-between md:col-span-2 lg:col-span-2" 
          style={{ 
            borderColor: 'var(--border-color)', 
            background: 'var(--surface-color)', 
            minHeight: '260px' 
          }}
        >
          <div>
            <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)', margin: 0 }}>
                  <div 
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(37, 99, 235, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent-blue)'
                    }}
                  >
                    <Upload size={18} />
                  </div>
                  <span>Bulk Upload CSV</span>
                </h3>
                <p className="text-secondary text-xs mt-1">Manual offline dataset ingestion for Narrative Intelligence processing.</p>
              </div>
              <button
                type="button"
                onClick={handleDownloadCsvTemplate}
                className="btn btn-secondary shadow-sm text-xs flex items-center gap-1.5 py-1 px-3 shrink-0"
                title="Download standard student reviews CSV template"
                style={{ fontSize: '0.78rem', height: '32px', whiteSpace: 'nowrap' }}
              >
                <Download size={14} />
                <span>Download Template</span>
              </button>
            </div>

            {/* Expected CSV Format Section */}
            <div 
              className="rounded-lg p-3 mb-3.5" 
              style={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)' }}
            >
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <span className="font-semibold text-xs flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                  <FileSpreadsheet size={15} className="text-blue-500 shrink-0" />
                  <span>Expected CSV Format</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowFormatModal(true)}
                  className="btn btn-secondary shadow-sm text-xs flex items-center gap-1.5 shrink-0"
                  style={{ height: '26px', padding: '0 0.65rem', fontSize: '0.75rem' }}
                  title="View column specifications, accepted aliases, and sample row"
                >
                  <Info size={13} className="text-blue-500" />
                  <span>Format Details</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <span 
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-xs font-semibold shadow-xs" 
                  style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent-blue, #2563eb)', border: '1px solid rgba(59, 130, 246, 0.25)' }}
                  title="Mandatory review text column (aliases: text, review, content)"
                >
                  raw_text
                  <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-0.2 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#dc2626' }}>
                    Required
                  </span>
                </span>
                <span 
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-mono text-xs shadow-xs" 
                  style={{ backgroundColor: 'var(--surface-color)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                  title="Optional platform/publisher name"
                >
                  source
                  <span className="text-[10px] text-muted font-sans">opt</span>
                </span>
                <span 
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-mono text-xs shadow-xs" 
                  style={{ backgroundColor: 'var(--surface-color)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                  title="Optional author/student identifier"
                >
                  author
                  <span className="text-[10px] text-muted font-sans">opt</span>
                </span>
                <span 
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-mono text-xs shadow-xs" 
                  style={{ backgroundColor: 'var(--surface-color)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                  title="Optional publication date (YYYY-MM-DD)"
                >
                  published_date
                  <span className="text-[10px] text-muted font-sans">opt</span>
                </span>
                <span 
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-mono text-xs shadow-xs" 
                  style={{ backgroundColor: 'var(--surface-color)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                  title="Optional collection/ingestion timestamp"
                >
                  timestamp
                  <span className="text-[10px] text-muted font-sans">opt</span>
                </span>
              </div>
            </div>

            {csvError && (
              <div className="mb-3 p-2.5 rounded-lg text-xs font-medium border border-red-300 bg-red-50 text-red-700 flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-600" />
                <span>{csvError}</span>
              </div>
            )}
          </div>

          <div>
            <div className="w-full min-w-0 flex items-center gap-2">
              <div 
                className="flex-1 min-w-0 flex items-center justify-between gap-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors" 
                style={{ 
                  height: '42px',
                  padding: '0 0.75rem', 
                  borderColor: csvFile ? 'var(--accent-blue, #3b82f6)' : 'var(--border-color)', 
                  backgroundColor: 'var(--bg-color)' 
                }}
                onClick={() => fileInputRef.current?.click()}
                title={csvFile ? csvFile.name : 'Click to select a CSV file'}
              >
                <input 
                  type="file" 
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleCsvChange}
                  style={{ display: 'none' }}
                />
                <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                  <FileText size={15} className={csvFile ? 'text-blue-500 shrink-0' : 'text-muted shrink-0'} />
                  <span 
                    className="truncate font-medium text-xs block text-left" 
                    style={{ color: csvFile ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    title={csvFile ? csvFile.name : 'Choose CSV file...'}
                  >
                    {csvFile ? csvFile.name : 'Choose CSV file...'}
                  </span>
                </div>
                <button 
                  type="button" 
                  className="btn btn-secondary shadow-sm text-xs shrink-0"
                  style={{ height: '30px', padding: '0 0.65rem' }}
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  Browse
                </button>
              </div>
              <button 
                className="btn btn-primary shadow-sm flex items-center justify-center gap-1.5 shrink-0" 
                onClick={handleCsvUpload} 
                disabled={!csvFile || uploading || !!csvError}
                style={{ 
                  height: '42px',
                  padding: '0 1.1rem', 
                  fontSize: '0.875rem', 
                  opacity: (!csvFile || uploading || !!csvError) ? 0.6 : 1,
                  whiteSpace: 'nowrap'
                }}
              >
                {uploading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload size={15} />
                    <span>Upload</span>
                  </>
                )}
              </button>
            </div>

            {uploadResult && (
              <div className="mt-3 p-3 rounded-lg border font-medium text-xs" style={{ 
                backgroundColor: uploadResult.success ? '#dcfce7' : '#fee2e2', 
                borderColor: uploadResult.success ? '#22c55e' : '#ef4444', 
                color: uploadResult.success ? '#15803d' : '#b91c1c' 
              }}>
                <div className="flex items-start gap-2">
                  {uploadResult.success ? (
                    <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle size={16} className="text-rose-600 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold">{uploadResult.message}</p>
                    {uploadResult.success && uploadResult.savedCount !== undefined && (
                      <p className="mt-0.5 font-normal opacity-90">
                        Saved {uploadResult.savedCount} documents (Total rows in CSV: {uploadResult.totalRows}).
                      </p>
                    )}
                    {uploadResult.code === 'AI_SERVICE_UNAVAILABLE' && (
                      <div className="mt-2 p-2 bg-white rounded border border-rose-200 text-gray-800">
                        <p className="font-semibold text-xs text-rose-900 mb-1">To start the Python AI Service:</p>
                        <div className="bg-gray-900 text-green-400 p-2 rounded font-mono text-[11px] select-all">
                          cd ai ; python -m uvicorn app.main:app --port 8000
                        </div>
                      </div>
                    )}
                    {uploadResult.suggestion && uploadResult.code !== 'AI_SERVICE_UNAVAILABLE' && (
                      <p className="mt-1 font-normal opacity-90 text-[11px]">{uploadResult.suggestion}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search Documents Bar */}
      <div className="card shadow-sm mb-6 p-4 border" style={{ borderColor: 'var(--border-color)', background: 'var(--surface-color)' }}>
        <form onSubmit={handleSearch} className="flex items-center gap-3">
          <div className="form-control flex items-center gap-2" style={{ flex: 1, padding: '0.65rem 1rem' }}>
            <Search size={18} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search documents by raw text, title, author, or source..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'inherit', outline: 'none', width: '100%' }} 
            />
          </div>
          <button type="submit" className="btn btn-secondary shadow-sm font-medium" style={{ height: '42px', padding: '0 1.5rem' }}>
            Search
          </button>
          {query && (
            <button 
              type="button" 
              onClick={() => { setQuery(''); fetchData('', 1); }}
              className="btn btn-ghost text-xs"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {loading ? (
        <div className="p-8 text-center text-secondary card shadow-sm">Loading database records...</div>
      ) : data.length === 0 ? (
        <div className="empty-state card shadow-sm py-12">
          <Database size={48} className="text-muted mb-4" />
          <h3 className="text-lg font-semibold text-primary">No documents available.</h3>
          <p className="text-secondary mt-2">Upload a CSV file or manually add documents to get started.</p>
        </div>
      ) : (
        <div className="card shadow-sm p-0 overflow-hidden">
          <div className="flex justify-between items-center p-4 border-b bg-surface-light" style={{ borderColor: 'var(--border-color)' }}>
            <div>
              {selectedDocs.size > 0 ? (
                <div className="flex items-center gap-4 bg-blue-50 px-3 py-2 rounded-md border border-blue-200">
                  <span className="text-sm font-semibold text-blue-800">{selectedDocs.size} documents selected</span>
                  <button 
                    className="btn btn-sm" 
                    onClick={() => setDeleteConfirmation({ type: 'bulk' })}
                    style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
                  >
                    Delete Selected
                  </button>
                </div>
              ) : (
                <span className="text-sm font-medium text-secondary">
                  Showing {data.length} of {totalCount} documents
                </span>
              )}
            </div>
            
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button 
                  className="pagination-arrow" 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  aria-label="Previous page"
                  title="Previous page"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-sm text-secondary px-2">Page {currentPage} of {totalPages}</span>
                <button 
                  className="pagination-arrow" 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  aria-label="Next page"
                  title="Next page"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
          
          <div style={{ width: '100%', overflowX: 'hidden' }}>
            <table className="data-table" style={{ width: '100%', tableLayout: 'fixed' }}>
              <thead>
                <tr className="bg-surface">
                  <th style={{ width: '48px', textAlign: 'center', padding: '1rem 0.5rem' }}>
                    <input 
                      type="checkbox" 
                      checked={data.length > 0 && selectedDocs.size === data.length}
                      ref={input => {
                        if (input) {
                          input.indeterminate = selectedDocs.size > 0 && selectedDocs.size < data.length;
                        }
                      }}
                      onChange={handleSelectAll}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </th>
                  <th style={{ width: 'auto', padding: '1rem 1.25rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Title / Preview</th>
                  <th style={{ width: '15%', padding: '1rem 1.25rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Source</th>
                  <th style={{ width: '12%', padding: '1rem 1.25rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Date</th>
                  <th style={{ width: '15%', padding: '1rem 1.25rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Processing</th>
                  <th style={{ width: '80px', padding: '1rem 1.25rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((doc) => (
                  <tr key={doc._id} style={{ cursor: 'pointer' }} className="hover:bg-gray-50 transition-colors" onClick={() => setViewDoc(doc)}>
                    <td style={{ textAlign: 'center', padding: '1rem 0.5rem' }} onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={selectedDocs.has(doc._id)}
                        onChange={(e) => handleSelectDoc(doc._id, e.target.checked)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </td>
                    <td style={{ padding: '1rem 1.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={doc.rawText}>
                      <span className="font-semibold text-primary">
                        {doc.title && doc.title !== 'Untitled' && doc.title !== 'Uploaded Document' ? doc.title : doc.rawText}
                      </span>
                    </td>
                    <td style={{ padding: '1rem 1.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span className="font-medium">{doc.source && doc.source !== 'Unknown' ? doc.source : 'Unknown'}</span>
                    </td>
                    <td style={{ padding: '1rem 1.25rem', whiteSpace: 'nowrap' }} className="text-secondary text-sm">
                      {doc.publicationDate 
                        ? new Date(doc.publicationDate).toLocaleDateString() 
                        : new Date(doc.collectedDate).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '1rem 1.25rem' }}>
                      {doc.processingStatus === 'not_processed' ? (
                        <span className="badge badge-warning">UNPROCESSED</span>
                      ) : (
                        <span className="badge badge-info uppercase">{doc.processingStatus}</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <button 
                        className="btn btn-ghost text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                        style={{ padding: '0.4rem', borderRadius: '4px' }}
                        onClick={() => setDeleteConfirmation({ type: 'single', doc: doc._id })}
                        title="Delete document"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Bottom Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center p-4 border-t bg-surface-light" style={{ borderColor: 'var(--border-color)' }}>
              <div className="text-sm text-secondary">
                Showing {data.length} of {totalCount} documents
              </div>
              <div className="flex items-center gap-2">
                <button 
                  className="btn btn-secondary btn-sm shadow-sm" 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                >
                  Previous
                </button>
                <div className="flex gap-1 mx-2">
                  {[...Array(Math.min(5, totalPages)).keys()].map(i => {
                    // Simple pagination display logic around current page
                    let pageNum = currentPage;
                    if (currentPage <= 3) pageNum = i + 1;
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = currentPage - 2 + i;
                    
                    if (pageNum > 0 && pageNum <= totalPages) {
                      return (
                        <button 
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-8 h-8 flex items-center justify-center rounded text-sm ${currentPage === pageNum ? 'bg-primary text-white font-bold shadow-sm' : 'hover:bg-gray-200 text-secondary'}`}
                        >
                          {pageNum}
                        </button>
                      );
                    }
                    return null;
                  })}
                </div>
                <button 
                  className="btn btn-secondary btn-sm shadow-sm" 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* View Document Modal */}
      {viewDoc && (
        <div 
          onClick={() => setViewDoc(null)}
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            backgroundColor: 'rgba(15, 23, 42, 0.75)', 
            backdropFilter: 'blur(4px)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 9999, 
            padding: '1.5rem' 
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              backgroundColor: 'var(--surface-color-strong, #ffffff)', 
              borderRadius: '12px', 
              border: '1px solid var(--border-color)', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', 
              width: '100%', 
              maxWidth: '820px', 
              maxHeight: '90vh', 
              display: 'flex', 
              flexDirection: 'column', 
              overflow: 'hidden' 
            }}
          >
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-color)' }}>
              <div className="flex items-center gap-2.5">
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)' }}>
                  <FileText size={18} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>Document Details</h2>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Metadata and extracted full body text</p>
                </div>
              </div>
              <button 
                onClick={() => setViewDoc(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem' }}
                title="Close"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Scrollable Content */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, backgroundColor: 'var(--surface-color-strong, #ffffff)' }}>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>Source</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{viewDoc.source || 'Not available'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>Author</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{viewDoc.author || 'Not available'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>Published Date</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {viewDoc.publicationDate ? new Date(viewDoc.publicationDate).toLocaleDateString() : 'Not available'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>Collected Timestamp</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {viewDoc.collectedDate ? new Date(viewDoc.collectedDate).toLocaleString() : 'Not available'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>Processing Status</div>
                  <div>
                    {viewDoc.processingStatus === 'not_processed' ? (
                      <span className="badge badge-warning">UNPROCESSED</span>
                    ) : (
                      <span className="badge badge-info uppercase">{viewDoc.processingStatus}</span>
                    )}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>Document ID</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{viewDoc._id}</div>
                </div>

                {/* Source Article URL Actions */}
                {viewDoc.url && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>
                      Source Article URL
                    </div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <a 
                        href={viewDoc.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="btn btn-sm flex items-center gap-1.5 font-medium shadow-sm"
                        style={{
                          backgroundColor: 'var(--accent-blue)',
                          color: '#ffffff',
                          padding: '0.45rem 0.95rem',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          fontSize: '0.8125rem',
                          display: 'inline-flex'
                        }}
                      >
                        <ExternalLink size={14} />
                        <span>Open Link</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => handleCopyUrl(viewDoc.url)}
                        className="btn btn-sm flex items-center gap-1.5 font-medium transition-all"
                        style={{
                          backgroundColor: copiedUrl ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-color)',
                          borderColor: copiedUrl ? 'var(--status-success)' : 'var(--border-color)',
                          color: copiedUrl ? 'var(--status-success)' : 'var(--text-primary)',
                          border: '1px solid',
                          padding: '0.45rem 0.95rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.8125rem'
                        }}
                        title="Copy article URL to clipboard"
                      >
                        {copiedUrl ? (
                          <>
                            <Check size={14} className="text-emerald-500" />
                            <span style={{ fontWeight: 600 }}>Link Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={14} />
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.75rem' }}>Full Content</div>
                <div style={{ padding: '1.25rem', borderRadius: '8px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', whiteSpace: 'pre-wrap', color: 'var(--text-primary)', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                  {viewDoc.rawText}
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary text-sm" onClick={() => setViewDoc(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1.5rem' }}>
          <div style={{ backgroundColor: 'var(--surface-color-strong, #ffffff)', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#fef2f2', margin: '0 auto 1rem auto' }}>
                <Trash2 style={{ width: '28px', height: '28px', color: '#ef4444' }} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', marginTop: 0 }}>
                {deleteConfirmation.type === 'bulk' ? `Delete ${selectedDocs.size} documents?` : 'Delete document?'}
              </h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, padding: '0 1rem' }}>
                These documents will be permanently removed from the system. This action cannot be undone.
              </p>
            </div>
            
            <div style={{ backgroundColor: 'var(--bg-color)', padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setDeleteConfirmation(null)} 
                disabled={deleting}
              >
                Cancel
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleDelete} 
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : (deleteConfirmation.type === 'bulk' ? `Delete ${selectedDocs.size} Documents` : 'Delete Document')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Web Scraper Modal */}
      {showScraperModal && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            backgroundColor: 'rgba(15, 23, 42, 0.7)', 
            backdropFilter: 'blur(4px)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 9999, 
            padding: '1.5rem' 
          }}
          onClick={() => { if (!isScraping && !isPreviewing) setShowScraperModal(false); }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              backgroundColor: 'var(--surface-color-strong, #111827)', 
              borderRadius: '16px', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', 
              width: '100%', 
              maxWidth: '820px', 
              maxHeight: '90vh', 
              display: 'flex', 
              flexDirection: 'column', 
              overflow: 'hidden',
              border: '1px solid var(--border-color)'
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-color)' }}>
              <div className="flex items-center gap-3">
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                  <Globe size={22} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>Live Web Scraper & Intelligence Ingestion</h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Fetch real news articles via Google News RSS or GDELT Global Knowledge Graph with full-text article extraction.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowScraperModal(false)}
                disabled={isScraping || isPreviewing}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem' }}
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div ref={modalBodyRef} onScroll={handleModalBodyScroll} style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Target Entity Indicator */}
              <div className="flex items-center justify-between p-3 rounded-lg text-sm" style={{ backgroundColor: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.25)", color: "var(--text-primary)" }}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold" style={{ color: "var(--accent-blue)" }}>Target Entity:</span>
                  <span>{selectedEntity?.name || 'Unknown'}</span>
                </div>
                <span className="text-xs font-mono px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: "rgba(59, 130, 246, 0.2)", color: "var(--accent-blue)" }}>
                  {selectedEntity?.entityId}
                </span>
              </div>

              {/* Data Scraping Source Selector */}
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
                  Select Intelligence Source
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setScraperSource('rss');
                      setPreviewArticles(null);
                      setScraperResult(null);
                      setScraperError(null);
                    }}
                    className="p-3 rounded-xl border text-left transition-all flex items-start gap-3"
                    style={{
                      backgroundColor: scraperSource === 'rss' ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-color)',
                      borderColor: scraperSource === 'rss' ? 'var(--accent-blue)' : 'var(--border-color)',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      backgroundColor: scraperSource === 'rss' ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.05)',
                      color: scraperSource === 'rss' ? '#ffffff' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Rss size={18} />
                    </div>
                    <div>
                      <div className="text-sm font-bold" style={{ color: scraperSource === 'rss' ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                        Google News RSS
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Indexed publisher feeds & Google decoder
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setScraperSource('gdelt');
                      setPreviewArticles(null);
                      setScraperResult(null);
                      setScraperError(null);
                    }}
                    className="p-3 rounded-xl border text-left transition-all flex items-start gap-3"
                    style={{
                      backgroundColor: scraperSource === 'gdelt' ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-color)',
                      borderColor: scraperSource === 'gdelt' ? 'var(--accent-blue)' : 'var(--border-color)',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      backgroundColor: scraperSource === 'gdelt' ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.05)',
                      color: scraperSource === 'gdelt' ? '#ffffff' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Globe size={18} />
                    </div>
                    <div>
                      <div className="text-sm font-bold" style={{ color: scraperSource === 'gdelt' ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                        GDELT Project
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Global DOC 2.0 API & full article extraction
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Search Keywords */}
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
                  Search Query / Topic Keywords
                </label>
                <input 
                  type="text"
                  value={scraperQuery}
                  onChange={(e) => setScraperQuery(e.target.value)}
                  placeholder="e.g. Salman Khan, Tata Motors, Bollywood, Electric Vehicles..."
                  className="w-full p-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: '#cbd5e1', backgroundColor: 'var(--surface-color-strong, #111827)', color: 'var(--text-primary)' }}
                />
                <span className="text-xs mt-1 block" style={{ color: "var(--text-muted)" }}>
                  {scraperSource === 'gdelt' ? 'Keywords queried against GDELT Global Knowledge Graph DOC API with deep article extraction.' : 'Keywords used to query Google News RSS feeds and online publications.'}
                </span>
              </div>

              {/* Historical Timeframe Selector */}
              <div>
                <label className="block text-sm font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                  <Calendar size={15} style={{ color: "var(--accent-blue)" }} /> Historical Timeframe
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[
                    { id: '24h', label: 'Past 24h' },
                    { id: '7d', label: 'Past 7d' },
                    { id: '30d', label: 'Past 30d' },
                    { id: '1y', label: 'Past 1 Year' },
                    { id: 'all', label: 'All History' },
                    { id: 'custom', label: 'Custom Range' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTimeframe(item.id)}
                      className="py-2 px-3 text-xs font-semibold rounded-lg border transition-all text-center"
                      style={{
                        backgroundColor: timeframe === item.id ? 'var(--accent-blue)' : 'var(--bg-color)',
                        color: timeframe === item.id ? '#ffffff' : 'var(--text-secondary)',
                        borderColor: timeframe === item.id ? 'var(--accent-blue)' : 'var(--border-color)',
                        cursor: 'pointer'
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Custom Date Inputs if custom is chosen */}
                {timeframe === 'custom' && (
                  <div className="mt-3 p-3 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ backgroundColor: "var(--bg-color)", border: "1px solid var(--border-color)" }}>
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                        Start Date (After)
                      </label>
                      <input 
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="w-full p-2 text-xs border rounded"
                        style={{ borderColor: "var(--border-color)", backgroundColor: "var(--surface-color-strong)", color: "var(--text-primary)" }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                        End Date (Before)
                      </label>
                      <input 
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="w-full p-2 text-xs border rounded"
                        style={{ borderColor: "var(--border-color)", backgroundColor: "var(--surface-color-strong)", color: "var(--text-primary)" }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Limit Selector */}
              <div>
                <label className="block text-sm font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                  <Clock size={15} style={{ color: "var(--accent-blue)" }} /> Max Articles Limit
                </label>
                <div className="flex gap-2">
                  {[10, 25, 50, 100].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setScrapeLimit(num)}
                      className="py-1.5 px-4 text-xs font-semibold rounded-md border"
                      style={{
                        backgroundColor: scrapeLimit === num ? 'var(--accent-blue)' : 'var(--bg-color)',
                        color: scrapeLimit === num ? '#ffffff' : 'var(--text-secondary)',
                        borderColor: scrapeLimit === num ? 'var(--accent-blue)' : 'var(--border-color)',
                        cursor: 'pointer'
                      }}
                    >
                      {num} articles
                    </button>
                  ))}
                </div>
              </div>

              {/* Error Message */}
              {scraperError && (
                <div ref={scraperErrorRef} className="p-3 rounded-lg border text-sm flex items-start gap-2" style={{ backgroundColor: "rgba(239, 68, 68, 0.12)", borderColor: "rgba(239, 68, 68, 0.3)", color: "#f87171" }}>
                  <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                  <span>{scraperError}</span>
                </div>
              )}

              
              {/* Progress Feedback Banner when scraping */}
              {isScraping && (
                <div 
                  ref={scraperProgressRef}
                  className="p-4 rounded-xl border flex items-center gap-3.5" 
                  style={{ 
                    backgroundColor: "rgba(59, 130, 246, 0.08)", 
                    borderColor: "rgba(59, 130, 246, 0.25)", 
                    color: "var(--text-primary)" 
                  }}
                >
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-blue)',
                    flexShrink: 0
                  }}>
                    <Loader2 size={20} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--accent-blue)" }}>
                      <span>{scraperSource === 'gdelt' ? 'Scraping GDELT Global Intelligence...' : 'Fetching Google News RSS Feeds...'}</span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {`Searching and extracting new unique articles through multiple pages until target of ${scrapeLimit} new documents is reached. Please wait...`}
                    </div>
                  </div>
                </div>
              )}

              {/* Scraper Result Notification */}
              {scraperResult && (
                <div ref={scraperResultRef} className="p-4 rounded-xl border flex flex-col gap-3" style={{ backgroundColor: "rgba(5, 150, 105, 0.1)", borderColor: "rgba(5, 150, 105, 0.3)", color: "var(--text-primary)" }}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={20} className={scraperResult.targetReached !== false ? "text-emerald-500 shrink-0" : "text-amber-500 shrink-0"} />
                      <span className="font-bold text-base">{scraperResult.message}</span>
                    </div>
                    {scraperResult.targetRequested && (
                      <span 
                        className="px-2.5 py-1 rounded-full text-xs font-bold"
                        style={{
                          backgroundColor: scraperResult.targetReached ? "rgba(5, 150, 105, 0.2)" : "rgba(245, 158, 11, 0.2)",
                          color: scraperResult.targetReached ? "var(--accent-green)" : "#f59e0b",
                          border: `1px solid ${scraperResult.targetReached ? "rgba(5, 150, 105, 0.4)" : "rgba(245, 158, 11, 0.4)"}`
                        }}
                      >
                        {scraperResult.targetReached 
                          ? `Target Reached (${scraperResult.savedCount}/${scraperResult.targetRequested})` 
                          : (scraperResult.savedCount > 0 
                            ? `Partial: ${scraperResult.savedCount} of ${scraperResult.targetRequested} Available` 
                            : `0 of ${scraperResult.targetRequested} Available`)}
                      </span>
                    )}
                  </div>
                  {scraperResult.extractedCount !== undefined ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg text-center" style={{ backgroundColor: "var(--bg-color)", border: "1px solid var(--border-color)" }}>
                      <div>
                        <div className="text-[11px] uppercase font-semibold" style={{ color: "var(--text-muted)" }}>Discovered</div>
                        <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{scraperResult.totalFound}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase font-semibold" style={{ color: "var(--accent-blue)" }}>Extracted</div>
                        <div className="text-lg font-bold" style={{ color: "var(--accent-blue)" }}>{scraperResult.extractedCount}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase font-semibold" style={{ color: "var(--accent-green)" }}>New Saved</div>
                        <div className="text-lg font-bold" style={{ color: "var(--accent-green)" }}>{scraperResult.savedCount}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase font-semibold" style={{ color: "var(--text-muted)" }}>Duplicates</div>
                        <div className="text-lg font-bold" style={{ color: "var(--text-secondary)" }}>{scraperResult.skippedDuplicates}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase font-semibold" style={{ color: "var(--text-muted)" }}>Irrelevant</div>
                        <div className="text-lg font-bold" style={{ color: "var(--text-secondary)" }}>{scraperResult.irrelevantSkipped || 0}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase font-semibold" style={{ color: "#f87171" }}>Failed</div>
                        <div className="text-lg font-bold" style={{ color: "#f87171" }}>{scraperResult.extractionFailures || 0}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 p-3 rounded-lg text-center" style={{ backgroundColor: "var(--bg-color)", border: "1px solid var(--border-color)" }}>
                      <div>
                        <div className="text-xs uppercase font-semibold" style={{ color: "var(--text-muted)" }}>Total Found</div>
                        <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{scraperResult.totalFound}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase font-semibold" style={{ color: "var(--accent-green)" }}>New Saved</div>
                        <div className="text-lg font-bold" style={{ color: "var(--accent-green)" }}>{scraperResult.savedCount}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase font-semibold" style={{ color: "var(--text-muted)" }}>Duplicates Skipped</div>
                        <div className="text-lg font-bold" style={{ color: "var(--text-secondary)" }}>{scraperResult.skippedDuplicates}</div>
                      </div>
                    </div>
                  )}
                  {scraperResult.batchId && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        Batch ID: <code style={{ backgroundColor: "var(--bg-color)", padding: "0.15rem 0.4rem", borderRadius: "4px", border: "1px solid var(--border-color)" }}>{scraperResult.batchId}</code>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowScraperModal(false);
                          navigate(`/entity/${selectedEntity.entityId}/processing`);
                        }}
                        className="btn btn-sm flex items-center gap-1.5 font-semibold"
                        style={{ backgroundColor: '#059669', color: '#ffffff', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px' }}
                      >
                        <Cpu size={14} />
                        <span>Open AI Processing Pipeline</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Preview Articles List */}
              {previewArticles && !scraperResult && (
                <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--border-color)" }}>
                  <div className="p-2.5 text-xs font-semibold flex justify-between items-center" style={{ backgroundColor: "var(--bg-color)", borderBottom: "1px solid var(--border-color)", color: "var(--text-primary)" }}>
                    <span>Found {previewArticles.length} Articles (Preview Only - Not Yet Saved)</span>
                    <button
                      type="button"
                      onClick={handleRunScraper}
                      disabled={isScraping}
                      className="btn btn-sm btn-primary flex items-center gap-1 text-xs py-1 px-3"
                    >
                      <Database size={13} />
                      <span>Ingest All to DB</span>
                    </button>
                  </div>
                  <div style={{ maxHeight: "220px", overflowY: "auto", backgroundColor: "var(--surface-color-strong)" }}>
                    {previewArticles.map((art, idx) => (
                      <div key={idx} className="p-2.5 text-xs flex flex-col gap-1 border-b" style={{ borderColor: "var(--border-color)" }}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>{art.title}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded whitespace-nowrap font-medium" style={{ backgroundColor: "var(--bg-color)", color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}>
                            {art.source}
                          </span>
                        </div>
                        <div className="flex items-center justify-between" style={{ color: "var(--text-muted)" }}>
                          <span>
                            {art.publicationDate ? new Date(art.publicationDate).toLocaleDateString() : 'Date unavailable'}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: art.hasFullText ? "rgba(16, 185, 129, 0.15)" : "rgba(234, 179, 8, 0.15)", color: art.hasFullText ? "var(--status-success, #10b981)" : "var(--status-warning, #eab308)" }}>
                              {art.hasFullText ? `${art.rawText?.length || 0} chars (Full Text)` : 'Snippet Only'}
                          </span>
                          {art.url && (
                            <a href={art.url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1" style={{ color: "var(--accent-blue)" }}>
                              View link <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button 
                type="button"
                className="btn btn-secondary text-sm" 
                onClick={() => setShowScraperModal(false)}
                disabled={isScraping}
              >
                Close
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePreviewScraper}
                  disabled={isScraping || isPreviewing}
                  className="btn btn-secondary text-sm flex items-center gap-2"
                  style={{ cursor: 'pointer' }}
                >
                  {isPreviewing ? <Loader2 size={16} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} /> : <Search size={16} />}
                  <span>{isPreviewing ? 'Finding Feeds...' : 'Preview Articles'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleRunScraper}
                  disabled={isScraping || isPreviewing}
                  className="btn text-sm flex items-center gap-2 font-semibold shadow-sm"
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.6rem 1.25rem',
                    borderRadius: '6px',
                    cursor: (isScraping || isPreviewing) ? 'not-allowed' : 'pointer', opacity: (isScraping || isPreviewing) ? 0.75 : 1, transition: 'all 0.2s ease'
                  }}
                >
                  {isScraping ? <Loader2 size={16} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} /> : <Globe size={16} />}
                  <span>{isScraping ? 'Scraping & Saving...' : `Scrape & Ingest (${scraperSource === 'gdelt' ? 'GDELT' : 'RSS'})`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expected CSV Format Details Modal */}
      {showFormatModal && (
        <div 
          onClick={() => setShowFormatModal(false)}
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            backgroundColor: 'rgba(15, 23, 42, 0.75)', 
            backdropFilter: 'blur(4px)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 9999, 
            padding: '1.25rem' 
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              backgroundColor: 'var(--surface-color-strong, #ffffff)', 
              borderRadius: '12px', 
              border: '1px solid var(--border-color)', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', 
              width: '100%', 
              maxWidth: '740px', 
              maxHeight: '90vh', 
              display: 'flex', 
              flexDirection: 'column', 
              overflow: 'hidden' 
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-color)' }}>
              <div className="flex items-center gap-3">
                <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue, #2563eb)' }}>
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>Expected CSV Format</h2>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Specifications for bulk document ingestion into the AI pipeline</p>
                </div>
              </div>
              <button 
                onClick={() => setShowFormatModal(false)}
                className="btn btn-ghost p-1.5 rounded-lg text-secondary hover:text-primary transition-colors"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                title="Close (Esc)"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* File Specs Banner */}
              <div 
                className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl border text-xs"
                style={{ backgroundColor: 'var(--surface-color-soft)', borderColor: 'var(--border-color)' }}
              >
                <div>
                  <span className="text-secondary font-medium block mb-0.5">File Extension</span>
                  <span className="font-semibold text-primary font-mono bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900 inline-block">.csv</span>
                </div>
                <div>
                  <span className="text-secondary font-medium block mb-0.5">Encoding</span>
                  <span className="font-semibold text-primary">UTF-8 <span className="text-secondary text-[11px] font-normal">(BOM supported)</span></span>
                </div>
                <div>
                  <span className="text-secondary font-medium block mb-0.5">Delimiter & Rules</span>
                  <span className="font-semibold text-primary">Comma (,) <span className="text-secondary text-[11px] font-normal">RFC 4180 quotes</span></span>
                </div>
              </div>

              {/* Column Schema Table */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-secondary mb-2">Column Specifications</h4>
                <div className="border rounded-xl overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
                  <table className="w-full text-xs text-left" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
                        <th className="py-2.5 px-3.5 font-semibold text-secondary">Column Name</th>
                        <th className="py-2.5 px-3.5 font-semibold text-secondary">Requirement</th>
                        <th className="py-2.5 px-3.5 font-semibold text-secondary">Description & Accepted Aliases</th>
                      </tr>
                    </thead>
                    <tbody style={{ divideY: '1px solid var(--border-color)' }}>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(59, 130, 246, 0.03)' }}>
                        <td className="py-2.5 px-3.5 font-mono font-bold text-blue-600 dark:text-blue-400">raw_text</td>
                        <td className="py-2.5 px-3.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                            Required
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-secondary leading-relaxed">
                          Primary review, feedback, or statement text analyzed by Narrative Intelligence.
                          <div className="mt-1 font-mono text-[11px] text-muted">Aliases accepted: <code>text</code>, <code>review</code>, <code>content</code></div>
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td className="py-2.5 px-3.5 font-mono font-medium text-primary">source</td>
                        <td className="py-2.5 px-3.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase text-muted bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                            Optional
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-secondary leading-relaxed">
                          Origin platform or publisher (e.g., <em>Google Reviews, Shiksha, Reddit, Campus Forum</em>). Defaults to <code>Unknown</code> if omitted.
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td className="py-2.5 px-3.5 font-mono font-medium text-primary">author</td>
                        <td className="py-2.5 px-3.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase text-muted bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                            Optional
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-secondary leading-relaxed">
                          Reviewer username, student ID, or identifier (e.g. <code>Student_A102</code>). Defaults to <code>Unknown</code> if omitted.
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td className="py-2.5 px-3.5 font-mono font-medium text-primary">published_date</td>
                        <td className="py-2.5 px-3.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase text-muted bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                            Optional
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-secondary leading-relaxed">
                          Date review or statement was originally published (<code>YYYY-MM-DD</code> or ISO 8601).
                          <div className="mt-1 font-mono text-[11px] text-muted">Alias accepted: <code>published_at</code></div>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3.5 font-mono font-medium text-primary">timestamp</td>
                        <td className="py-2.5 px-3.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase text-muted bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                            Optional
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-secondary leading-relaxed">
                          Timestamp when the record was collected or ingested (e.g. <code>2025-01-15T10:30:00Z</code>).
                          <div className="mt-1 font-mono text-[11px] text-muted">Alias accepted: <code>collected_at</code></div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Example CSV Data Preview */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-secondary m-0">Example CSV Row Preview</h4>
                  <span className="text-[11px] text-muted font-mono">ni_dataset_short_student_reviews.csv</span>
                </div>
                <div 
                  className="p-3 rounded-xl font-mono text-xs overflow-x-auto border leading-relaxed" 
                  style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <div className="text-secondary opacity-70 border-b pb-1.5 mb-1.5" style={{ borderColor: 'var(--border-color)' }}>
                    timestamp,raw_text,source,author,published_date
                  </div>
                  <div className="text-primary whitespace-pre">
                    2025-01-15T10:30:00Z,"Campus placements for CSE have seen significant improvement this year, with multiple tier-1 tech companies visiting.","Google Reviews","Student_A102","2025-01-14"
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-color)' }}>
              <button
                type="button"
                onClick={handleDownloadCsvTemplate}
                className="btn btn-secondary shadow-sm text-xs flex items-center gap-2"
                style={{ height: '36px', padding: '0 1rem' }}
              >
                <Download size={14} />
                <span>Download Sample Template</span>
              </button>
              <button 
                type="button"
                onClick={() => setShowFormatModal(false)}
                className="btn btn-primary shadow-sm text-xs"
                style={{ height: '36px', padding: '0 1.25rem' }}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LinkedIn Scraper Modal */}
      {showLinkedInModal && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            backgroundColor: 'rgba(15, 23, 42, 0.75)', 
            backdropFilter: 'blur(6px)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 9999, 
            padding: '1.5rem' 
          }}
          onClick={() => { if (!isExtractingLinkedIn && !isIngestingLinkedIn) setShowLinkedInModal(false); }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              backgroundColor: 'var(--surface-color-strong, #111827)', 
              borderRadius: '16px', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.55)', 
              width: '100%', 
              maxWidth: '880px', 
              maxHeight: '90vh', 
              display: 'flex', 
              flexDirection: 'column', 
              overflow: 'hidden',
              border: '1px solid var(--border-color)'
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-color)' }}>
              <div className="flex items-center gap-3">
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: 'rgba(10, 102, 194, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a66c2' }}>
                  <LinkedinIcon size={24} color="#0a66c2" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>LinkedIn Post & Comments Intelligence Scraper</h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Extract post content and audience discussions via Apify for deep narrative extraction.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { if (!isExtractingLinkedIn && !isIngestingLinkedIn) setShowLinkedInModal(false); }}
                disabled={isExtractingLinkedIn || isIngestingLinkedIn}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem' }}
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div 
              style={{ 
                padding: '1.5rem', 
                overflowY: 'auto', 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '1.25rem' 
              }}
            >
              {/* Form Input Section */}
              <form onSubmit={handleExtractLinkedIn} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    LinkedIn Post URL *
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="url" 
                      placeholder="https://www.linkedin.com/posts/... or https://www.linkedin.com/feed/update/urn:li:activity:..."
                      value={linkedInUrl}
                      onChange={(e) => setLinkedInUrl(e.target.value)}
                      disabled={isExtractingLinkedIn || isIngestingLinkedIn}
                      className="form-control"
                      style={{ flex: 1, fontSize: '0.875rem' }}
                      required
                    />
                  </div>
                  <p className="text-xs text-muted mt-1.5">
                    Supports LinkedIn posts, activity updates, and pulse articles. Tracking parameters are automatically stripped.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 p-3 rounded-xl border" style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)' }}>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-secondary">
                      Max Comments to Fetch
                    </label>
                    <span className="text-xs text-muted">
                      Requests maximum practical comments (up to 100). Logged-out scrapers may receive fewer comments.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      min="10"
                      max="100"
                      step="10"
                      value={linkedInNumComments}
                      onChange={(e) => setLinkedInNumComments(Math.min(100, Math.max(10, Number(e.target.value) || 100)))}
                      disabled={isExtractingLinkedIn || isIngestingLinkedIn}
                      className="form-control"
                      style={{ width: '80px', textAlign: 'center', fontWeight: 600 }}
                    />
                    <span className="text-xs text-muted">comments</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-muted">
                    {linkedInExtractedData ? (
                      <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                        <CheckCircle2 size={14} /> Extraction completed. Inspect preview below.
                      </span>
                    ) : (
                      <span>Data is previewed and cleaned before adding to documents.</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {linkedInExtractedData && (
                      <button
                        type="button"
                        onClick={handleResetLinkedIn}
                        disabled={isExtractingLinkedIn || isIngestingLinkedIn}
                        className="btn btn-secondary text-xs"
                      >
                        Reset / New URL
                      </button>
                    )}
                    <button 
                      type="submit" 
                      disabled={isExtractingLinkedIn || isIngestingLinkedIn || !linkedInUrl.trim()}
                      className="btn font-semibold flex items-center gap-2 shadow-sm"
                      style={{
                        background: 'linear-gradient(135deg, #0a66c2 0%, #004182 100%)',
                        color: '#ffffff',
                        border: 'none',
                        padding: '0.65rem 1.4rem',
                        borderRadius: '8px',
                        cursor: isExtractingLinkedIn ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isExtractingLinkedIn ? (
                        <>
                          <Loader2 size={16} className="spin" />
                          <span>Extracting from LinkedIn...</span>
                        </>
                      ) : (
                        <>
                          <LinkedinIcon size={16} color="#ffffff" />
                          <span>Extract Post & Comments</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>

              {/* Extraction Error Alert */}
              {linkedInExtractError && (
                <div 
                  className="p-4 rounded-xl border flex flex-col gap-2"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)', color: 'var(--text-primary)' }}
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                    <div className="text-sm font-medium">
                      {linkedInExtractError}
                    </div>
                  </div>
                  {linkedInExtractError.toLowerCase().includes('apify_api_token') && (
                    <div className="text-xs text-secondary pl-7">
                      <strong>Setup Hint:</strong> Get your API token from your <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Apify Console</a>, then add <code>APIFY_API_TOKEN=your_token_here</code> to <code>backend/.env</code> and restart your backend.
                    </div>
                  )}
                </div>
              )}

              {/* Extracted Data Preview Container */}
              {linkedInExtractedData && (
                <div className="flex flex-col gap-5 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
                  
                  {/* POST PREVIEW CARD */}
                  <div 
                    className="rounded-xl p-4 border"
                    style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)' }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span 
                          className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider"
                          style={{ backgroundColor: 'rgba(10, 102, 194, 0.15)', color: '#0a66c2' }}
                        >
                          LinkedIn Post
                        </span>
                        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                          {linkedInExtractedData.post.author}
                        </span>
                        {linkedInExtractedData.post.authorHeadline && (
                          <span className="text-xs text-muted truncate max-w-xs" title={linkedInExtractedData.post.authorHeadline}>
                            • {linkedInExtractedData.post.authorHeadline}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted">
                        {linkedInExtractedData.post.publicationDate && (
                          <span>{new Date(linkedInExtractedData.post.publicationDate).toLocaleDateString()}</span>
                        )}
                        <a 
                          href={linkedInExtractedData.post.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline flex items-center gap-1 font-medium"
                        >
                          <span>Open Post</span>
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>

                    <div 
                      className="p-3.5 rounded-lg text-sm leading-relaxed border"
                      style={{ 
                        backgroundColor: 'var(--surface-color)', 
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)',
                        maxHeight: '180px',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {linkedInExtractedData.post.rawText || '(No text content in post)'}
                    </div>

                    <div className="flex flex-wrap gap-4 mt-3 pt-2 text-xs text-secondary border-t" style={{ borderColor: 'var(--border-color)' }}>
                      <span><strong>Reactions:</strong> {linkedInExtractedData.post.likesCount || 0}</span>
                      <span><strong>Comments on LinkedIn:</strong> {linkedInExtractedData.post.commentsCount || 0}</span>
                      <span><strong>Reposts:</strong> {linkedInExtractedData.post.repostsCount || 0}</span>
                    </div>
                  </div>

                  {/* COMMENTS METRICS & FILTER SUMMARY BANNER */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl border text-center" style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)' }}>
                      <div className="text-xs text-muted uppercase font-semibold">Total Retrieved</div>
                      <div className="text-xl font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                        {linkedInExtractedData.metrics.totalRetrieved}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border text-center" style={{ backgroundColor: 'rgba(34, 197, 94, 0.08)', borderColor: 'rgba(34, 197, 94, 0.25)' }}>
                      <div className="text-xs text-green-600 dark:text-green-400 uppercase font-semibold">Retained Cleaned</div>
                      <div className="text-xl font-bold text-green-600 dark:text-green-400 mt-0.5">
                        {linkedInExtractedData.metrics.totalRetained}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border text-center" style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)' }}>
                      <div className="text-xs text-muted uppercase font-semibold">Noise Filtered</div>
                      <div className="text-xl font-bold text-secondary mt-0.5" title={`Empty: ${linkedInExtractedData.metrics.filteredBreakdown.empty}, URLs only: ${linkedInExtractedData.metrics.filteredBreakdown.urls_only}, Fluff (#CFBR): ${linkedInExtractedData.metrics.filteredBreakdown.engagement_fluff}, Duplicates: ${linkedInExtractedData.metrics.filteredBreakdown.duplicate}`}>
                        {linkedInExtractedData.metrics.filteredCount}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border text-center" style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)' }}>
                      <div className="text-xs text-muted uppercase font-semibold">Coverage Status</div>
                      <div className="text-xs font-semibold mt-1.5" style={{ color: linkedInExtractedData.metrics.isTruncated ? '#eab308' : '#22c55e' }}>
                        {linkedInExtractedData.metrics.isTruncated ? 'Partial (Logged-Out)' : 'All Available'}
                      </div>
                    </div>
                  </div>

                  {/* Truncation / Depth notice if applicable */}
                  {linkedInExtractedData.metrics.truncationNotice && (
                    <div 
                      className="p-3 rounded-xl border text-xs flex items-start gap-2.5"
                      style={{ backgroundColor: 'rgba(234, 179, 8, 0.08)', borderColor: 'rgba(234, 179, 8, 0.25)', color: 'var(--text-primary)' }}
                    >
                      <Info size={16} className="text-yellow-500 shrink-0 mt-0.5" />
                      <div>{linkedInExtractedData.metrics.truncationNotice}</div>
                    </div>
                  )}

                  {/* COMMENTS LIST PREVIEW (PAGINATED) */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <h4 className="text-sm font-semibold m-0" style={{ color: 'var(--text-primary)' }}>
                        Cleaned Comments ({linkedInExtractedData.comments.length})
                      </h4>
                      {linkedInExtractedData.comments.length > commentsPerPage && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted">
                            Page {commentsPage} of {Math.ceil(linkedInExtractedData.comments.length / commentsPerPage)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCommentsPage(p => Math.max(1, p - 1))}
                            disabled={commentsPage === 1}
                            className="btn btn-secondary py-0.5 px-2 text-xs"
                            style={{ height: '26px' }}
                          >
                            <ChevronLeft size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setCommentsPage(p => Math.min(Math.ceil(linkedInExtractedData.comments.length / commentsPerPage), p + 1))}
                            disabled={commentsPage >= Math.ceil(linkedInExtractedData.comments.length / commentsPerPage)}
                            className="btn btn-secondary py-0.5 px-2 text-xs"
                            style={{ height: '26px' }}
                          >
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    {linkedInExtractedData.comments.length === 0 ? (
                      <div className="p-4 rounded-xl text-center border text-xs text-muted" style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)' }}>
                        No comments available or all comments were filtered as noise/fluff.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        {linkedInExtractedData.comments
                          .slice((commentsPage - 1) * commentsPerPage, commentsPage * commentsPerPage)
                          .map((c, idx) => (
                            <div 
                              key={c.id || idx}
                              className="p-3 rounded-xl border text-xs flex flex-col gap-1.5"
                              style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-color)' }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                    {c.author}
                                  </span>
                                  {c.isReply && (
                                    <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] font-medium">
                                      Reply {c.parentAuthor ? `to @${c.parentAuthor}` : ''}
                                    </span>
                                  )}
                                  {c.authorHeadline && (
                                    <span className="text-muted truncate max-w-xs hidden sm:inline" title={c.authorHeadline}>
                                      • {c.authorHeadline}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-muted">
                                  {c.likesCount > 0 && (
                                    <span>👍 {c.likesCount}</span>
                                  )}
                                  {c.publicationDate && (
                                    <span>{new Date(c.publicationDate).toLocaleDateString()}</span>
                                  )}
                                </div>
                              </div>
                              <div className="leading-relaxed" style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                                {c.rawText}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* INGESTION RESULT BANNER */}
                  {linkedInIngestResult && (
                    <div 
                      className="p-4 rounded-xl border flex flex-col gap-2.5"
                      style={{ backgroundColor: 'rgba(34, 197, 94, 0.08)', borderColor: 'rgba(34, 197, 94, 0.25)', color: 'var(--text-primary)' }}
                    >
                      <div className="flex items-start gap-2.5">
                        <CheckCircle2 size={18} className="text-green-500 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-sm font-bold text-green-600 dark:text-green-400">
                            {linkedInIngestResult.message}
                          </div>
                          {linkedInIngestResult.batchId && (
                            <div className="text-xs text-muted mt-0.5 font-mono">
                              Batch ID: {linkedInIngestResult.batchId}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 pl-7 pt-1">
                        <button
                          type="button"
                          onClick={() => { setShowLinkedInModal(false); }}
                          className="btn btn-secondary text-xs"
                        >
                          View In Documents Table
                        </button>
                        <button
                          type="button"
                          onClick={() => { navigate(`/entity/${selectedEntity.entityId}/processing`); }}
                          className="btn btn-primary text-xs flex items-center gap-1.5"
                        >
                          <span>Proceed to AI Processing</span>
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* INGESTION ERROR ALERT */}
                  {linkedInIngestError && (
                    <div 
                      className="p-3.5 rounded-xl border text-sm flex items-start gap-2.5"
                      style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)', color: 'var(--text-primary)' }}
                    >
                      <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                      <div>{linkedInIngestError}</div>
                    </div>
                  )}

                  {/* INGEST ACTION BUTTON */}
                  {!linkedInIngestResult && (
                    <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
                      <span className="text-xs text-muted">
                        Adds 1 post document + {linkedInExtractedData.comments.length} comment document(s) separately into MongoDB.
                      </span>
                      <button
                        type="button"
                        onClick={handleIngestLinkedIn}
                        disabled={isIngestingLinkedIn}
                        className="btn font-semibold flex items-center gap-2 shadow-sm"
                        style={{
                          background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                          color: '#ffffff',
                          border: 'none',
                          padding: '0.75rem 1.75rem',
                          borderRadius: '8px',
                          cursor: isIngestingLinkedIn ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {isIngestingLinkedIn ? (
                          <>
                            <Loader2 size={16} className="spin" />
                            <span>Saving Documents & Creating Job...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={16} />
                            <span>Add as Documents (1 Post + {linkedInExtractedData.comments.length} Comments)</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '0.85rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'var(--bg-color)' }}>
              <button 
                type="button"
                onClick={() => { if (!isExtractingLinkedIn && !isIngestingLinkedIn) setShowLinkedInModal(false); }}
                className="btn btn-secondary text-xs"
                disabled={isExtractingLinkedIn || isIngestingLinkedIn}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataManagement;

