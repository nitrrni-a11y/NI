import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ViewData from './pages/ViewData';
import AddData from './pages/AddData';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route element={<AdminLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/news" element={<ViewData />} />
          <Route path="/news/add" element={<AddData />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
