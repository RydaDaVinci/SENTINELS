import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Welcome.css';

const Welcome = ({ user }) => {
  const navigate = useNavigate();

  const handleGoogleLogin = () => {
    window.location.href = 'http://localhost:5000/api/auth/google';
  };

  const handleDashboard = () => {
    navigate('/dashboard');
  };

  return (
    <div className="welcome-container">
      <div className="welcome-content">
        <h1 className="welcome-title">S.E.N.T.I.N.E.L</h1>
        <p className="welcome-subtitle">
          Sentiment-Enhanced Neural Threat Intelligence Network for Enterprise Logs
        </p>
        
        <div className="model-showcase">
          <div className="model-card">
            <h3>SimpleDNN</h3>
            <p>3-layer neural network</p>
            <span className="model-badge">256→128→64</span>
          </div>
          <div className="model-card">
            <h3>DeepDNN</h3>
            <p>5-layer with batch norm</p>
            <span className="model-badge">512→256→128→64</span>
          </div>
          <div className="model-card">
            <h3>WideDNN</h3>
            <p>Wide with residual connections</p>
            <span className="model-badge">512→512→256→128</span>
          </div>
        </div>
        
        <div className="features">
          <div className="feature">
            <h3>Ensemble Voting</h3>
            <p>All 3 models vote on each email</p>
          </div>
          <div className="feature">
            <h3>Gmail Integration</h3>
            <p>Real-time email scanning</p>
          </div>
          <div className="feature">
            <h3>Risk Analysis</h3>
            <p>LOW, MEDIUM, HIGH risk levels</p>
          </div>
        </div>
        
        {user ? (
          <button 
            className="btn btn-primary welcome-btn"
            onClick={handleDashboard}
          >
            Go to Dashboard
          </button>
        ) : (
          <button 
            className="btn btn-primary welcome-btn"
            onClick={handleGoogleLogin}
          >
            Login with Gmail
          </button>
        )}
      </div>
    </div>
  );
};

export default Welcome;