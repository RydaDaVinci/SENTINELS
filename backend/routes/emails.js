// backend/routes/emails.js
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Email = require('../models/Email');

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

// Get threat alerts (unread high-risk emails)
router.get('/alerts', authMiddleware, async (req, res) => {
  try {
    const alerts = await Email.find({
      userId: req.user._id,
      'prediction.riskLevel': 'HIGH',
      isRead: false
    })
      .sort({ 'rawData.date': -1 })
      .limit(10)
      .select('rawData.subject rawData.from rawData.date prediction');
    
    res.json(alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark email as read
router.patch('/:id/read', authMiddleware, async (req, res) => {
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

// Get emails by risk level
router.get('/risk/:level', authMiddleware, async (req, res) => {
  try {
    const level = req.params.level.toUpperCase();
    
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(level)) {
      return res.status(400).json({ message: 'Invalid risk level' });
    }
    
    const emails = await Email.find({
      userId: req.user._id,
      'prediction.riskLevel': level,
      isAnalyzed: true
    })
      .sort({ 'rawData.date': -1 })
      .limit(50)
      .select('rawData.subject rawData.from rawData.date prediction isRead');
    
    res.json(emails);
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search emails
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ message: 'Search query required' });
    }
    
    const emails = await Email.find({
      userId: req.user._id,
      $or: [
        { 'rawData.subject': { $regex: q, $options: 'i' } },
        { 'rawData.from': { $regex: q, $options: 'i' } },
        { 'rawData.body': { $regex: q, $options: 'i' } }
      ]
    })
      .sort({ 'rawData.date': -1 })
      .limit(50)
      .select('rawData.subject rawData.from rawData.date prediction');
    
    res.json(emails);
  } catch (error) {
    console.error('Error searching emails:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;