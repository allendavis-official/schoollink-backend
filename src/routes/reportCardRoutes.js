const express = require("express");
const router = express.Router();
const reportCardController = require("../controllers/reportCardController");
const { authenticate } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

// Get report card data (JSON)
router.get(
  "/student/:studentId/academic-year/:academicYearId",
  authenticate,
  asyncHandler(reportCardController.getStudentReportCardData)
);

// Generate PDF report card
router.get(
  "/student/:studentId/academic-year/:academicYearId/pdf",
  authenticate,
  asyncHandler(reportCardController.generateReportCardPDF)
);

module.exports = router;
