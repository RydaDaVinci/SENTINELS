const express = require('express');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');

const router = express.Router();

// Hardcode your credentials temporarily for testing
// Replace these with your actual values from Google Cloud Console
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = 'http://localhost:5000/api/auth-simple/callback';

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Simple login route
router.get('/login', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email'
    ]
  });
  
  console.log('Redirecting to:', url);
  res.redirect(url);
});

// Simple callback route
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.send('Error: No code provided');
  }
  
  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log('Got tokens:', Object.keys(tokens));
    
    // Get user email
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    // Create a simple token
    const appToken = jwt.sign(
      { email: userInfo.data.email },
      'simple-secret-key',
      { expiresIn: '1d' }
    );
    
    // Redirect to frontend
    res.redirect(`http://localhost:3000/auth-success?token=${appToken}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    res.send('Authentication failed: ' + error.message);
  }
});

// Simple user info route
router.get('/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }
  
  try {
    const decoded = jwt.verify(token, 'simple-secret-key');
    res.json({
      id: '1',
      name: decoded.email || 'User',
      email: decoded.email,
      picture: 'https://via.placeholder.com/32'
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;