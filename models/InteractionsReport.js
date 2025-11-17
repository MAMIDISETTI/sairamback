const mongoose = require('mongoose');

const InteractionsReportSchema = new mongoose.Schema(
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
    
    // Interactions Report data (array of interactions)
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
    collection: 'interactions_reports'
  }
);

// Index for efficient queries
InteractionsReportSchema.index({ author_id: 1 });
InteractionsReportSchema.index({ user: 1 });
InteractionsReportSchema.index({ uploadedAt: -1 });

module.exports = mongoose.model('InteractionsReport', InteractionsReportSchema);

