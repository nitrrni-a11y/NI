import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Narratives from './pages/Narratives';
import NarrativeDetail from './pages/NarrativeDetail';
import Profile from './pages/Profile';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        {/* Main Application Shell */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<Landing />} />
          
          {/* User Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/narratives" element={<Narratives />} />
            <Route path="/narratives/:id" element={<NarrativeDetail />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
