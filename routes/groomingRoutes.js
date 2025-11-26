const express = require("express");
const router = express.Router();
const { protect, trainerOnly } = require("../middlewares/authMiddleware");
const {
  markTraineeGrooming,
  getTraineeGrooming
} = require("../controllers/groomingController");

// Trainer-specific routes
router.post("/mark", protect, trainerOnly, markTraineeGrooming);
router.get("/trainees", protect, trainerOnly, getTraineeGrooming);

module.exports = router;

