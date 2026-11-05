import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DataManagement from './pages/DataManagement';
import AddData from './pages/AddData';
import Processing from './pages/Processing';
import Narratives from './pages/Narratives';
import LinkedInPostScraper from './pages/LinkedInPostScraper';
import LinkedInDiscovery from './pages/LinkedInDiscovery';
import YouTubeDiscovery from './pages/YouTubeDiscovery';
 
import GlobalLayout from './components/GlobalLayout';
import Domains from './pages/Domains';
import DomainEntities from './pages/DomainEntities';
import Institution from './pages/Institution';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Global Domain/Entity Selection */}
        <Route element={<GlobalLayout />}>
          <Route path="/" element={<Domains />} />
          <Route path="/domains/:domain" element={<DomainEntities />} />
        </Route>
        
        <Route path="/entity/:entityId" element={<AdminLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="institution" element={<Institution />} />
          <Route path="linkedin-post" element={<Navigate to="../data/add?tab=linkedin" replace />} />
          <Route path="youtube-extractor" element={<Navigate to="../data/add?tab=youtube" replace />} />
          <Route path="discovery" element={<Navigate to="youtube" replace />} />
          <Route path="discovery/youtube" element={<YouTubeDiscovery />} />
          <Route path="discovery/linkedin" element={<LinkedInDiscovery />} />
          <Route path="youtube-discovery" element={<YouTubeDiscovery />} />
          <Route path="linkedin-discovery" element={<LinkedInDiscovery />} />
          <Route path="data" element={<DataManagement />} />
          <Route path="data/add" element={<AddData />} />
          <Route path="processing" element={<Processing />} />
          <Route path="narratives" element={<Narratives />} />
        </Route>

        {/* Fallback for old routes, redirect to domains */}
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
