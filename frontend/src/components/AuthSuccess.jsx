// frontend/src/components/AuthSuccess.jsx
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const AuthSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');

    if (token) {
      localStorage.setItem('token', token);
      navigate('/dashboard');
    } else {
      navigate('/');
    }
  }, [location, navigate]);

  return (
    <div className="auth-loading">
      <div className="loading-spinner"></div>
      <p>Authentication successful! Redirecting...</p>
    </div>
  );
};

export default AuthSuccess;