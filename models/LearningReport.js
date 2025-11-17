const mongoose = require('mongoose');

const LearningReportSchema = new mongoose.Schema(
  {
    // Reference to the candidate/user
    author_id: {
      type: String,
      required: true,
      index: true
    },
    
    // Reference to User model
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    
    // Learning Report data
    reportData: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    
    // Metadata
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserNew',
      required: true
    },
    
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    
    // Last updated
    lastUpdatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    collection: 'learning_reports'
  }
);

// Index for efficient queries
LearningReportSchema.index({ author_id: 1 });
LearningReportSchema.index({ user: 1 });
LearningReportSchema.index({ uploadedAt: -1 });

module.exports = mongoose.model('LearningReport', LearningReportSchema);

