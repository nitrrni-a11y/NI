import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useEntity } from '../context/EntityContext';
import { Folder, Plus, Server, LayoutGrid } from 'lucide-react';
import axios from 'axios';

const Domains = () => {
  const { entities, loading } = useEntity();
  const [dbDomains, setDbDomains] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch domains from backend
    axios.get('/api/domains', { withCredentials: true })
      .then(res => setDbDomains(res.data))
      .catch(err => console.error('Failed to fetch domains', err));
  }, []);

  if (loading) return <div className="p-8 text-secondary">Loading domains...</div>;

  // Derive domains from both the Domain collection and existing entities
  const domainMap = {};
  
  // First populate from dbDomains
  dbDomains.forEach(d => {
    domainMap[d.name] = { count: 0, entities: [], description: d.description };
  });

  // Then populate from entities
  entities.forEach(entity => {
    if (!domainMap[entity.domain]) {
      domainMap[entity.domain] = { count: 0, entities: [] };
    }
    domainMap[entity.domain].count += 1;
    domainMap[entity.domain].entities.push(entity);
  });

  const domainList = Object.keys(domainMap).sort();

  const handleContinue = async () => {
    if (!newDomain.trim()) return;
    try {
      await axios.post('/api/domains', { name: newDomain.trim() }, { withCredentials: true });
    } catch (err) {
      // If 400, it likely means it already exists, which is fine, we just navigate
      if (err.response?.status !== 400) {
        console.error('Failed to create domain', err);
      }
    }
    // We can directly navigate and open the create entity modal
    navigate(`/domains/${encodeURIComponent(newDomain.trim())}?create=true`);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <div className="flex flex-col mb-12">
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Analysis & Entity Management</h1>
        <p className="text-secondary mb-6" style={{ fontSize: '1.1rem' }}>Select a domain to manage its entities and intelligence pipelines.</p>
        <div>
          <button 
            className="btn btn-primary flex items-center gap-2"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={18} />
            <span>Add Domain</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {domainList.map(domain => (
          <Link 
            to={`/domains/${encodeURIComponent(domain)}`} 
            key={domain}
            className="card transition-all hover:shadow-md"
            style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none' }}
          >
            <div className="flex items-center gap-4 mb-5">
              <div className="p-3 bg-secondary rounded-lg" style={{ backgroundColor: 'var(--bg-color)' }}>
                <LayoutGrid size={24} className="text-primary-color" />
              </div>
              <div>
                <h2 style={{ color: 'var(--text-color)', fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>{domain}</h2>
                <div className="text-secondary mt-1" style={{ fontSize: '0.9rem' }}>
                  {domainMap[domain].count} {domainMap[domain].count === 1 ? 'entity' : 'entities'}
                </div>
              </div>
            </div>
            
            <div className="mt-auto pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center justify-between text-primary-color text-sm font-medium">
                <span>View Entities</span>
                <span>&rarr;</span>
              </div>
            </div>
          </Link>
        ))}

        {domainList.length === 0 && (
          <div className="col-span-full card text-center py-12">
            <h3 className="text-secondary mb-2">No domains configured</h3>
            <p className="text-muted">Create a domain to start tracking entities.</p>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.6)' }}>
          <div className="modal-content shadow-lg" style={{ maxWidth: '450px', width: '100%', padding: '2rem', borderRadius: '12px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Add Domain</h2>
            <p className="text-secondary mb-6" style={{ lineHeight: 1.5 }}>
              Create a new domain to organize related entities. You will be prompted to create your first entity inside this domain.
            </p>
            
            <div className="form-group mb-8">
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>Domain Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="form-control"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="e.g. Healthcare, Finance"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleContinue(); }}
              />
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button 
                className="btn text-secondary hover:text-primary transition-colors" 
                onClick={() => setShowAddModal(false)}
                style={{ padding: '0.6rem 1.25rem', backgroundColor: 'transparent', border: 'none' }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary shadow-sm"
                onClick={handleContinue}
                disabled={!newDomain.trim()}
                style={{ padding: '0.6rem 1.25rem', fontWeight: 500 }}
              >
                Continue to Entity
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Domains;
