const mongoose = require('mongoose');

const AttendanceReportSchema = new mongoose.Schema(
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
    
    // Attendance Report data
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
    collection: 'attendance_reports'
  }
);

// Index for efficient queries
AttendanceReportSchema.index({ author_id: 1 });
AttendanceReportSchema.index({ user: 1 });
AttendanceReportSchema.index({ uploadedAt: -1 });

module.exports = mongoose.model('AttendanceReport', AttendanceReportSchema);

