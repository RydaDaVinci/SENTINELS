const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const axios = require('axios');

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Track email processing status for each user
// const emailProcessingStatus = new Map();

// =============================================
// GOOGLE OAUTH SETUP
// =============================================

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:5000/api/auth/google/callback';

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// =============================================
// IN-MEMORY DATABASE (starts empty)
// =============================================

const users = [];
const emails = [];
let emailId = 1;

// =============================================
// FEATURE EXTRACTION FUNCTION
// =============================================

const extractBasicFeatures = (emailData) => {
  const toList = emailData.to || [];
  const ccList = emailData.cc || [];
  
  const externalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
  
  const externalTo = toList.filter(email => 
    externalDomains.some(domain => email.includes(domain))
  ).length;
  
  const externalCc = ccList.filter(email => 
    externalDomains.some(domain => email.includes(domain))
  ).length;
  
  const totalRecipients = toList.length + ccList.length;
  const date = new Date(emailData.date);
  const hour = date.getHours();
  const dayOfWeek = date.getDay();
  const attachmentCount = emailData.attachments?.length || 0;
  
  const sizeInBytes = emailData.size || 0;
  const sizeKb = sizeInBytes / 1024;
  const sizeLog = Math.log1p(sizeKb);
  
  return {
    toCount: toList.length,
    ccCount: ccList.length,
    totalRecipients: totalRecipients,
    externalTo: externalTo,
    externalCc: externalCc,
    externalRatio: totalRecipients > 0 ? (externalTo + externalCc) / totalRecipients : 0,
    hour: hour,
    minute: date.getMinutes(),
    dayOfWeek: dayOfWeek,
    month: date.getMonth() + 1,
    isWorkHour: hour >= 8 && hour <= 18 ? 1 : 0,
    isAfterHours: hour < 8 || hour > 18 ? 1 : 0,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0,
    attachmentCount: attachmentCount,
    hasAttachment: attachmentCount > 0 ? 1 : 0,
    sizeKb: sizeKb,
    size: sizeKb,
    sizeLog: sizeLog,
    isSend: 0
  };
};

const emailProcessingStatus = new Map(); 

// =============================================
// CALL ML SERVICE
// =============================================

// In backend/server.js - Update the getPredictions function

const getPredictions = async (basicFeatures, emailContent) => {
  try {
    const response = await axios.post('http://127.0.0.1:5001/predict-all', {
      content: emailContent,
      // Removed 'size' parameter
      attachmentCount: basicFeatures.attachmentCount || 0,
      toCount: basicFeatures.toCount || 0,
      ccCount: basicFeatures.ccCount || 0,
      totalRecipients: basicFeatures.totalRecipients || 0,
      externalTo: basicFeatures.externalTo || 0,
      externalCc: basicFeatures.externalCc || 0,
      externalRatio: basicFeatures.externalRatio || 0,
      hour: basicFeatures.hour || 12,
      minute: basicFeatures.minute || 0,
      dayOfWeek: basicFeatures.dayOfWeek || 0,
      month: basicFeatures.month || 1,
      isWorkHour: basicFeatures.isWorkHour || 1,
      isAfterHours: basicFeatures.isAfterHours || 0,
      isWeekend: basicFeatures.isWeekend || 0,
      hasAttachment: basicFeatures.hasAttachment || 0,
      sizeKb: basicFeatures.sizeKb || 0,
      sizeLog: basicFeatures.sizeLog || 0,
      isSend: basicFeatures.isSend || 0
    });
    
    return response.data;
  } catch (error) {
    console.error('ML service error:', error.message);
    // Return fallback structure
    return {
      predictions: {
        logisticRegression: { probability: 0, isThreat: false, riskLevel: 'LOW' },
        randomForest: { probability: 0, isThreat: false, riskLevel: 'LOW' },
        xgboost: { probability: 0, isThreat: false, riskLevel: 'LOW' },
        simpleDNN: { probability: 0, isThreat: false, riskLevel: 'LOW' },
        deepDNN: { probability: 0, isThreat: false, riskLevel: 'LOW' },
        wideDNN: { probability: 0, isThreat: false, riskLevel: 'LOW' }
      },
      emotionalFeatures: {
        anger: 0, fear: 0, joy: 0, sadness: 0, surprise: 0,
        vaderCompound: 0, blobPolarity: 0, blobSubjectivity: 0.5
      }
    };
  }
};

