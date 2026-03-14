import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import './EmailDetail.css';

const EmailDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFeatures, setShowFeatures] = useState(false);

  useEffect(() => {
    fetchEmail();
  }, [id]);

  const fetchEmail = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/gmail/email/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch email');
      }
      
      const data = await response.json();
      setEmail(data);
      
      // Mark as read
      await fetch(`http://localhost:5000/api/gmail/email/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getRiskClass = (risk) => `risk-${risk}`;
  const getAgreementClass = (agreement) => `agreement-${agreement}`;

  const formatProbability = (prob) => {
    return (prob * 100).toFixed(1) + '%';
  };

  const getTopEmotions = (emotionalFeatures) => {
    if (!emotionalFeatures) return [];
    
    const emotions = [
      { name: 'Anger', value: emotionalFeatures.anger, color: '#dc3545' },
      { name: 'Fear', value: emotionalFeatures.fear, color: '#6f42c1' },
      { name: 'Joy', value: emotionalFeatures.joy, color: '#ffc107' },
      { name: 'Sadness', value: emotionalFeatures.sadness, color: '#17a2b8' },
      { name: 'Surprise', value: emotionalFeatures.surprise, color: '#fd7e14' },
      { name: 'Trust', value: emotionalFeatures.trust, color: '#28a745' },
      { name: 'Love', value: emotionalFeatures.love, color: '#e83e8c' },
      { name: 'Optimism', value: emotionalFeatures.optimism, color: '#20c997' },
      { name: 'Pessimism', value: emotionalFeatures.pessimism, color: '#6c757d' },
      { name: 'Anticipation', value: emotionalFeatures.anticipation, color: '#0dcaf0' },
      { name: 'Disgust', value: emotionalFeatures.disgust, color: '#795548' }
    ];
    
    return emotions.sort((a, b) => b.value - a.value).slice(0, 5);
  };

  const getEmotionColor = (emotion) => {
    const colors = {
      'Anger': '#dc3545',
      'Fear': '#6f42c1',
      'Joy': '#ffc107',
      'Sadness': '#17a2b8',
      'Surprise': '#fd7e14',
      'Trust': '#28a745',
      'Love': '#e83e8c',
      'Optimism': '#20c997',
      'Pessimism': '#6c757d',
      'Anticipation': '#0dcaf0',
      'Disgust': '#795548'
    };
    return colors[emotion] || '#6a1b9a';
  };

  if (loading) return <div className="loading">Loading email...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!email) return <div className="error">Email not found</div>;

  const topEmotions = getTopEmotions(email.emotionalFeatures);

  return (
    <div className="email-detail-page">
      <nav className="navbar">
        <Link to="/dashboard" className="navbar-brand">S.E.N.T.I.N.E.L</Link>
        <div className="navbar-menu">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/settings">Settings</Link>
        </div>
      </nav>

      <div className="container">
        <button onClick={() => navigate(-1)} className="btn btn-secondary back-btn">
          ← Back to Dashboard
        </button>

        <div className="email-detail-card">
          <div className="email-header-section">
            <div className="email-title-section">
              <h1 className="email-title">{email.rawData.subject || '(No Subject)'}</h1>
              <div className={`risk-badge ${getRiskClass(email.predictions.riskLevel)}`}>
                {email.predictions.riskLevel} RISK
              </div>
            </div>
            
            <div className="email-meta-grid">
              <div className="meta-item">
                <span className="meta-label">From:</span>
                <span className="meta-value">{email.rawData.from}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">To:</span>
                <span className="meta-value">{email.rawData.to?.join(', ') || 'No recipients'}</span>
              </div>
              {email.rawData.cc?.length > 0 && (
                <div className="meta-item">
                  <span className="meta-label">CC:</span>
                  <span className="meta-value">{email.rawData.cc.join(', ')}</span>
                </div>
              )}
              <div className="meta-item">
                <span className="meta-label">Date:</span>
                <span className="meta-value">{format(new Date(email.rawData.date), 'PPP p')}</span>
              </div>
              {email.rawData.attachments?.length > 0 && (
                <div className="meta-item">
                  <span className="meta-label">Attachments:</span>
                  <span className="meta-value">{email.rawData.attachments.length} file(s)</span>
                </div>
              )}
            </div>
          </div>

          <div className="prediction-section">
            <h2>Threat Analysis Results</h2>
            
            <div className="ensemble-prediction">
              <div className="ensemble-header">
                <h3>Ensemble Prediction</h3>
                <span className={`agreement-badge ${getAgreementClass(email.ensemble?.agreement || 'ALL_AGREE_SAFE')}`}>
                  {email.ensemble?.agreement?.replace(/_/g, ' ') || 'ALL AGREE SAFE'}
                </span>
              </div>
              
              <div className="ensemble-probability">
                <div className="probability-meter">
                  <div 
                    className={`probability-fill ${getRiskClass(email.prediction.riskLevel)}`}
                    style={{ width: `${email.prediction.threatProbability * 100}%` }}
                  ></div>
                </div>
                <div className="probability-value">
                  <span className="value">{formatProbability(email.prediction.threatProbability)}</span>
                  <span className="label">Threat Probability</span>
                </div>
              </div>
            </div>

            <div className="model-predictions-grid">
              {/* Logistic Regression */}
              <div className="model-prediction-card">
                <h4>Logistic Regression</h4>
                <div className={`model-risk-indicator ${getRiskClass(email.predictions?.logisticRegression?.riskLevel || 'LOW')}`}>
                  {email.predictions?.logisticRegression?.riskLevel || 'LOW'}
                </div>
                <div className="model-probability">
                  {((email.predictions?.logisticRegression?.probability || 0) * 100).toFixed(1)}%
                </div>
                <div className="model-vote">
                  {email.predictions?.logisticRegression?.isThreat ? '⚠ Threat' : '✓ Safe'}
                </div>
              </div>

              {/* Random Forest */}
              <div className="model-prediction-card">
                <h4>Random Forest</h4>
                <div className={`model-risk-indicator ${getRiskClass(email.predictions?.randomForest?.riskLevel || 'LOW')}`}>
                  {email.predictions?.randomForest?.riskLevel || 'LOW'}
                </div>
                <div className="model-probability">
                  {((email.predictions?.randomForest?.probability || 0) * 100).toFixed(1)}%
                </div>
                <div className="model-vote">
                  {email.predictions?.randomForest?.isThreat ? '⚠ Threat' : '✓ Safe'}
                </div>
              </div>

              {/* XGBoost */}
              <div className="model-prediction-card">
                <h4>XGBoost</h4>
                <div className={`model-risk-indicator ${getRiskClass(email.predictions?.xgboost?.riskLevel || 'LOW')}`}>
                  {email.predictions?.xgboost?.riskLevel || 'LOW'}
                </div>
                <div className="model-probability">
                  {((email.predictions?.xgboost?.probability || 0) * 100).toFixed(1)}%
                </div>
                <div className="model-vote">
                  {email.predictions?.xgboost?.isThreat ? '⚠ Threat' : '✓ Safe'}
                </div>
              </div>

              {/* SimpleDNN */}
              <div className="model-prediction-card">
                <h4>SimpleDNN</h4>
                <div className={`model-risk-indicator ${getRiskClass(email.predictions?.simpleDNN?.riskLevel || 'LOW')}`}>
                  {email.predictions?.simpleDNN?.riskLevel || 'LOW'}
                </div>
                <div className="model-probability">
                  {((email.predictions?.simpleDNN?.probability || 0) * 100).toFixed(1)}%
                </div>
                <div className="model-vote">
                  {email.predictions?.simpleDNN?.isThreat ? '⚠ Threat' : '✓ Safe'}
                </div>
              </div>

              {/* DeepDNN */}
              <div className="model-prediction-card">
                <h4>DeepDNN</h4>
                <div className={`model-risk-indicator ${getRiskClass(email.predictions?.deepDNN?.riskLevel || 'LOW')}`}>
                  {email.predictions?.deepDNN?.riskLevel || 'LOW'}
                </div>
                <div className="model-probability">
                  {((email.predictions?.deepDNN?.probability || 0) * 100).toFixed(1)}%
                </div>
                <div className="model-vote">
                  {email.predictions?.deepDNN?.isThreat ? '⚠ Threat' : '✓ Safe'}
                </div>
              </div>

              {/* WideDNN */}
              <div className="model-prediction-card">
                <h4>WideDNN</h4>
                <div className={`model-risk-indicator ${getRiskClass(email.predictions?.wideDNN?.riskLevel || 'LOW')}`}>
                  {email.predictions?.wideDNN?.riskLevel || 'LOW'}
                </div>
                <div className="model-probability">
                  {((email.predictions?.wideDNN?.probability || 0) * 100).toFixed(1)}%
                </div>
                <div className="model-vote">
                  {email.predictions?.wideDNN?.isThreat ? '⚠ Threat' : '✓ Safe'}
                </div>
              </div>
            </div>

            {/* Emotional Features Section */}
            {email.emotionalFeatures && (
              <div className="emotional-features-section">
                <h3>Emotional Analysis</h3>
                
                <div className="emotional-features-grid">
                  {topEmotions.map((emotion, index) => (
                    <div key={index} className="emotional-feature-item">
                      <div className="emotion-name">{emotion.name}</div>
                      <div className="emotion-bar-container">
                        <div 
                          className="emotion-bar"
                          style={{ 
                            width: `${emotion.value * 100}%`,
                            backgroundColor: emotion.color
                          }}
                        ></div>
                      </div>
                      <div className="emotion-value">{(emotion.value * 100).toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
                
                {/* <div className="sentiment-summary">
                  <h4>Sentiment Analysis</h4>
                  <div className="sentiment-grid">
                    <div className="sentiment-item">
                      <span>VADER Compound:</span>
                      <span className={email.emotionalFeatures.vaderCompound >= 0 ? 'positive' : 'negative'}>
                        {email.emotionalFeatures.vaderCompound.toFixed(3)}
                      </span>
                    </div>
                    <div className="sentiment-item">
                      <span>Polarity:</span>
                      <span className={email.emotionalFeatures.blobPolarity >= 0 ? 'positive' : 'negative'}>
                        {email.emotionalFeatures.blobPolarity.toFixed(3)}
                      </span>
                    </div>
                    <div className="sentiment-item">
                      <span>Subjectivity:</span>
                      <span>{email.emotionalFeatures.blobSubjectivity.toFixed(3)}</span>
                    </div>
                  </div>
                  
                  <div className="sentiment-breakdown">
                    <div className="sentiment-bar-container">
                      <div className="sentiment-bar-label">Negative</div>
                      <div className="sentiment-bar-track">
                        <div 
                          className="sentiment-bar negative-bar"
                          style={{ width: `${email.emotionalFeatures.vaderNeg * 100}%` }}
                        ></div>
                      </div>
                      <div className="sentiment-bar-value">{(email.emotionalFeatures.vaderNeg * 100).toFixed(1)}%</div>
                    </div>
                    <div className="sentiment-bar-container">
                      <div className="sentiment-bar-label">Neutral</div>
                      <div className="sentiment-bar-track">
                        <div 
                          className="sentiment-bar neutral-bar"
                          style={{ width: `${email.emotionalFeatures.vaderNeu * 100}%` }}
                        ></div>
                      </div>
                      <div className="sentiment-bar-value">{(email.emotionalFeatures.vaderNeu * 100).toFixed(1)}%</div>
                    </div>
                    <div className="sentiment-bar-container">
                      <div className="sentiment-bar-label">Positive</div>
                      <div className="sentiment-bar-track">
                        <div 
                          className="sentiment-bar positive-bar"
                          style={{ width: `${email.emotionalFeatures.vaderPos * 100}%` }}
                        ></div>
                      </div>
                      <div className="sentiment-bar-value">{(email.emotionalFeatures.vaderPos * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                </div> */}

                {/* Sentiment Analysis Section */}
                <div className="sentiment-summary">
                  <h4>Sentiment Analysis</h4>
                  
                  {/* Metrics Grid - Fixed layout */}
                  <div className="sentiment-metrics-grid">
                    <div className="metric-item">
                      <span className="metric-label">VADER Compound</span>
                      <span className={`metric-value ${email.emotionalFeatures.vaderCompound >= 0 ? 'positive' : 'negative'}`}>
                        {email.emotionalFeatures.vaderCompound.toFixed(3)}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Polarity</span>
                      <span className={`metric-value ${email.emotionalFeatures.blobPolarity >= 0 ? 'positive' : 'negative'}`}>
                        {email.emotionalFeatures.blobPolarity.toFixed(3)}
                      </span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Subjectivity</span>
                      <span className="metric-value">
                        {email.emotionalFeatures.blobSubjectivity.toFixed(3)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Sentiment Breakdown - Fixed table layout */}
                  <div className="sentiment-breakdown">
                    {/* Negative Row */}
                    <div className="sentiment-row">
                      <span className="sentiment-label negative">Negative</span>
                      <div className="sentiment-bar-track">
                        <div 
                          className="sentiment-bar negative-bar"
                          style={{ width: `${email.emotionalFeatures.vaderNeg * 100}%` }}
                        ></div>
                      </div>
                      <span className="sentiment-percentage">{(email.emotionalFeatures.vaderNeg * 100).toFixed(1)}%</span>
                      <span className="sentiment-value">{email.emotionalFeatures.vaderNeg.toFixed(3)}</span>
                    </div>
                    
                    {/* Neutral Row */}
                    <div className="sentiment-row">
                      <span className="sentiment-label neutral">Neutral</span>
                      <div className="sentiment-bar-track">
                        <div 
                          className="sentiment-bar neutral-bar"
                          style={{ width: `${email.emotionalFeatures.vaderNeu * 100}%` }}
                        ></div>
                      </div>
                      <span className="sentiment-percentage">{(email.emotionalFeatures.vaderNeu * 100).toFixed(1)}%</span>
                      <span className="sentiment-value">{email.emotionalFeatures.vaderNeu.toFixed(3)}</span>
                    </div>
                    
                    {/* Positive Row */}
                    <div className="sentiment-row">
                      <span className="sentiment-label positive">Positive</span>
                      <div className="sentiment-bar-track">
                        <div 
                          className="sentiment-bar positive-bar"
                          style={{ width: `${email.emotionalFeatures.vaderPos * 100}%` }}
                        ></div>
                      </div>
                      <span className="sentiment-percentage">{(email.emotionalFeatures.vaderPos * 100).toFixed(1)}%</span>
                      <span className="sentiment-value">{email.emotionalFeatures.vaderPos.toFixed(3)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="email-content-section">
            <h2>Email Content</h2>
            <div className="email-body">
              {email.rawData.body ? (
                <pre>{email.rawData.body}</pre>
              ) : (
                <p className="no-content">No email body available</p>
              )}
            </div>
          </div>

          <div className="features-section">
            <button 
              className="btn btn-secondary toggle-features"
              onClick={() => setShowFeatures(!showFeatures)}
            >
              {showFeatures ? 'Hide' : 'Show'} Extracted Features
            </button>
            
            {showFeatures && email.features && (
              <div className="features-grid">
                <div className="feature-category">
                  <h4>Recipient Features</h4>
                  <table className="feature-table">
                    <tbody>
                      <tr><td>To Count</td><td>{email.features.toCount}</td></tr>
                      <tr><td>CC Count</td><td>{email.features.ccCount}</td></tr>
                      <tr><td>Total Recipients</td><td>{email.features.totalRecipients}</td></tr>
                      <tr><td>External To</td><td>{email.features.externalTo}</td></tr>
                      <tr><td>External CC</td><td>{email.features.externalCc}</td></tr>
                      <tr><td>External Ratio</td><td>{(email.features.externalRatio * 100).toFixed(1)}%</td></tr>
                    </tbody>
                  </table>
                </div>

                <div className="feature-category">
                  <h4>Temporal Features</h4>
                  <table className="feature-table">
                    <tbody>
                      <tr><td>Hour</td><td>{email.features.hour}:{email.features.minute}</td></tr>
                      <tr><td>Day of Week</td><td>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][email.features.dayOfWeek]}</td></tr>
                      <tr><td>Month</td><td>{email.features.month}</td></tr>
                      <tr><td>Work Hour</td><td>{email.features.isWorkHour ? 'Yes' : 'No'}</td></tr>
                      <tr><td>After Hours</td><td>{email.features.isAfterHours ? 'Yes' : 'No'}</td></tr>
                      <tr><td>Weekend</td><td>{email.features.isWeekend ? 'Yes' : 'No'}</td></tr>
                    </tbody>
                  </table>
                </div>

                <div className="feature-category">
                  <h4>Attachment Features</h4>
                  <table className="feature-table">
                    <tbody>
                      <tr><td>Count</td><td>{email.features.attachmentCount}</td></tr>
                      <tr><td>Has Attachment</td><td>{email.features.hasAttachment ? 'Yes' : 'No'}</td></tr>
                      <tr><td>Size</td><td>{email.features.sizeKb.toFixed(1)} KB</td></tr>
                      <tr><td>Size (log)</td><td>{email.features.sizeLog.toFixed(2)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailDetail;