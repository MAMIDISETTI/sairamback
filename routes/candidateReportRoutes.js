const express = require('express');
const { protect, requireRoles } = require('../middlewares/authMiddleware');
const {
  validateAuthorId,
  bulkUploadCandidateReports,
  getCandidatePerformance
} = require('../controllers/candidateReportController');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Validate author_id exists in users collection (BOA only)
router.post('/validate-author', requireRoles(['boa']), validateAuthorId);

// Bulk upload candidate reports to separate collections (BOA only)
router.post('/bulk-upload', requireRoles(['boa']), bulkUploadCandidateReports);

// Get candidate performance data (Admin only)
router.get('/performance/:authorId', requireRoles(['admin']), getCandidatePerformance);

module.exports = router;

