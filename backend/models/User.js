// backend/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  picture: String,
  accessToken: String,
  refreshToken: String,
  tokenExpiry: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastEmailCheck: Date,
  settings: {
    autoScan: {
      type: Boolean,
      default: true
    },
    alertThreshold: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      default: 'MEDIUM'
    },
    notifications: {
      type: Boolean,
      default: true
    },
    ensembleVoting: {
      type: Boolean,
      default: true
    }
  }
});

module.exports = mongoose.model('User', userSchema);