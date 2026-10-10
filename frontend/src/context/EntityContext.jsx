import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

const EntityContext = createContext();

export const EntityProvider = ({ children }) => {
  const [entities, setEntities] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEntities = async () => {
      try {
        const { data } = await axios.get('/api/entities', { withCredentials: true });
        setEntities(data);
        
        const savedEntityId = localStorage.getItem('selectedEntityId');
        if (savedEntityId && data.find(e => e.entityId === savedEntityId)) {
          setSelectedEntity(data.find(e => e.entityId === savedEntityId));
        } else if (data.length > 0) {
          setSelectedEntity(data[0]);
          localStorage.setItem('selectedEntityId', data[0].entityId);
        }
      } catch (error) {
        console.error('Failed to fetch entities', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchEntities();
  }, []);

  const changeEntity = (entityId, reload = false) => {
    const entity = entities.find(e => e.entityId === entityId);
    if (entity) {
      setSelectedEntity(entity);
      localStorage.setItem('selectedEntityId', entityId);
      if (reload) {
        window.location.reload();
      }
    }
  };

  return (
    <EntityContext.Provider value={{ entities, selectedEntity, changeEntity, loading }}>
      {children}
    </EntityContext.Provider>
  );
};

export const useEntity = () => useContext(EntityContext);
export default EntityContext;
