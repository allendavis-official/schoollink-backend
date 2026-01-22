const express = require("express");
const router = express.Router();
const schoolController = require("../controllers/schoolController");
const { authenticate, authorize } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { auditLog } = require("../middleware/auditLog");

router.post(
  "/",
  authenticate,
  authorize("super_admin"),
  auditLog("schools", "CREATE"),
  asyncHandler(schoolController.createSchool),
);
router.get("/", authenticate, asyncHandler(schoolController.getSchools));
router.get("/:id", authenticate, asyncHandler(schoolController.getSchoolById));
router.put(
  "/:id",
  authenticate,
  authorize("super_admin", "school_admin"),
  auditLog("schools", "UPDATE"),
  asyncHandler(schoolController.updateSchool),
);
router.delete(
  "/:id",
  authenticate,
  authorize("super_admin"),
  auditLog("schools", "DELETE"),
  asyncHandler(schoolController.deleteSchool),
);
router.get(
  "/:schoolId/dashboard",
  authenticate,
  asyncHandler(schoolController.getSchoolDashboard),
);
// School admin management
router.post(
  "/:schoolId/admins",
  authenticate,
  authorize("super_admin"),
  asyncHandler(schoolController.createSchoolAdmin),
);
router.get(
  "/:schoolId/admins",
  authenticate,
  asyncHandler(schoolController.getSchoolAdmins),
);

module.exports = router;
