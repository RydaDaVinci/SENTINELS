import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Loading.css';

const Loading = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Initializing...');
  const [emailsProcessed, setEmailsProcessed] = useState(0);
  const [totalEmails, setTotalEmails] = useState(20); // Define this state
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');

    if (!token) {
      navigate('/');
      return;
    }

    // Save token
    localStorage.setItem('token', token);

    // Track polling attempts
    let pollCount = 0;
    const maxPolls = 30; // Stop after 30 attempts (60 seconds)

    // Start polling for email processing status
    const checkStatus = async () => {
      pollCount++;
      
      try {
        const response = await fetch('http://localhost:5000/api/email-status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        // Update total if provided
        if (data.total) {
          setTotalEmails(data.total);
        }
        
        if (data.status === 'complete') {
          setProgress(100);
          setStatus('Loading complete!');
          // Short delay then navigate
          console.log('Token in localStorage:', localStorage.getItem('token'));
          setTimeout(() => navigate('/dashboard'), 500);
          return true; // Stop polling
        } 
        else if (data.status === 'error') {
          setError(data.error || 'Error processing emails');
          setStatus('Error loading emails');
          return true; // Stop polling on error
        } 
        else if (data.status === 'processing') {
          setEmailsProcessed(data.count || 0);
          
          // Calculate progress based on actual processed count
          if (data.total > 0) {
            // Use actual total from backend
            const calculatedProgress = Math.floor((data.count / data.total) * 100);
            setProgress(Math.min(99, calculatedProgress)); // Cap at 99% until complete
          } else {
            // Fallback to old calculation
            const calculatedProgress = Math.min(99, Math.floor((data.count / 20) * 100));
            setProgress(calculatedProgress);
          }
          
          setStatus(data.message || `Processing emails... (${data.count}/${data.total || 20})`);
        }
      } catch (err) {
        console.error('Status check error:', err);
        if (pollCount > maxPolls) {
          setError('Loading timed out. Please try again.');
          setStatus('Timeout error');
        }
      }
      return false; // Continue polling
    };

    // Check immediately
    checkStatus();
    
    // Then poll every 2 seconds
    const interval = setInterval(async () => {
      const shouldStop = await checkStatus();
      if (shouldStop) {
        clearInterval(interval);
      }
    }, 2000);

    // Fallback timeout - if still loading after 60 seconds, show error
    const timeout = setTimeout(() => {
      if (progress < 100) {
        setError('Loading is taking longer than expected. Please try again.');
        setStatus('Timeout error');
      }
    }, 60000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [location, navigate]); // Remove progress from dependencies to avoid infinite loops

  return (
    <div className="loading-container">
      <div className="loading-card">
        <h1 className="loading-title">S.E.N.T.I.N.E.L</h1>
        
        {error ? (
          <div className="error-message">
            <p>❌ {error}</p>
            <p className="error-details">{status}</p>
            <div className="error-actions">
              <button onClick={() => navigate('/dashboard')} className="btn btn-secondary">
                Go to Dashboard
              </button>
              <button onClick={() => window.location.reload()} className="btn btn-primary">
                Try Again
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="loader"></div>
            
            <p className="loading-status">{status}</p>
            
            <div className="progress-container">
              <div 
                className="progress-bar" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            
            <p className="progress-text">{progress}%</p>
            
            {emailsProcessed > 0 && (
              <p className="emails-count">
                📧 {emailsProcessed} of {totalEmails} emails analyzed
              </p>
            )}
            
            <div className="loading-steps">
              <div className={`step ${progress >= 25 ? 'completed' : ''}`}>
                <div className="step-number">1</div>
                <span>Connecting to Gmail</span>
              </div>
              <div className={`step ${progress >= 50 ? 'completed' : ''}`}>
                <div className="step-number">2</div>
                <span>Fetching emails</span>
              </div>
              <div className={`step ${progress >= 75 ? 'completed' : ''}`}>
                <div className="step-number">3</div>
                <span>Analyzing threats</span>
              </div>
              <div className={`step ${progress >= 100 ? 'completed' : ''}`}>
                <div className="step-number">4</div>
                <span>Loading dashboard</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Loading;