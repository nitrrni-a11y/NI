import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DataManagement from './pages/DataManagement';
import AddData from './pages/AddData';
import Processing from './pages/Processing';
// Placeholder pages for structural completeness
const Placeholder = ({ title }) => <div className="p-4"><h1>{title}</h1><p className="text-secondary mt-2">Component ready for next phase.</p></div>;

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route element={<AdminLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/data" element={<DataManagement />} />
          <Route path="/data/add" element={<AddData />} />
          <Route path="/processing" element={<Processing />} />
          
          <Route path="/sources" element={<Placeholder title="Sources Management" />} />
          <Route path="/topics" element={<Placeholder title="Topics Management" />} />
          <Route path="/narratives" element={<Placeholder title="Narratives Management" />} />
          <Route path="/settings" element={<Placeholder title="Settings & Profile" />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
