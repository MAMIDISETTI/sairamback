const mongoose = require('mongoose');

const CandidateReportSchema = new mongoose.Schema(
  {
    // Reference to the candidate/user
    author_id: {
      type: String,
      required: true,
      index: true
    },
    
    // Reference to User model (optional, for easier queries)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    
    // Learning Report data
    learningReport: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    
    // Attendance Report data
    attendanceReport: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    
    // Grooming Report data
    groomingReport: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    
    // Interactions Report data
    interactionsReport: {
      type: mongoose.Schema.Types.Mixed,
      default: null
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
    
    // Google Sheet URL used for upload
    googleSheetUrl: {
      type: String,
      default: null
    },
    
    // Last updated
    lastUpdatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    collection: 'candidate_reports'
  }
);

// Index for efficient queries
CandidateReportSchema.index({ author_id: 1 });
CandidateReportSchema.index({ user: 1 });
CandidateReportSchema.index({ uploadedAt: -1 });

module.exports = mongoose.model('CandidateReport', CandidateReportSchema);

