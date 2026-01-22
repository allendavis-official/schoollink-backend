const express = require("express");
const router = express.Router();
const gradeController = require("../controllers/gradeController");
const { authenticate } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

// Get grades for a class-subject-period combination
router.get(
  "/class-subject",
  authenticate,
  asyncHandler(gradeController.getClassSubjectGrades)
);

// Enter or update a grade
router.post("/", authenticate, asyncHandler(gradeController.enterGrade));

// Get student grade report
router.get(
  "/student/:studentId/academic-year/:academicYearId",
  authenticate,
  asyncHandler(gradeController.getStudentGradeReport)
);

module.exports = router;
