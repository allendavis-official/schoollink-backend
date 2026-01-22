const express = require("express");
const router = express.Router();
const teacherDashboardController = require("../controllers/teacherDashboardController");
const { authenticate } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

// Teacher dashboard
router.get(
  "/dashboard",
  authenticate,
  asyncHandler(teacherDashboardController.getTeacherDashboard)
);

// Teacher's classes
router.get(
  "/classes",
  authenticate,
  asyncHandler(teacherDashboardController.getTeacherClasses)
);

// Teacher's subjects
router.get(
  "/subjects",
  authenticate,
  asyncHandler(teacherDashboardController.getTeacherSubjects)
);

// Students in a specific class
router.get(
  "/classes/:classId/students",
  authenticate,
  asyncHandler(teacherDashboardController.getClassStudents)
);

module.exports = router;
