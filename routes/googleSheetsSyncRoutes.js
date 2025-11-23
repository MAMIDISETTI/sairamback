const express = require('express');
const router = express.Router();
const { protect, requireRoles } = require('../middlewares/authMiddleware');
const {
  syncUsers,
  syncJoiners,
  syncCandidateReports,
  syncAll,
} = require('../controllers/googleSheetsSyncController');

// All routes require authentication
router.use(protect);

// Sync Users (Admin only)
router.post('/users', requireRoles(['admin']), syncUsers);

// Sync Joiners (Admin/BOA)
router.post('/joiners', requireRoles(['admin', 'boa']), syncJoiners);

// Sync Candidate Reports (Admin/BOA)
router.post('/candidate-reports', requireRoles(['admin', 'boa']), syncCandidateReports);

// Sync All Data (Admin only)
router.post('/all', requireRoles(['admin']), syncAll);

module.exports = router;

