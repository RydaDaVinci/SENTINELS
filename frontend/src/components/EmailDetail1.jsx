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

  if (loading) return <div className="loading">Loading email...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!email) return <div className="error">Email not found</div>;

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
              <div className={`risk-badge ${getRiskClass(email.prediction.riskLevel)}`}>
                {email.prediction.riskLevel} RISK
              </div>
            </div>
            
            <div className="email-meta-grid">
              <div className="meta-item">
                <span className="meta-label">From:</span>
                <span className="meta-value">{email.rawData.from}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">To:</span>
                <span className="meta-value">{email.rawData.to.join(', ')}</span>
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
                <span className={`agreement-badge ${getAgreementClass(email.predictions?.ensemble?.agreement || 'ALL_AGREE_SAFE')}`}>
                  {email.predictions?.ensemble?.agreement?.replace(/_/g, ' ') || 'ALL AGREE SAFE'}
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

                <div className="feature-category">
                  <h4>Emotional Features</h4>
                  <table className="feature-table">
                    <tbody>
                      <tr><td>Fear</td><td>{email.features.fear?.toFixed(3) || '0.000'}</td></tr>
                      <tr><td>Anger</td><td>{email.features.anger?.toFixed(3) || '0.000'}</td></tr>
                      <tr><td>Joy</td><td>{email.features.joy?.toFixed(3) || '0.000'}</td></tr>
                      <tr><td>VADER Compound</td><td>{email.features.vaderCompound?.toFixed(3) || '0.000'}</td></tr>
                      <tr><td>Blob Polarity</td><td>{email.features.blobPolarity?.toFixed(3) || '0.000'}</td></tr>
                      <tr><td>Blob Subjectivity</td><td>{email.features.blobSubjectivity?.toFixed(3) || '0.500'}</td></tr>
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