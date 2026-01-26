const express = require("express");
const router = express.Router();
const feeController = require("../controllers/feeController");
const { authenticate, authorize } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

// Fee Types
router.get("/types", authenticate, asyncHandler(feeController.getFeeTypes));
router.post(
  "/types",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(feeController.createFeeType),
);
router.put(
  "/types/:id",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(feeController.updateFeeType),
);
router.delete(
  "/types/:id",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(feeController.deleteFeeType),
);

// Fee Structures
router.get(
  "/structures",
  authenticate,
  asyncHandler(feeController.getFeeStructures),
);
router.post(
  "/structures",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(feeController.createFeeStructure),
);
router.put(
  "/structures/:id",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(feeController.updateFeeStructure),
);
router.delete(
  "/structures/:id",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(feeController.deleteFeeStructure),
);

// Student Fees
router.get(
  "/student-fees",
  authenticate,
  asyncHandler(feeController.getStudentFees),
);
router.post(
  "/student-fees",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(feeController.assignFeeToStudent),
);
router.post(
  "/student-fees/bulk-assign",
  authenticate,
  authorize("super_admin", "school_admin"),
  asyncHandler(feeController.bulkAssignFeesToClass),
);

// Payments
router.post(
  "/payments",
  authenticate,
  authorize("super_admin", "school_admin", "accountant"),
  asyncHandler(feeController.recordPayment),
);
router.get(
  "/payments",
  authenticate,
  asyncHandler(feeController.getPaymentHistory),
);

module.exports = router;
