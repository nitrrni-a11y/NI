import React from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Mail, Shield } from 'lucide-react';

const Profile = () => {
  const { user } = useAuth();

  if (!user) return <div className="p-4">Not logged in.</div>;

  return (
    <div>
      <div className="mb-4">
        <h1>User Profile</h1>
      </div>

      <div className="card" style={{ maxWidth: '500px' }}>
        <div className="flex items-center gap-4 mb-6 pb-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="w-16 h-16 rounded-full bg-accent-blue flex items-center justify-center text-2xl font-bold text-white">
            {user.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2>{user.name}</h2>
            <div className="badge badge-outline mt-1">{user.role || 'user'}</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 text-secondary">
            <Mail size={18} />
            <span>{user.email}</span>
          </div>
          <div className="flex items-center gap-3 text-secondary">
            <Shield size={18} />
            <span>Standard Clearance</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
