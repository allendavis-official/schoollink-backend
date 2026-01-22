const express = require("express");
const router = express.Router();
const studentController = require("../controllers/studentController");
const { authenticate } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

router.post("/", authenticate, asyncHandler(studentController.createStudent));
router.get("/", authenticate, asyncHandler(studentController.getStudents));
router.get(
  "/:id",
  authenticate,
  asyncHandler(studentController.getStudentById)
);
router.put("/:id", authenticate, asyncHandler(studentController.updateStudent));
router.delete(
  "/:id",
  authenticate,
  asyncHandler(studentController.deleteStudent)
); // ADD THIS LINE
router.post(
  "/enroll",
  authenticate,
  asyncHandler(studentController.enrollStudent)
);

module.exports = router;
