import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { MessageSquare } from 'lucide-react';

const Topics = () => {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTopics = async () => {
      try {
        const { data } = await axios.get('/api/topics', { withCredentials: true });
        setTopics(data);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    fetchTopics();
  }, []);

  if (loading) return <div className="p-4">Loading topics...</div>;

  return (
    <div>
      <div className="mb-4">
        <h1>Topics Overview</h1>
        <p className="text-secondary mt-1">Themes extracted from collected intelligence data.</p>
      </div>

      {topics.length === 0 ? (
        <div className="empty-state">
          <MessageSquare size={48} />
          <h3 className="mt-3">No topics identified yet.</h3>
          <p className="mt-2 text-muted">Topic extraction requires active data and AI processing.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {topics.map((t, i) => (
            <div key={i} className="card flex items-center justify-between">
              <span className="font-medium text-primary">{t.topic}</span>
              <span className="badge badge-info">{t.count} items</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Topics;
