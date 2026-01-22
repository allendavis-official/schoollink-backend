const express = require("express");
const router = express.Router();
const classController = require("../controllers/classController");
const { authenticate } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

// Subject routes MUST come before /:id routes to avoid conflicts
router.post(
  "/subjects",
  authenticate,
  asyncHandler(classController.createSubject)
);
router.get(
  "/subjects",
  authenticate,
  asyncHandler(classController.getSubjects)
);

router.put(
  "/subjects/:id",
  authenticate,
  asyncHandler(classController.updateSubject)
);
router.delete(
  "/subjects/:id",
  authenticate,
  asyncHandler(classController.deleteSubject)
);

// Class-Subject assignment routes (specific paths before /:id)
router.get(
  "/:classId/subjects",
  authenticate,
  asyncHandler(classController.getClassSubjects)
);
router.post(
  "/:classId/subjects",
  authenticate,
  asyncHandler(classController.assignSubjectToClass)
);
router.delete(
  "/:classId/subjects/:subjectId",
  authenticate,
  asyncHandler(classController.removeSubjectFromClass)
);

// Class CRUD routes (/:id routes come LAST)
router.post("/", authenticate, asyncHandler(classController.createClass));
router.get("/", authenticate, asyncHandler(classController.getClasses));
router.get("/:id", authenticate, asyncHandler(classController.getClassById));
router.put("/:id", authenticate, asyncHandler(classController.updateClass));
router.delete("/:id", authenticate, asyncHandler(classController.deleteClass));

module.exports = router;
