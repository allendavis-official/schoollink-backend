const express = require("express");
const router = express.Router();
const parentPortalController = require("../controllers/parentPortalController");
const { authenticate, authorize } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

// All routes require parent authentication
router.get(
  "/children",
  authenticate,
  authorize("parent"),
  asyncHandler(parentPortalController.getMyChildren),
);
router.get(
  "/children/:studentId/grades",
  authenticate,
  authorize("parent"),
  asyncHandler(parentPortalController.getChildGrades),
);
router.get(
  "/children/:studentId/attendance",
  authenticate,
  authorize("parent"),
  asyncHandler(parentPortalController.getChildAttendance),
);
router.get(
  "/children/:studentId/fees",
  authenticate,
  authorize("parent"),
  asyncHandler(parentPortalController.getChildFees),
);
router.get(
  "/children/:studentId/report-card/:academicYearId",
  authenticate,
  authorize("parent"),
  asyncHandler(parentPortalController.getChildReportCard),
);

module.exports = router;