// =============================================
// FETCH REAL EMAILS FROM GMAIL WITH ML PROCESSING
// =============================================

const fetchGmailEmails = async (accessToken, userId) => {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  
  const gmail = google.gmail({ version: 'v1', auth });
  
  // Update processing status
  emailProcessingStatus.set(userId, { 
    status: 'processing', 
    count: 0,
    total: 20,
    message: 'Connecting to Gmail...'
  });
  
  try {
    console.log(`📧 Fetching emails for user ${userId}...`);
    
    // Get list of recent emails (last 10 days)
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 20,
      q: 'newer_than:10d'
    });
    
    const messages = response.data.messages || [];
    const totalMessages = Math.min(messages.length, 20);;
    
    console.log(`📊 Found ${totalMessages} emails to process`);
    
    // Update status with total
    emailProcessingStatus.set(userId, { 
      status: 'processing', 
      count: 0,
      total: totalMessages,
      message: `Found ${totalMessages} emails to analyze...`
    });
    
    const newEmails = [];
    let processedCount = 0;

    // Only process up to 20 emails
    const messagesToProcess = messages.slice(0, 20);
    
    for (const message of messagesToProcess) {
      // Check if email already exists
      const existing = emails.find(e => e.gmailId === message.id);
      if (existing) {
        processedCount++;
        continue;
      }
      
      // Update status
      emailProcessingStatus.set(userId, { 
        status: 'processing', 
        count: processedCount,
        total: totalMessages,
        message: `Fetching email ${processedCount + 1} of ${totalMessages}...`
      });
      
      // Get full email details
      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full'
      });
      
      const msg = fullMessage.data;
      
      // Parse headers
      const headers = msg.payload.headers.reduce((acc, header) => {
        acc[header.name.toLowerCase()] = header.value;
        return acc;
      }, {});
      
      // Get email body
      let body = '';
      if (msg.payload.parts) {
        const textPart = msg.payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart && textPart.body.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
        }
      } else if (msg.payload.body.data) {
        body = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8');
      }
      
      // Get attachments
      const attachments = [];
      if (msg.payload.parts) {
        for (const part of msg.payload.parts) {
          if (part.filename && part.filename.length > 0) {
            attachments.push({
              filename: part.filename,
              size: part.body.size,
              mimeType: part.mimeType,
              attachmentId: part.body.attachmentId
            });
          }
        }
      }
      
      // Create email data object
      const emailData = {
        from: headers.from,
        to: headers.to ? headers.to.split(',').map(s => s.trim()) : [],
        cc: headers.cc ? headers.cc.split(',').map(s => s.trim()) : [],
        subject: headers.subject || '(No subject)',
        body: body,
        snippet: msg.snippet,
        date: new Date(parseInt(msg.internalDate)),
        size: msg.sizeEstimate,
        attachments
      };
      
      // Update status
      emailProcessingStatus.set(userId, { 
        status: 'processing', 
        count: processedCount,
        total: totalMessages,
        message: `Extracting features from email ${processedCount + 1}...`
      });
      
      // Extract basic features
      const basicFeatures = extractBasicFeatures(emailData);
      
      // Update status
      emailProcessingStatus.set(userId, { 
        status: 'processing', 
        count: processedCount,
        total: totalMessages,
        message: `Running ML models on email ${processedCount + 1}...`
      });
      
      // Get predictions from ML service
      let mlResults;
      try {
        mlResults = await getPredictions(basicFeatures, body);
      } catch (mlError) {
        console.error(`ML service error for email ${message.id}:`, mlError);
        // Provide fallback predictions
        mlResults = {
          predictions: {
            logisticRegression: { probability: 0, isThreat: false, riskLevel: 'LOW' },
            randomForest: { probability: 0, isThreat: false, riskLevel: 'LOW' },
            xgboost: { probability: 0, isThreat: false, riskLevel: 'LOW' },
            simpleDNN: { probability: 0, isThreat: false, riskLevel: 'LOW' },
            deepDNN: { probability: 0, isThreat: false, riskLevel: 'LOW' },
            wideDNN: { probability: 0, isThreat: false, riskLevel: 'LOW' }
          },
          emotionalFeatures: {
            anger: 0, fear: 0, joy: 0, sadness: 0, surprise: 0,
            vaderCompound: 0, blobPolarity: 0, blobSubjectivity: 0.5
          }
        };
      }
      
      // Calculate ensemble probability (average of all models)
      const modelProbs = [
        mlResults.predictions.logisticRegression?.probability || 0,
        mlResults.predictions.randomForest?.probability || 0,
        mlResults.predictions.xgboost?.probability || 0,
        mlResults.predictions.simpleDNN?.probability || 0,
        mlResults.predictions.deepDNN?.probability || 0,
        mlResults.predictions.wideDNN?.probability || 0
      ];
      
      const ensembleProb = modelProbs.reduce((a, b) => a + b, 0) / modelProbs.length;
      const ensembleIsThreat = ensembleProb > 0.35; // Lower threshold for better recall
      const ensembleRiskLevel = ensembleProb > 0.7 ? 'HIGH' : 
                                ensembleProb > 0.35 ? 'MEDIUM' : 'LOW';
      
      // Count how many models agree
      const threatVotes = modelProbs.filter(p => p > 0.5).length;
      let agreement = 'SPLIT';
      if (threatVotes === 0) agreement = 'ALL_AGREE_SAFE';
      else if (threatVotes === 6) agreement = 'ALL_AGREE_THREAT';
      else if (threatVotes >= 4) agreement = 'MAJORITY_THREAT';
      else if (threatVotes <= 2) agreement = 'MAJORITY_SAFE';
      
      // Create complete email object
      const email = {
        id: String(emailId++),
        gmailId: message.id,
        threadId: msg.threadId,
        userId: userId,
        rawData: emailData,
        features: basicFeatures,
        emotionalFeatures: mlResults.emotionalFeatures || {
          anger: 0, fear: 0, joy: 0, sadness: 0, surprise: 0,
          vaderCompound: 0, blobPolarity: 0, blobSubjectivity: 0.5
        },
        predictions: mlResults.predictions || {},
        prediction: {
          riskLevel: ensembleRiskLevel,
          threatProbability: ensembleProb,
          isThreat: ensembleIsThreat
        },
        ensemble: {
          probability: ensembleProb,
          isThreat: ensembleIsThreat,
          riskLevel: ensembleRiskLevel,
          agreement: agreement
        },
        isRead: false,
        isAnalyzed: true,
        createdAt: new Date()
      };
      
      emails.push(email);
      newEmails.push(email);
      processedCount++;
      
      // Update status
      emailProcessingStatus.set(userId, { 
        status: 'processing', 
        count: processedCount,
        total: 20,
        message: `Processed ${processedCount} of ${totalMessages} emails`
      });
      
      // Emit real-time alert if high risk
      if (ensembleRiskLevel === 'HIGH') {
        io.emit('threat-detected', {
          userId: userId,
          email: {
            id: email.id,
            subject: email.rawData.subject,
            from: email.rawData.from,
            riskLevel: ensembleRiskLevel,
            probability: ensembleProb,
            models: {
              lr: mlResults.predictions.logisticRegression?.isThreat || false,
              rf: mlResults.predictions.randomForest?.isThreat || false,
              xgb: mlResults.predictions.xgboost?.isThreat || false,
              simple: mlResults.predictions.simpleDNN?.isThreat || false,
              deep: mlResults.predictions.deepDNN?.isThreat || false,
              wide: mlResults.predictions.wideDNN?.isThreat || false
            }
          }
        });
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Mark as complete
    emailProcessingStatus.set(userId, { 
      status: 'complete', 
      count: 20,
      total: 20,
      message: `Successfully processed ${processedCount} emails`
    });
    
    console.log(`✅ Successfully processed ${processedCount} new emails for user ${userId}`);
    return newEmails;
    
  } catch (error) {
    console.error('❌ Error fetching Gmail:', error);
    
    // Mark as error
    emailProcessingStatus.set(userId, { 
      status: 'error', 
      error: error.message,
      message: 'Error fetching emails: ' + error.message
    });
    
    throw error;
  }
};

