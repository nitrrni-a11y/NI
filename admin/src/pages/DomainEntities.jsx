import React, { useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useEntity } from '../context/EntityContext';
import { Search, Plus, Building2, ArrowRight, ArrowLeft } from 'lucide-react';
import axios from 'axios';

const DomainEntities = () => {
  const { domain } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { entities, loading, changeEntity, addEntity } = useEntity();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Domain Management State
  const [dbDomain, setDbDomain] = useState(null);
  const [showEditDomainModal, setShowEditDomainModal] = useState(false);
  const [showDeleteDomainModal, setShowDeleteDomainModal] = useState(false);
  const [editDomainData, setEditDomainData] = useState({ name: '', description: '' });
  const [isDomainSubmitting, setIsDomainSubmitting] = useState(false);
  const [domainError, setDomainError] = useState('');

  // Fetch Domain Details
  React.useEffect(() => {
    axios.get('/api/domains', { withCredentials: true })
      .then(res => {
        const found = res.data.find(d => d.name === domain);
        if (found) {
          setDbDomain(found);
          setEditDomainData({ name: found.name, description: found.description || '' });
        }
      })
      .catch(err => console.error('Failed to fetch domains', err));
  }, [domain]);

  const handleEditDomain = async () => {
    if (!editDomainData.name.trim() || !dbDomain) return;
    setIsDomainSubmitting(true);
    setDomainError('');
    try {
      await axios.put(`/api/domains/${dbDomain._id}`, editDomainData, { withCredentials: true });
      // On success, redirect to the new domain name
      navigate(`/domains/${encodeURIComponent(editDomainData.name.trim())}`, { replace: true });
      window.location.reload(); // Force reload to fetch updated entities if name changed
    } catch (error) {
      setDomainError(error.response?.data?.message || 'Failed to update domain');
      setIsDomainSubmitting(false);
    }
  };

  const handleDeleteDomain = async () => {
    if (!dbDomain) return;
    setIsDomainSubmitting(true);
    setDomainError('');
    try {
      await axios.delete(`/api/domains/${dbDomain._id}`, { withCredentials: true });
      navigate('/', { replace: true });
    } catch (error) {
      setDomainError(error.response?.data?.message || 'Failed to delete domain');
      setIsDomainSubmitting(false);
    }
  };
  
  const [showAddModal, setShowAddModal] = useState(
    new URLSearchParams(location.search).get('create') === 'true'
  );
  const [newEntity, setNewEntity] = useState({
    name: '',
    entityType: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (loading) return <div>Loading entities...</div>;

  const domainEntities = entities.filter(e => e.domain === domain);
  const filteredEntities = domainEntities.filter(e => 
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    e.entityType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEntityClick = (entityId) => {
    changeEntity(entityId);
    navigate(`/entity/${entityId}/dashboard`);
  };

  const handleCreateEntity = async () => {
    if (!newEntity.name || !newEntity.entityType) return;
    
    setIsSubmitting(true);
    try {
      const res = await axios.post('/api/entities', {
        name: newEntity.name,
        entityType: newEntity.entityType,
        domain: domain,
        description: newEntity.description
      }, { withCredentials: true });
      
      // Auto navigate to new entity
      addEntity(res.data);
      navigate(`/entity/${res.data.entityId}/dashboard`);
    } catch (error) {
      console.error('Failed to create entity:', error);
      alert('Failed to create entity');
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <div className="mb-6">
        <Link 
          to="/" 
          className="btn btn-secondary flex items-center gap-2" 
          style={{ textDecoration: 'none', width: 'fit-content', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
        >
          <ArrowLeft size={16} />
          Back to Domains
        </Link>
      </div>
      
      <div className="flex flex-col mb-12">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{domain}</h1>
            <p className="text-secondary mb-6" style={{ fontSize: '1.1rem' }}>Manage entities within this domain.</p>
          </div>
          {dbDomain && (
            <div className="flex flex-wrap gap-3">
              <button 
                className="btn btn-secondary shadow-sm"
                onClick={() => setShowEditDomainModal(true)}
              >
                Edit Domain
              </button>
              <button 
                className="btn btn-secondary shadow-sm text-red-500 hover:border-red-300"
                onClick={() => setShowDeleteDomainModal(true)}
              >
                Delete Domain
              </button>
            </div>
          )}
        </div>
        <div>
          <button 
            className="btn btn-primary shadow-sm flex items-center gap-2"
            onClick={() => setShowAddModal(true)}
            style={{ padding: '0.75rem 1.5rem', fontWeight: 500 }}
          >
            <Plus size={20} />
            <span>Add Entity</span>
          </button>
        </div>
      </div>

      <div className="card mb-6 flex items-center gap-3 p-3">
        <Search size={20} className="text-muted" />
        <input 
          type="text" 
          placeholder="Search entities..." 
          className="form-control border-0 p-0 m-0 w-full bg-transparent focus:ring-0"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ outline: 'none' }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredEntities.map(entity => (
          <div 
            key={entity.entityId}
            className="card transition-all hover:shadow-md cursor-pointer flex flex-col"
            onClick={() => handleEntityClick(entity.entityId)}
            style={{ padding: '1.5rem', border: '1px solid var(--border-color)', borderRadius: '12px' }}
          >
            <div className="flex items-center gap-4 mb-5">
              <div className="p-3 bg-secondary rounded-lg" style={{ backgroundColor: 'var(--bg-color)' }}>
                <Building2 size={24} className="text-primary-color" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="truncate" style={{ color: 'var(--text-color)', fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>{entity.name}</h2>
                  <div className="badge shrink-0" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '12px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>{entity.entityType}</div>
                </div>
                {entity.description && (
                  <p className="text-secondary text-sm line-clamp-1 m-0">{entity.description}</p>
                )}
              </div>
            </div>
            
            <div className="mt-auto pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center justify-between text-primary-color text-sm font-medium">
                <span>Open Dashboard</span>
                <ArrowRight size={18} />
              </div>
            </div>
          </div>
        ))}

        {filteredEntities.length === 0 && (
          <div className="col-span-full card text-center py-12">
            <h3 className="text-secondary mb-2">No entities found</h3>
            <p className="text-muted">No entities match your search or this domain is empty.</p>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.6)' }}>
          <div className="modal-content shadow-lg" style={{ maxWidth: '500px', width: '100%', padding: '2rem', borderRadius: '12px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Create Entity</h2>
            
            <div className="form-group mb-6">
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>Domain</label>
              <input type="text" className="form-control" value={domain} disabled style={{ backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', width: '100%', padding: '0.75rem', borderRadius: '6px' }} />
            </div>

            <div className="form-group mb-6">
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>Entity Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="form-control"
                value={newEntity.name}
                onChange={(e) => setNewEntity({...newEntity, name: e.target.value})}
                placeholder="e.g. NIT Raipur, iPhone"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
              />
            </div>

            <div className="form-group mb-6">
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>Entity Type <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="form-control"
                value={newEntity.entityType}
                onChange={(e) => setNewEntity({...newEntity, entityType: e.target.value})}
                placeholder="e.g. Institution, Product, Company"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
              />
            </div>

            <div className="form-group mb-6">
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>Description <span className="text-gray-400 font-normal">(Optional)</span></label>
              <textarea
                className="form-control"
                value={newEntity.description}
                onChange={(e) => setNewEntity({...newEntity, description: e.target.value})}
                placeholder="Brief description of the entity"
                rows={3}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)', resize: 'vertical' }}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button 
                className="btn text-secondary hover:text-primary transition-colors" 
                onClick={() => {
                  setShowAddModal(false);
                  if (location.search.includes('create=true')) {
                    navigate(`/domains/${encodeURIComponent(domain)}`, { replace: true });
                  }
                }} 
                disabled={isSubmitting}
                style={{ padding: '0.6rem 1.25rem', backgroundColor: 'transparent', border: 'none' }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary shadow-sm" 
                onClick={handleCreateEntity}
                disabled={!newEntity.name || !newEntity.entityType || isSubmitting}
                style={{ padding: '0.6rem 1.25rem', fontWeight: 500 }}
              >
                {isSubmitting ? 'Creating...' : 'Create Entity'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showEditDomainModal && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.6)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}>
          <div className="modal-content shadow-lg bg-white" style={{ maxWidth: '500px', width: '100%', padding: '2rem', borderRadius: '12px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Edit Domain</h2>
            
            {domainError && <div className="p-3 mb-4 rounded border border-red-200 bg-red-50 text-red-600 text-sm">{domainError}</div>}
            
            <div className="form-group mb-6">
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>Domain Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="form-control"
                value={editDomainData.name}
                onChange={(e) => setEditDomainData({...editDomainData, name: e.target.value})}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
              />
            </div>

            <div className="form-group mb-6">
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>Description</label>
              <textarea
                className="form-control"
                value={editDomainData.description}
                onChange={(e) => setEditDomainData({...editDomainData, description: e.target.value})}
                rows={3}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)', resize: 'vertical' }}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button 
                className="btn text-secondary hover:text-primary transition-colors" 
                onClick={() => { setShowEditDomainModal(false); setDomainError(''); }} 
                disabled={isDomainSubmitting}
                style={{ padding: '0.6rem 1.25rem', backgroundColor: 'transparent', border: 'none' }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary shadow-sm" 
                onClick={handleEditDomain}
                disabled={!editDomainData.name.trim() || isDomainSubmitting}
                style={{ padding: '0.6rem 1.25rem', fontWeight: 500 }}
              >
                {isDomainSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteDomainModal && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.6)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}>
          <div className="modal-content shadow-lg bg-white" style={{ maxWidth: '500px', width: '100%', padding: '2rem', borderRadius: '12px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem', color: '#ef4444' }}>Delete Domain</h2>
            
            <div className="mb-6 text-secondary" style={{ lineHeight: '1.6' }}>
              <p className="mb-3">Are you sure you want to delete the domain <strong>{domain}</strong>?</p>
              <p className="text-sm font-medium">This action cannot be undone. You can only delete a domain if it contains no entities.</p>
            </div>

            {domainError && <div className="p-3 mb-4 rounded border border-red-200 bg-red-50 text-red-600 text-sm">{domainError}</div>}
            
            <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button 
                className="btn text-secondary hover:text-primary transition-colors" 
                onClick={() => { setShowDeleteDomainModal(false); setDomainError(''); }} 
                disabled={isDomainSubmitting}
                style={{ padding: '0.6rem 1.25rem', backgroundColor: 'transparent', border: 'none' }}
              >
                Cancel
              </button>
              <button 
                className="btn shadow-sm" 
                onClick={handleDeleteDomain}
                disabled={isDomainSubmitting}
                style={{ padding: '0.6rem 1.25rem', fontWeight: 500, backgroundColor: '#ef4444', color: 'white' }}
              >
                {isDomainSubmitting ? 'Deleting...' : 'Delete Domain'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DomainEntities;
