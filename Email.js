// backend/models/Email.js
const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  gmailId: {
    type: String,
    required: true,
    unique: true
  },
  threadId: String,
  
  // Raw email data
  rawData: {
    from: String,
    to: [String],
    cc: [String],
    bcc: [String],
    subject: String,
    body: String,
    bodySnippet: String,
    date: Date,
    size: Number,
    attachments: [{
      filename: String,
      size: Number,
      mimeType: String,
      attachmentId: String
    }]
  },
  
  // Extracted features
  features: {
    toCount: Number,
    ccCount: Number,
    totalRecipients: Number,
    externalTo: Number,
    externalCc: Number,
    externalRatio: Number,
    hour: Number,
    minute: Number,
    dayOfWeek: Number,
    month: Number,
    isWorkHour: Boolean,
    isAfterHours: Boolean,
    isWeekend: Boolean,
    attachmentCount: Number,
    hasAttachment: Boolean,
    sizeKb: Number,
    sizeLog: Number,
    userEncoded: { type: Number, default: 0 },
    pcEncoded: { type: Number, default: 0 },
    isSend: { type: Number, default: 0 },
    anger: Number,
    anticipation: Number,
    disgust: Number,
    fear: Number,
    joy: Number,
    love: Number,
    optimism: Number,
    pessimism: Number,
    sadness: Number,
    surprise: Number,
    trust: Number,
    negative: Number,
    neutral: Number,
    positive: Number,
    vaderNeg: Number,
    vaderNeu: Number,
    vaderPos: Number,
    vaderCompound: Number,
    blobPolarity: Number,
    blobSubjectivity: Number
  },
  
  // Predictions from all 3 DNN models
  predictions: {
    simpleDNN: {
      probability: Number,
      isThreat: Boolean,
      riskLevel: String
    },
    deepDNN: {
      probability: Number,
      isThreat: Boolean,
      riskLevel: String
    },
    wideDNN: {
      probability: Number,
      isThreat: Boolean,
      riskLevel: String
    },
    ensemble: {
      probability: Number,
      isThreat: Boolean,
      riskLevel: String,
      agreement: {
        type: String,
        enum: ['ALL_AGREE_THREAT', 'ALL_AGREE_SAFE', 'MAJORITY_THREAT', 'MAJORITY_SAFE', 'SPLIT']
      }
    }
  },
  
  // Final prediction
  prediction: {
    threatProbability: Number,
    isThreat: Boolean,
    riskLevel: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH']
    },
    confidence: String,
    modelVersion: String,
    analyzedAt: Date
  },
  
  // Status
  isRead: {
    type: Boolean,
    default: false
  },
  isAnalyzed: {
    type: Boolean,
    default: false
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for quick queries
emailSchema.index({ userId: 1, isAnalyzed: 1, 'prediction.riskLevel': 1 });
emailSchema.index({ 'rawData.date': -1 });

module.exports = mongoose.model('Email', emailSchema);