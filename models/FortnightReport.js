const mongoose = require('mongoose');

const FortnightReportSchema = new mongoose.Schema(
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
  { timestamps: true, collection: 'fortnight_reports' }
);

// Indexes
FortnightReportSchema.index({ uploadedAt: -1 });
FortnightReportSchema.index({ uploadedBy: 1 });

module.exports = mongoose.model('FortnightReport', FortnightReportSchema);

