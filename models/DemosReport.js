const mongoose = require('mongoose');

const DemosReportSchema = new mongoose.Schema(
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
  { timestamps: true, collection: 'demos_reports' }
);

// Indexes
DemosReportSchema.index({ uploadedAt: -1 });
DemosReportSchema.index({ uploadedBy: 1 });

module.exports = mongoose.model('DemosReport', DemosReportSchema);

