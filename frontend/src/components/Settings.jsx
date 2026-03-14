// frontend/src/components/Settings.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Settings.css';

const Settings = ({ user, setUser }) => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    autoScan: true,
    alertThreshold: 'MEDIUM',
    notifications: true,
    ensembleVoting: true
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/gmail/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.settings) {
          setSettings(data.settings);
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/auth/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Settings updated successfully!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to update settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    navigate('/');
  };

  return (
    <div className="settings-page">
      <nav className="navbar">
        <Link to="/dashboard" className="navbar-brand">DNN Threat Detector</Link>
        <div className="navbar-menu">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/settings" className="active">Settings</Link>
          {user && (
            <div className="user-info">
              <img src={user.picture} alt={user.name} className="user-avatar" />
              <span>{user.name}</span>
            </div>
          )}
          <button onClick={handleLogout} className="btn btn-secondary">Logout</button>
        </div>
      </nav>

      <div className="container">
        <div className="settings-header">
          <h1>Settings</h1>
          <p>Configure your threat detection preferences</p>
        </div>

        {message.text && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="settings-grid">
          <div className="settings-card">
            <h2>Account Information</h2>
            {user && (
              <div className="account-info">
                <div className="info-row">
                  <span className="info-label">Name:</span>
                  <span className="info-value">{user.name}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Email:</span>
                  <span className="info-value">{user.email}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Connected:</span>
                  <span className="info-value status-connected">Gmail Connected ✓</span>
                </div>
              </div>
            )}
          </div>

          <div className="settings-card">
            <h2>Detection Settings</h2>
            <form onSubmit={handleSubmit}>
              <div className="setting-item">
                <label className="setting-label">
                  <input
                    type="checkbox"
                    name="autoScan"
                    checked={settings.autoScan}
                    onChange={handleChange}
                  />
                  <span className="setting-text">
                    <strong>Auto-scan new emails</strong>
                    <small>Automatically analyze incoming emails</small>
                  </span>
                </label>
              </div>

              <div className="setting-item">
                <label className="setting-label">
                  <input
                    type="checkbox"
                    name="notifications"
                    checked={settings.notifications}
                    onChange={handleChange}
                  />
                  <span className="setting-text">
                    <strong>Enable notifications</strong>
                    <small>Get alerts for high-risk emails</small>
                  </span>
                </label>
              </div>

              <div className="setting-item">
                <label className="setting-label">
                  <input
                    type="checkbox"
                    name="ensembleVoting"
                    checked={settings.ensembleVoting}
                    onChange={handleChange}
                  />
                  <span className="setting-text">
                    <strong>Ensemble voting</strong>
                    <small>Use all 3 DNN models for prediction</small>
                  </span>
                </label>
              </div>

              <div className="setting-item">
                <span className="setting-text">
                  <strong>Alert threshold</strong>
                  <small>Minimum risk level for alerts</small>
                </span>
                <select
                  name="alertThreshold"
                  value={settings.alertThreshold}
                  onChange={handleChange}
                  className="threshold-select"
                >
                  <option value="LOW">LOW - All risks</option>
                  <option value="MEDIUM">MEDIUM - Medium and High</option>
                  <option value="HIGH">HIGH - High only</option>
                </select>
              </div>

              <button 
                type="submit" 
                className="btn btn-primary save-btn"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Settings'}
              </button>
            </form>
          </div>

          <div className="settings-card">
            <h2>Model Information</h2>
            <div className="model-info">
              <div className="model-info-item">
                <h3>SimpleDNN</h3>
                <p>3-layer neural network</p>
                <ul>
                  <li>Input → 256 → 128 → 64 → Output</li>
                  <li>Dropout: 0.3</li>
                  <li>Fast inference</li>
                </ul>
              </div>

              <div className="model-info-item">
                <h3>DeepDNN</h3>
                <p>5-layer with batch norm</p>
                <ul>
                  <li>512 → 256 → 128 → 64 → Output</li>
                  <li>Batch normalization</li>
                  <li>Higher accuracy</li>
                </ul>
              </div>

              <div className="model-info-item">
                <h3>WideDNN</h3>
                <p>Wide with residual connections</p>
                <ul>
                  <li>512 → 512 → 256 → 128 → Output</li>
                  <li>Residual connections</li>
                  <li>Ensemble voting</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="settings-card">
            <h2>Data & Privacy</h2>
            <div className="privacy-info">
              <p><strong>Email Access:</strong> Read-only access to your Gmail</p>
              <p><strong>Data Storage:</strong> Email metadata and predictions stored locally</p>
              <p><strong>Retention:</strong> Data kept for 30 days</p>
              <button className="btn btn-secondary export-btn">
                Export My Data
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;