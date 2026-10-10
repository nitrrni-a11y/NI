import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { AuthProvider } from './context/AuthContext.jsx';
import { EntityProvider } from './context/EntityContext.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <EntityProvider>
        <App />
      </EntityProvider>
    </AuthProvider>
  </React.StrictMode>,
);
