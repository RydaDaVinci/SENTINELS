// backend/routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const User = require('../models/User');

const router = express.Router();

// Google OAuth2 client setup - with explicit redirect URI
const REDIRECT_URI = 'http://localhost:5000/api/auth/google/callback';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI  // Make sure this matches exactly what's in Google Console
);

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

// Start Google OAuth flow
router.get('/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    redirect_uri: REDIRECT_URI,  // Explicitly set redirect_uri
    include_granted_scopes: true
  });
  
  console.log('Auth URL generated:', url);
  console.log('Redirect URI:', REDIRECT_URI);
  res.redirect(url);
});

// Google OAuth callback
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  
  console.log('Callback received with code:', code ? '✓ Code present' : '✗ No code');
  console.log('Full query:', req.query);
  
  if (!code) {
    console.error('No code provided');
    return res.redirect(`${process.env.CLIENT_URL}/auth-error?message=no_code`);
  }
  
  try {
    console.log('Exchanging code for tokens...');
    const { tokens } = await oauth2Client.getToken({
      code,
      redirect_uri: REDIRECT_URI  // Explicitly set redirect_uri here too
    });
    
    console.log('Tokens received successfully');
    oauth2Client.setCredentials(tokens);
    
    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    console.log('User info received:', userInfo.data.email);
    
    // Generate JWT
    const appToken = jwt.sign(
      { userId: '1', email: userInfo.data.email },
      process.env.JWT_SECRET || 'dev-secret-key',
      { expiresIn: '7d' }
    );
    
    // Redirect to frontend with token
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/auth-success?token=${appToken}`);
    
  } catch (error) {
    console.error('Auth error details:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    });
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/auth-error?message=${encodeURIComponent(error.message)}`);
  }
});

// Get current user
router.get('/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key');
    res.json({
      _id: '1',
      name: 'Test User',
      email: decoded.email || 'test@example.com',
      picture: 'https://via.placeholder.com/32',
      settings: {
        autoScan: true,
        alertThreshold: 'MEDIUM',
        notifications: true,
        ensembleVoting: true
      }
    });
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = router;