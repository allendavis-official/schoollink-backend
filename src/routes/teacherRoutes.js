const express = require("express");
const router = express.Router();
const teacherController = require("../controllers/teacherController");
const { authenticate } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

router.post("/", authenticate, asyncHandler(teacherController.createTeacher));
router.get("/", authenticate, asyncHandler(teacherController.getTeachers));
router.get(
  "/:id",
  authenticate,
  asyncHandler(teacherController.getTeacherById)
);
router.put("/:id", authenticate, asyncHandler(teacherController.updateTeacher));
router.delete(
  "/:id",
  authenticate,
  asyncHandler(teacherController.deleteTeacher)
);
// Teacher-Subject management
router.get(
  "/:teacherId/subjects",
  authenticate,
  asyncHandler(teacherController.getTeacherSubjects)
);
router.post(
  "/:teacherId/subjects",
  authenticate,
  asyncHandler(teacherController.assignSubjectToTeacher)
);
router.delete(
  "/:teacherId/subjects/:subjectId",
  authenticate,
  asyncHandler(teacherController.removeSubjectFromTeacher)
);

module.exports = router;
