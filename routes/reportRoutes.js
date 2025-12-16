const express = require("express");
const { protect, masterTrainerOnly, trainerOnly, requireRoles, adminOnly, boaOnly } = require("../middlewares/authMiddleware");
const {
  generateAttendanceReport,
  generateDayPlanComplianceReport,
  generateObservationReport,
  generateAssignmentReport,
  generateAuditLog,
  getDemosReport,
  getAttendanceGroomingReport,
  getFortnightReport,
  getFortnightReports,
  getWorkshopReports
} = require("../controllers/reportController");
const {
  uploadFortnightReport,
  uploadWorkshopReport,
  uploadAttendanceReport,
  uploadDemosReport
} = require("../controllers/reportUploadController");
const csvUpload = require("../middlewares/csvUploadMiddleware");

const router = express.Router();

// Attendance reports
router.get("/attendance", protect, requireRoles(["master_trainer", "trainer"]), generateAttendanceReport);

// Day plan compliance reports
router.get("/day-plan-compliance", protect, requireRoles(["master_trainer", "trainer"]), generateDayPlanComplianceReport);

// Observation reports
router.get("/observations", protect, requireRoles(["master_trainer", "trainer"]), generateObservationReport);

// Assignment reports (Master Trainer only)
router.get("/assignments", protect, masterTrainerOnly, generateAssignmentReport);

// Audit log (Master Trainer only)
router.get("/audit", protect, masterTrainerOnly, generateAuditLog);

// Admin Reports (Admin only)
router.get("/demos", protect, adminOnly, getDemosReport);
router.get("/attendance-grooming", protect, adminOnly, getAttendanceGroomingReport);
router.get("/fortnight", protect, adminOnly, getFortnightReport);
router.get("/fortnight-reports", protect, adminOnly, getFortnightReports);
router.get("/workshop-reports", protect, adminOnly, getWorkshopReports);

// BOA CSV Upload Routes (BOA only)
router.post("/upload/fortnight", protect, boaOnly, csvUpload.single('csvFile'), uploadFortnightReport);
router.post("/upload/workshop", protect, boaOnly, csvUpload.single('csvFile'), uploadWorkshopReport);
router.post("/upload/attendance", protect, boaOnly, csvUpload.single('csvFile'), uploadAttendanceReport);
router.post("/upload/demos", protect, boaOnly, csvUpload.single('csvFile'), uploadDemosReport);

module.exports = router;
