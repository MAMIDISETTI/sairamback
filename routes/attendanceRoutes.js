const express = require("express");
const router = express.Router();
const { protect, trainerOnly, requireRoles } = require("../middlewares/authMiddleware");
const {
  clockIn,
  clockOut,
  getTodayAttendance,
  getAttendanceHistory,
  getTraineeAttendance,
  validateAttendance,
  markTraineeAttendance
} = require("../controllers/attendanceController");

// Clock in/out routes (Trainers and Trainees)
router.post("/clock-in", protect, requireRoles(["trainer", "trainee"]), clockIn);
router.post("/clock-out", protect, requireRoles(["trainer", "trainee"]), clockOut);
router.get("/today", protect, requireRoles(["trainer", "trainee"]), getTodayAttendance);
router.get("/history", protect, requireRoles(["trainer", "trainee"]), getAttendanceHistory);

// Trainer-specific routes
router.get("/trainees", protect, trainerOnly, getTraineeAttendance);
router.put("/validate/:id", protect, trainerOnly, validateAttendance);
router.post("/mark", protect, trainerOnly, markTraineeAttendance);

module.exports = router;
