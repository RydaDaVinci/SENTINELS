// frontend/src/App.jsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Welcome from './components/Welcome.jsx';
import Dashboard from './components/Dashboard.jsx';
import EmailDetail from './components/EmailDetail.jsx';
import Settings from './components/Settings.jsx';  // Add .jsx extension
import AuthSuccess from './components/AuthSuccess.jsx';  // Add .jsx extension
import Loading from './components/Loading.jsx';
import './App.css';

// Check authentication
const isAuthenticated = () => {
  return localStorage.getItem('token') !== null;
};

const ProtectedRoute = ({ children }) => {
  return isAuthenticated() ? children : <Navigate to="/" />;
};

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchUser(token);
    }
  }, []);

  const fetchUser = async (token) => {
    try {
      const response = await fetch('http://localhost:5000/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setUser(data);
    } catch (error) {
      console.error('Error fetching user:', error);
    }
  };

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Welcome user={user} />} />
          <Route path="/auth-success" element={<AuthSuccess />} />
          <Route path="/loading" element={<Loading />} />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard user={user} setUser={setUser} />
            </ProtectedRoute>
          } />
          <Route path="/email/:id" element={
            <ProtectedRoute>
              <EmailDetail />
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute>
              <Settings user={user} setUser={setUser} />
            </ProtectedRoute>
          } />
        </Routes>
      </div>
    </Router>
  );
}

export default App;