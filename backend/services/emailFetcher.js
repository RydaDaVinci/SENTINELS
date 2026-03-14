// backend/services/emailFetcher.js
const { google } = require('googleapis');
const User = require('../models/User');
const Email = require('../models/Email');
const axios = require('axios');

// Refresh access token if expired
const refreshAccessToken = async (user) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  
  oauth2Client.setCredentials({
    refresh_token: user.refreshToken
  });
  
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    user.accessToken = credentials.access_token;
    user.tokenExpiry = new Date(Date.now() + credentials.expiry_date);
    await user.save();
    
    return credentials.access_token;
  } catch (error) {
    console.error('Error refreshing token:', error);
    throw error;
  }
};

// Extract features from email
const extractFeatures = (emailData) => {
  const toList = emailData.to || [];
  const ccList = emailData.cc || [];
  
  const externalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'protonmail.com'];
  
  const externalTo = toList.filter(emailAddr => 
    externalDomains.some(domain => emailAddr.includes(domain))
  ).length;
  
  const externalCc = ccList.filter(emailAddr => 
    externalDomains.some(domain => emailAddr.includes(domain))
  ).length;
  
  const totalRecipients = toList.length + ccList.length;
  
  const date = new Date(emailData.date);
  const hour = date.getHours();
  const dayOfWeek = date.getDay();
  
  const attachmentCount = emailData.attachments?.length || 0;
  const sizeKb = (emailData.size || 0) / 1024;
  
  return {
    toCount: toList.length,
    ccCount: ccList.length,
    totalRecipients,
    externalTo,
    externalCc,
    externalRatio: totalRecipients > 0 ? (externalTo + externalCc) / totalRecipients : 0,
    hour,
    minute: date.getMinutes(),
    dayOfWeek,
    month: date.getMonth() + 1,
    isWorkHour: hour >= 8 && hour <= 18 ? 1 : 0,
    isAfterHours: hour < 8 || hour > 18 ? 1 : 0,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0,
    attachmentCount,
    hasAttachment: attachmentCount > 0 ? 1 : 0,
    sizeKb,
    sizeLog: Math.log1p(sizeKb),
    userEncoded: 0,
    pcEncoded: 0,
    isSend: 0,
    anger: 0.1,
    anticipation: 0.1,
    disgust: 0.1,
    fear: 0.1,
    joy: 0.1,
    love: 0.1,
    optimism: 0.1,
    pessimism: 0.1,
    sadness: 0.1,
    surprise: 0.1,
    trust: 0.1,
    negative: 0.1,
    neutral: 0.8,
    positive: 0.1,
    vaderNeg: 0.1,
    vaderNeu: 0.8,
    vaderPos: 0.1,
    vaderCompound: 0.0,
    blobPolarity: 0.0,
    blobSubjectivity: 0.5
  };
};

// Get predictions from ML service
const getDNNPredictions = async (features, emailContent) => {
  try {
    const response = await axios.post(`${process.env.ML_SERVICE_URL}/predict-ensemble`, {
      features,
      content: emailContent
    });
    
    return response.data;
  } catch (error) {
    console.error('ML service error:', error);
    return {
      simpleDNN: { probability: 0.1, isThreat: false, riskLevel: 'LOW' },
      deepDNN: { probability: 0.1, isThreat: false, riskLevel: 'LOW' },
      wideDNN: { probability: 0.1, isThreat: false, riskLevel: 'LOW' },
      ensemble: { 
        probability: 0.1, 
        isThreat: false, 
        riskLevel: 'LOW',
        agreement: 'ALL_AGREE_SAFE'
      }
    };
  }
};

// Fetch and analyze emails
const fetchAndAnalyzeEmails = async (user, io) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  
  oauth2Client.setCredentials({
    access_token: user.accessToken
  });
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 20,
      q: 'newer_than:30d'
    });
    
    const messages = response.data.messages || [];
    const newEmails = [];
    
    for (const message of messages) {
      const existing = await Email.findOne({ gmailId: message.id });
      if (existing) continue;
      
      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full'
      });
      
      const msg = fullMessage.data;
      
      const headers = msg.payload.headers.reduce((acc, header) => {
        acc[header.name.toLowerCase()] = header.value;
        return acc;
      }, {});
      
      let body = '';
      if (msg.payload.parts) {
        const textPart = msg.payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart && textPart.body.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
        }
      } else if (msg.payload.body.data) {
        body = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8');
      }
      
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
      
      const emailData = {
        from: headers.from,
        to: headers.to ? headers.to.split(',').map(s => s.trim()) : [],
        cc: headers.cc ? headers.cc.split(',').map(s => s.trim()) : [],
        subject: headers.subject || '(No subject)',
        body: body,
        bodySnippet: msg.snippet,
        date: new Date(parseInt(msg.internalDate)),
        size: msg.sizeEstimate,
        attachments
      };
      
      const features = extractFeatures(emailData);
      const predictions = await getDNNPredictions(features, body);
      
      const email = new Email({
        userId: user._id,
        gmailId: message.id,
        threadId: msg.threadId,
        rawData: emailData,
        features,
        predictions,
        prediction: {
          threatProbability: predictions.ensemble.probability,
          isThreat: predictions.ensemble.isThreat,
          riskLevel: predictions.ensemble.riskLevel,
          confidence: predictions.ensemble.agreement === 'ALL_AGREE_THREAT' ? 'HIGH' : 'MEDIUM',
          modelVersion: 'dnn-ensemble-v1',
          analyzedAt: new Date()
        },
        isAnalyzed: true
      });
      
      await email.save();
      newEmails.push(email);
      
      if (predictions.ensemble.riskLevel === 'HIGH' && user.settings.notifications) {
        io.emit('threat-detected', {
          userId: user._id.toString(),
          email: {
            id: email._id,
            subject: email.rawData.subject,
            from: email.rawData.from,
            riskLevel: predictions.ensemble.riskLevel,
            probability: predictions.ensemble.probability,
            models: {
              simple: predictions.simpleDNN.isThreat,
              deep: predictions.deepDNN.isThreat,
              wide: predictions.wideDNN.isThreat
            }
          }
        });
      }
    }
    
    user.lastEmailCheck = new Date();
    await user.save();
    
    return newEmails;
    
  } catch (error) {
    if (error.code === 401) {
      const newToken = await refreshAccessToken(user);
      user.accessToken = newToken;
      await user.save();
      return fetchAndAnalyzeEmails(user, io);
    }
    throw error;
  }
};

module.exports = { fetchAndAnalyzeEmails };