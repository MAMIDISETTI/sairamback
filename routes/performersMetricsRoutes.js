const express = require('express');
const router = express.Router();
const { protect, requireRoles } = require('../middlewares/authMiddleware');
const {
  getAllCandidatesPerformance,
  getPerformersByCategory,
  getCandidatesByExamThreshold,
  getCandidatesByLearningPhase
} = require('../controllers/performersMetricsController');

// All routes require authentication and admin role
router.use(protect);
router.use(requireRoles(['admin']));

// Get all candidates with performance metrics
router.get('/candidates', getAllCandidatesPerformance);

// Get top or low performers
router.get('/performers', getPerformersByCategory);

// Get candidates by exam average threshold
router.get('/exam-threshold', getCandidatesByExamThreshold);

// Get candidates by learning phase
router.get('/learning-phase', getCandidatesByLearningPhase);

module.exports = router;

