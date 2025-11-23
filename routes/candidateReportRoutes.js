const express = require('express');
const { protect, requireRoles } = require('../middlewares/authMiddleware');
const {
  validateAuthorId,
  bulkUploadCandidateReports,
  getCandidatePerformance,
  updateCandidateReport
} = require('../controllers/candidateReportController');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Validate author_id exists in users collection (BOA only)
router.post('/validate-author', requireRoles(['boa']), validateAuthorId);

// Bulk upload candidate reports to separate collections (BOA only)
router.post('/bulk-upload', requireRoles(['boa']), bulkUploadCandidateReports);

// Get candidate performance data (Admin and Trainer)
router.get('/performance/:authorId', requireRoles(['admin', 'trainer']), getCandidatePerformance);

// Update candidate report (Admin and Trainer - trainers can only update attendance and grooming for assigned trainees)
router.put('/:authorId/:reportType', requireRoles(['admin', 'trainer']), updateCandidateReport);

module.exports = router;

