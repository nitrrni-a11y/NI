import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Search, PlusCircle, Database, Trash2, Upload, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEntity } from '../context/EntityContext';

const DataManagement = () => {
  const { selectedEntity } = useEntity();
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

  const [selectedDocs, setSelectedDocs] = useState(new Set());
  const [viewDoc, setViewDoc] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  
  const fileInputRef = React.useRef(null);

  // Scroll lock for modals
  useEffect(() => {
    if (viewDoc || deleteConfirmation) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [viewDoc, deleteConfirmation]);

  const handleCsvChange = (e) => {
    const file = e.target.files[0];
    setCsvFile(file || null);
    setCsvError(null);
    setUploadResult(null);

    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const firstLine = text.split('\n')[0].toLowerCase();
        
        const required = ['timestamp', 'raw_text', 'source', 'author', 'published_date'];
        const missing = required.filter(col => !firstLine.includes(col));
        
        if (missing.length > 0) {
          setCsvError(`Invalid CSV format. Missing required columns: ${missing.join(', ')}`);
          setCsvFile(null);
        }
      };
      reader.readAsText(file.slice(0, 4096)); 
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFile) return;
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
      setUploadResult({ success: true, message: res.data.message, savedCount: res.data.savedCount, totalRows: res.data.totalRows });
      fetchData(query, 1);
    } catch (err) {
      setUploadResult({
        success: false,
        message: err.response?.data?.message || err.message
      });
    }
    setUploading(false);
    setCsvFile(null);
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

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="flex flex-col mb-12">
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Data Management</h1>
        <p className="text-secondary mb-6" style={{ fontSize: '1.1rem' }}>Manage raw intelligence documents.</p>
        <div>
          <Link to={`/entity/${selectedEntity.entityId}/data/add`} className="btn btn-primary shadow-sm flex items-center gap-2" style={{ padding: '0.75rem 1.5rem', fontWeight: 500, width: 'fit-content' }}>
            <PlusCircle size={20} />
            <span>Add Document</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="card shadow-sm border border-gray-100 flex flex-col">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4"><Search size={18} /> Search Documents</h3>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="form-control flex items-center gap-2" style={{ flex: 1, padding: '0.6rem 1rem' }}>
              <Search size={18} className="text-muted" />
              <input 
                type="text" 
                placeholder="Search raw text, titles..." 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: 'inherit', outline: 'none', width: '100%' }} 
              />
            </div>
            <button type="submit" className="btn btn-secondary shadow-sm">Search</button>
          </form>
          <div className="mt-4 text-sm text-secondary">
            Find documents by content or metadata to manage or delete them.
          </div>
        </div>

        <div className="card shadow-sm border border-gray-100 flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2"><Upload size={18} /> Bulk Upload CSV</h3>
              <p className="text-secondary text-sm mt-1">Upload a dataset to ingest documents.</p>
            </div>
          </div>

          {csvError && (
            <div className="mb-4 p-3 rounded text-sm font-medium border border-red-300 bg-red-50 text-red-700">
              {csvError}
            </div>
          )}

          <div className="flex gap-4 items-center mt-auto">
            <div 
              className="flex-1 flex items-center justify-between border-2 border-dashed rounded cursor-pointer transition-colors" 
              style={{ padding: '0.8rem 1.2rem', borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-color)' }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                accept=".csv"
                ref={fileInputRef}
                onChange={handleCsvChange}
                style={{ display: 'none' }}
              />
              <span className="text-secondary truncate font-medium text-sm">
                {csvFile ? csvFile.name : 'Choose CSV or drop here'}
              </span>
              <button 
                type="button" 
                className="btn btn-secondary shadow-sm py-1 px-3 text-sm"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                Browse
              </button>
            </div>
            <button 
              className="btn btn-primary shadow-sm" 
              onClick={handleCsvUpload} 
              disabled={!csvFile || uploading || csvError}
              style={{ padding: '0.6rem 1.5rem', opacity: (!csvFile || uploading || csvError) ? 0.6 : 1 }}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
          {uploadResult && (
            <div className="mt-4 p-3 rounded border font-medium text-sm" style={{ 
              backgroundColor: uploadResult.success ? '#dcfce7' : '#fee2e2', 
              borderColor: uploadResult.success ? '#22c55e' : '#ef4444', 
              color: uploadResult.success ? '#15803d' : '#b91c1c' 
            }}>
              <p>{uploadResult.message}</p>
              {uploadResult.success && uploadResult.savedCount !== undefined && (
                <p className="mt-1 font-normal opacity-90">Saved records: {uploadResult.savedCount} / Total: {uploadResult.totalRows}</p>
              )}
            </div>
          )}
        </div>
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1.5rem' }}>
          <div style={{ backgroundColor: 'var(--surface-color)', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-color)' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>Document Details</h2>
              <button 
                onClick={() => setViewDoc(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: 'var(--text-muted)', lineHeight: 1 }}
              >
                &times;
              </button>
            </div>
            
            {/* Scrollable Content */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>Source</div>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{viewDoc.source || 'Not available'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>Author</div>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{viewDoc.author || 'Not available'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>Published Date</div>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                    {viewDoc.publicationDate ? new Date(viewDoc.publicationDate).toLocaleDateString() : 'Not available'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>Collected Timestamp</div>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
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
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{viewDoc._id}</div>
                </div>
              </div>
              
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.75rem' }}>Full Content</div>
                <div style={{ padding: '1.25rem', borderRadius: '6px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', whiteSpace: 'pre-wrap', color: 'var(--text-primary)', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                  {viewDoc.rawText}
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setViewDoc(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1.5rem' }}>
          <div style={{ backgroundColor: 'var(--surface-color)', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            
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
    </div>
  );
};

export default DataManagement;

