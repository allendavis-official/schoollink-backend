const express = require("express");
const router = express.Router();
const parentController = require("../controllers/parentController");
const { authenticate, authorize } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

// Parent CRUD
router.get(
  "/",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(parentController.getParents),
);
router.get(
  "/:id",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(parentController.getParentById),
);
router.post(
  "/",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(parentController.createParent),
);
router.put(
  "/:id",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(parentController.updateParent),
);

// Parent-Student linking
router.post(
  "/:parentId/students",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(parentController.linkParentToStudent),
);
router.delete(
  "/:parentId/students/:studentId",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(parentController.unlinkParentFromStudent),
);

// Account management
router.put(
  "/:id/deactivate",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(parentController.deactivateParent),
);
router.put(
  "/:id/reactivate",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(parentController.reactivateParent),
);
router.put(
  "/:id/reset-password",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(parentController.resetParentPassword),
);

module.exports = router;