// Add email status endpoint for loading screen
app.get('/api/email-status', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const status = emailProcessingStatus.get(decoded.userId) || { 
      status: 'unknown', 
      count: 0, 
      total: 20,
      message: 'Waiting to start...' 
    };
    res.json(status);
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// =============================================
// AUTH ROUTES
// =============================================

app.get('/api/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ],
    prompt: 'consent'
  });
  res.redirect(url);
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.redirect(`${process.env.CLIENT_URL}/auth-error?message=No code received`);
  }
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    let user = users.find(u => u.googleId === userInfo.data.id);
    
    if (!user) {
      user = {
        id: String(users.length + 1),
        googleId: userInfo.data.id,
        email: userInfo.data.email,
        name: userInfo.data.name,
        picture: userInfo.data.picture,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        settings: {
          autoScan: true,
          alertThreshold: 'MEDIUM',
          notifications: true,
          ensembleVoting: true
        }
      };
      users.push(user);
    } else {
      user.accessToken = tokens.access_token;
      user.refreshToken = tokens.refresh_token || user.refreshToken;
    }
    
    const appToken = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Start fetching emails (but don't await)
    fetchGmailEmails(tokens.access_token, user.id).catch(console.error);
    
    // Redirect to a loading page instead of auth-success
    res.redirect(`${process.env.CLIENT_URL}/loading?token=${appToken}`);
    
  } catch (error) {
    console.error('Auth error:', error);
    res.redirect(`${process.env.CLIENT_URL}/auth-error?message=${error.message}`);
  }
});

