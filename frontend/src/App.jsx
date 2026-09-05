import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import DataOverview from './pages/DataOverview';
import DataDetail from './pages/DataDetail';
import Narratives from './pages/Narratives';
import NarrativeDetail from './pages/NarrativeDetail';
import Sources from './pages/Sources';
import Topics from './pages/Topics';
import Profile from './pages/Profile';
import Search from './pages/Search';
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
            <Route path="/news" element={<DataOverview />} />
            <Route path="/news/:id" element={<DataDetail />} />
            <Route path="/narratives" element={<Narratives />} />
            <Route path="/narratives/:id" element={<NarrativeDetail />} />
            <Route path="/sources" element={<Sources />} />
            <Route path="/topics" element={<Topics />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/search" element={<Search />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
