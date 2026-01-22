const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendanceController");
const { authenticate } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

// Mark attendance for a class
router.post(
  "/",
  authenticate,
  asyncHandler(attendanceController.markAttendance),
);

// Get attendance for a class on a specific date
router.get(
  "/class",
  authenticate,
  asyncHandler(attendanceController.getClassAttendance),
);

// Get attendance summary for a class
router.get(
  "/class/:classId/summary",
  authenticate,
  asyncHandler(attendanceController.getClassAttendanceSummary),
);

// Get attendance report for a student
router.get(
  "/student/:studentId",
  authenticate,
  asyncHandler(attendanceController.getStudentAttendanceReport),
);

module.exports = router;
