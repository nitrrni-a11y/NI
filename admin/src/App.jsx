import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DataManagement from './pages/DataManagement';
import AddData from './pages/AddData';
import Processing from './pages/Processing';
import Narratives from './pages/Narratives';
 
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
          <Route path="/narratives" element={<Narratives />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
