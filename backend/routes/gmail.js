// backend/routes/gmail.js
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Email = require('../models/Email');
const { fetchAndAnalyzeEmails } = require('../services/emailFetcher');

const router = express.Router();

// Middleware
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Get Gmail connection status
router.get('/status', authMiddleware, async (req, res) => {
  const hasValidToken = req.user.accessToken && 
    req.user.tokenExpiry && 
    new Date(req.user.tokenExpiry) > new Date();
  
  res.json({
    connected: !!req.user.accessToken,
    email: req.user.email,
    name: req.user.name,
    picture: req.user.picture,
    hasValidToken,
    lastCheck: req.user.lastEmailCheck,
    settings: req.user.settings
  });
});

// Fetch recent emails
router.get('/recent', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    const emails = await Email.find({ userId: req.user._id })
      .sort({ 'rawData.date': -1 })
      .limit(limit)
      .select('rawData.subject rawData.from rawData.date predictions prediction isRead isAnalyzed');
    
    res.json(emails);
  } catch (error) {
    console.error('Error fetching recent emails:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Get email details
router.get('/email/:id', authMiddleware, async (req, res) => {
  try {
    const email = await Email.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!email) {
      return res.status(404).json({ message: 'Email not found' });
    }
    
    res.json(email);
  } catch (error) {
    console.error('Error fetching email:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Trigger manual email fetch
router.post('/fetch', authMiddleware, async (req, res) => {
  try {
    const io = req.app.get('io');
    const emails = await fetchAndAnalyzeEmails(req.user, io);
    
    res.json({
      message: `Fetched ${emails.length} new emails`,
      count: emails.length
    });
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get threat statistics
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const totalEmails = await Email.countDocuments({ userId: req.user._id });
    const analyzedEmails = await Email.countDocuments({ 
      userId: req.user._id, 
      isAnalyzed: true 
    });
    
    const threats = await Email.countDocuments({
      userId: req.user._id,
      'prediction.isThreat': true
    });
    
    const riskLevels = await Email.aggregate([
      { $match: { userId: req.user._id, isAnalyzed: true } },
      { $group: { 
        _id: '$prediction.riskLevel',
        count: { $sum: 1 }
      }}
    ]);
    
    // Model agreement statistics
    const agreements = await Email.aggregate([
      { $match: { userId: req.user._id, isAnalyzed: true } },
      { $group: {
        _id: '$predictions.ensemble.agreement',
        count: { $sum: 1 }
      }}
    ]);
    
    res.json({
      total: totalEmails,
      analyzed: analyzedEmails,
      threats,
      riskLevels: riskLevels.reduce((acc, item) => {
        acc[item._id || 'UNKNOWN'] = item.count;
        return acc;
      }, {}),
      agreements: agreements.reduce((acc, item) => {
        acc[item._id || 'UNKNOWN'] = item.count;
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark email as read
router.patch('/email/:id/read', authMiddleware, async (req, res) => {
  try {
    await Email.updateOne(
      { _id: req.params.id, userId: req.user._id },
      { $set: { isRead: true } }
    );
    
    res.json({ message: 'Email marked as read' });
  } catch (error) {
    console.error('Error updating email:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;