const mongoose = require('mongoose');

const WorkshopReportSchema = new mongoose.Schema(
  {
    // Store CSV data as flexible schema
    csvData: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    // Metadata
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    fileName: {
      type: String,
      default: ''
    },
    rowCount: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true, collection: 'workshop_reports' }
);

// Indexes
WorkshopReportSchema.index({ uploadedAt: -1 });
WorkshopReportSchema.index({ uploadedBy: 1 });

module.exports = mongoose.model('WorkshopReport', WorkshopReportSchema);