app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = users.find(u => u.id === decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      picture: user.picture,
      settings: user.settings
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// =============================================
// GMAIL ROUTES
// =============================================

app.get('/api/gmail/status', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = users.find(u => u.id === decoded.userId);
    
    res.json({
      connected: !!user?.accessToken,
      email: user?.email || '',
      name: user?.name || '',
      picture: user?.picture || '',
      settings: user?.settings || {}
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/gmail/recent', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userEmails = emails
      .filter(e => e.userId === decoded.userId)
      .sort((a, b) => b.createdAt - a.createdAt);
    
    res.json(userEmails);
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/gmail/email/:id', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = emails.find(e => e.id === req.params.id && e.userId === decoded.userId);
    
    if (!email) return res.status(404).json({ error: 'Email not found' });
    
    res.json(email);
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.patch('/api/gmail/email/:id/read', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = emails.find(e => e.id === req.params.id && e.userId === decoded.userId);
    if (email) email.isRead = true;
    
    res.json({ success: true });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/gmail/stats', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userEmails = emails.filter(e => e.userId === decoded.userId);
    
    const total = userEmails.length;
    const threats = userEmails.filter(e => e.prediction.isThreat).length;
    const riskLevels = {
      LOW: userEmails.filter(e => e.prediction.riskLevel === 'LOW').length,
      MEDIUM: userEmails.filter(e => e.prediction.riskLevel === 'MEDIUM').length,
      HIGH: userEmails.filter(e => e.prediction.riskLevel === 'HIGH').length
    };
    
    res.json({ total, analyzed: total, threats, riskLevels });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.post('/api/gmail/fetch', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = users.find(u => u.id === decoded.userId);
    
    if (!user?.accessToken) {
      return res.status(400).json({ error: 'No Gmail access token' });
    }
    
    const newEmails = await fetchGmailEmails(user.accessToken, user.id);
    res.json({ message: `Fetched ${newEmails.length} new emails`, count: newEmails.length });
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// =============================================
// EMAIL ROUTES
// =============================================

app.get('/api/emails/alerts', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const alerts = emails
      .filter(e => e.userId === decoded.userId && e.prediction.riskLevel === 'HIGH' && !e.isRead)
      .slice(0, 10)
      .map(e => ({
        id: e.id,
        subject: e.rawData.subject,
        from: e.rawData.from,
        riskLevel: e.prediction.riskLevel,
        probability: e.prediction.threatProbability
      }));
    
    res.json(alerts);
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// =============================================
// START SERVER
// =============================================
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`\n Server running on port ${PORT}`);
  console.log(` Frontend URL: ${process.env.CLIENT_URL}`);
  console.log(` No mock data - waiting for real Gmail emails\n`);
});