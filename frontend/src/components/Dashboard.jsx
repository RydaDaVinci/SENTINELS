import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { formatDistance } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import './Dashboard.css';

const Dashboard = ({ user, setUser }) => {
  console.log('🔥 Dashboard rendering', { user });
  
  const navigate = useNavigate();
  const [emails, setEmails] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Connecting to Gmail...');
  const [alerts, setAlerts] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/');
      return;
    }
    
    // Simulate loading progress
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev < 90) return prev + 1;
        return prev;
      });
    }, 100);

    fetchData(token);

    // Setup WebSocket
    const newSocket = io('http://localhost:5000');
    setSocket(newSocket);

    newSocket.on('threat-detected', (data) => {
      setAlerts(prev => [data.email, ...prev].slice(0, 5));
      fetchData(token); // Refresh data
    });

    return () => {
      newSocket.close();
      clearInterval(progressInterval);
    };
  }, []);

  const fetchData = async (token) => {
    setLoading(true);
    setLoadingMessage('Fetching your emails from Gmail...');

    try {
      setLoadingMessage('Analyzing email content...');
      setLoadingProgress(30);
      
      const [emailsRes, statsRes, alertsRes] = await Promise.all([
        fetch('http://localhost:5000/api/gmail/recent', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('http://localhost:5000/api/gmail/stats', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('http://localhost:5000/api/emails/alerts', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setLoadingProgress(60);
      setLoadingMessage('Running threat detection models...');

      const emailsData = await emailsRes.json();
      const statsData = await statsRes.json();
      const alertsData = await alertsRes.json();

      setLoadingProgress(90);
      setLoadingMessage('Finalizing results...');

      setEmails(emailsData);
      setStats(statsData);
      setAlerts(alertsData);

      setLoadingProgress(100);

      setTimeout(() => {
        setLoading(false);
      }, 500);
      
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoadingMessage('Error loading emails. Please try again.');
      setTimeout(() => {
        setLoading(false);
      }, 2000);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    navigate('/');
  };

  const handleManualFetch = async () => {
    setFetching(true);
    setLoadingMessage('Scanning for new emails...');
    try {
      const token = localStorage.getItem('token');
      await fetch('http://localhost:5000/api/gmail/fetch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchData(token);
    } catch (error) {
      console.error('Error fetching emails:', error);
    } finally {
      setFetching(false);
    }
  };

  const getRiskClass = (risk) => `risk-${risk}`;

  const pieData = stats ? [
    { name: 'LOW', value: stats.riskLevels.LOW || 0 },
    { name: 'MEDIUM', value: stats.riskLevels.MEDIUM || 0 },
    { name: 'HIGH', value: stats.riskLevels.HIGH || 0 }
  ] : [];

  const COLORS = ['#28a745', '#ffc107', '#dc3545'];

  const EmailSkeleton = () => (
    <div className="email-item skeleton">
      <div className="email-header">
        <div className="skeleton-line" style={{ width: '60%' }}></div>
        <div className="skeleton-badge" style={{ width: '60px' }}></div>
      </div>
      <div className="email-details">
        <div className="skeleton-line" style={{ width: '40%' }}></div>
        <div className="skeleton-line" style={{ width: '30%' }}></div>
      </div>
      <div className="model-votes">
        <div className="skeleton-vote"></div>
        <div className="skeleton-vote"></div>
        <div className="skeleton-vote"></div>
      </div>
    </div>
  );

  // LOADING STATE
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-spinner-large"></div>
          <h2 className="loading-title">S.E.N.T.I.N.E.L</h2>
          <p className="loading-message">{loadingMessage}</p>
          
          <div className="loading-progress-container">
            <div 
              className="loading-progress-bar" 
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
          
          <div className="loading-steps">
            <div className={`loading-step ${loadingProgress >= 25 ? 'completed' : ''}`}>
              <div className="step-indicator">1</div>
              <span>Connecting to Gmail</span>
            </div>
            <div className={`loading-step ${loadingProgress >= 50 ? 'completed' : ''}`}>
              <div className="step-indicator">2</div>
              <span>Fetching emails</span>
            </div>
            <div className={`loading-step ${loadingProgress >= 75 ? 'completed' : ''}`}>
              <div className="step-indicator">3</div>
              <span>Analyzing threats</span>
            </div>
            <div className={`loading-step ${loadingProgress >= 100 ? 'completed' : ''}`}>
              <div className="step-indicator">4</div>
              <span>Finalizing</span>
            </div>
          </div>
          
          <p className="loading-percentage">{loadingProgress}%</p>
        </div>
      </div>
    );
  }

  // MAIN DASHBOARD RENDER
  return (
    <div className="dashboard">
      <nav className="navbar">
        <Link to="/dashboard" className="navbar-brand">S.E.N.T.I.N.E.L</Link>
        <div className="navbar-menu">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/settings">Settings</Link>
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
        {alerts.length > 0 && (
          <div className="alerts-section">
            <h2>🚨 Recent Alerts</h2>
            <div className="alerts-list">
              {alerts.map(alert => (
                <Link to={`/email/${alert.id}`} key={alert.id} className="alert-item">
                  <span className={`alert-risk ${getRiskClass(alert.riskLevel)}`}>
                    {alert.riskLevel}
                  </span>
                  <span className="alert-subject">{alert.subject}</span>
                  <span className="alert-from">{alert.from}</span>
                  <span className="alert-prob">
                    {(alert.probability * 100).toFixed(1)}%
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="stats-section">
          <h2>Statistics</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Total Emails</h3>
              <p className="stat-number">{stats?.total || 0}</p>
            </div>
            <div className="stat-card">
              <h3>Analyzed</h3>
              <p className="stat-number">{stats?.analyzed || 0}</p>
            </div>
            <div className="stat-card">
              <h3>Threats</h3>
              <p className="stat-number">{stats?.threats || 0}</p>
            </div>
          </div>

          <div className="charts">
            <div className="chart">
              <h3>Risk Distribution</h3>
              <PieChart width={300} height={300}>
                <Pie
                  data={pieData}
                  cx={150}
                  cy={150}
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </div>

            {stats?.agreements && (
              <div className="chart">
                <h3>Model Agreement</h3>
                <BarChart width={400} height={300} data={[
                  { name: 'All Agree', value: stats.agreements.ALL_AGREE_SAFE + stats.agreements.ALL_AGREE_THREAT || 0 },
                  { name: 'Majority', value: stats.agreements.MAJORITY_SAFE + stats.agreements.MAJORITY_THREAT || 0 },
                  { name: 'Split', value: stats.agreements.SPLIT || 0 }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#6a1b9a" />
                </BarChart>
              </div>
            )}
          </div>
        </div>

        <div className="emails-section">
          <div className="section-header">
            <h2>Recent Emails</h2>
            <button onClick={handleManualFetch} className="btn btn-primary">
              Scan Now
            </button>
          </div>
          
          <div className="email-list">
            {emails.length === 0 ? (
              <div className="no-emails">
                <p>No emails found. Click "Scan Now" to fetch your emails.</p>
              </div>
            ) : (
              emails.map(email => (
                <Link to={`/email/${email.id}`} key={email.id} className="email-item">
                  <div className="email-header">
                    <span className="email-subject">{email.rawData.subject}</span>
                    <span className={`email-risk ${getRiskClass(email.prediction.riskLevel)}`}>
                      {email.prediction.riskLevel}
                    </span>
                  </div>
                  <div className="email-details">
                    <span className="email-from">From: {email.rawData.from}</span>
                    <span className="email-date">
                      {formatDistance(new Date(email.rawData.date), new Date(), { addSuffix: true })}
                    </span>
                  </div>
                  {email.predictions && (
                    <div className="model-votes">
                      <span className={`vote ${email.predictions.logisticRegression?.isThreat ? 'threat' : 'safe'}`}>
                        LR:{email.predictions.logisticRegression?.isThreat ? '⚠' : '✓'}
                      </span>
                      <span className={`vote ${email.predictions.randomForest?.isThreat ? 'threat' : 'safe'}`}>
                        RF:{email.predictions.randomForest?.isThreat ? '⚠' : '✓'}
                      </span>
                      <span className={`vote ${email.predictions.xgboost?.isThreat ? 'threat' : 'safe'}`}>
                        XGB:{email.predictions.xgboost?.isThreat ? '⚠' : '✓'}
                      </span>
                      <span className={`vote ${email.predictions.simpleDNN?.isThreat ? 'threat' : 'safe'}`}>
                        S3:{email.predictions.simpleDNN?.isThreat ? '⚠' : '✓'}
                      </span>
                      <span className={`vote ${email.predictions.deepDNN?.isThreat ? 'threat' : 'safe'}`}>
                        D3:{email.predictions.deepDNN?.isThreat ? '⚠' : '✓'}
                      </span>
                      <span className={`vote ${email.predictions.wideDNN?.isThreat ? 'threat' : 'safe'}`}>
                        W3:{email.predictions.wideDNN?.isThreat ? '⚠' : '✓'}
                      </span>
                    </div>
                  )}
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;