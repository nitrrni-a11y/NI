import React, { createContext, useState, useEffect, useContext } from 'react';
import api, { toArray } from '../services/api';
import { useAuth } from './AuthContext';

const EntityContext = createContext();

export const EntityProvider = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [entities, setEntities] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setEntities([]);
      setSelectedEntity(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchEntities = async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/entities');
        const entityList = toArray(data, 'entities');
        if (cancelled) return;
        setEntities(entityList);

        const savedEntityId = localStorage.getItem('selectedEntityId');
        const matched = savedEntityId ? entityList.find(e => e.entityId === savedEntityId) : null;
        if (matched) {
          setSelectedEntity(matched);
        } else if (entityList.length > 0) {
          setSelectedEntity(entityList[0]);
          localStorage.setItem('selectedEntityId', entityList[0].entityId);
        } else {
          setSelectedEntity(null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch entities', error);
          setEntities([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchEntities();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const changeEntity = (entityId, reload = false) => {
    const safeEntities = Array.isArray(entities) ? entities : [];
    const entity = safeEntities.find(e => e.entityId === entityId);
    if (entity) {
      setSelectedEntity(entity);
      localStorage.setItem('selectedEntityId', entityId);
      if (reload) {
        window.location.reload();
      }
    } else {
      localStorage.setItem('selectedEntityId', entityId);
    }
  };

  const addEntity = (entity) => {
    setEntities(prev => [...(Array.isArray(prev) ? prev : []), entity]);
    setSelectedEntity(entity);
    localStorage.setItem('selectedEntityId', entity.entityId);
  };

  return (
    <EntityContext.Provider value={{ entities, selectedEntity, changeEntity, addEntity, loading }}>
      {children}
    </EntityContext.Provider>
  );
};

export const useEntity = () => useContext(EntityContext);
export default EntityContext;
