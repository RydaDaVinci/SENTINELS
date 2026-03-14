// backend/services/emailChecker.js
const User = require('../models/User');
const { fetchAndAnalyzeEmails } = require('./emailFetcher');

const checkNewEmails = async (io) => {
  try {
    const users = await User.find({ 
      accessToken: { $exists: true },
      'settings.autoScan': true 
    });
    
    for (const user of users) {
      try {
        await fetchAndAnalyzeEmails(user, io);
      } catch (error) {
        console.error(`Error processing user ${user.email}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error in email checker:', error);
  }
};

module.exports = { checkNewEmails };