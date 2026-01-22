const express = require('express');
const router = express.Router();
const academicController = require('../controllers/academicController');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

router.post('/years', authenticate, authorize('super_admin', 'school_admin'), asyncHandler(academicController.createAcademicYear));
router.get('/years', authenticate, asyncHandler(academicController.getAcademicYears));
router.get('/years/:id', authenticate, asyncHandler(academicController.getAcademicYearById));
router.put('/years/:id/set-current', authenticate, authorize('super_admin', 'school_admin'), asyncHandler(academicController.setCurrentAcademicYear));
router.put('/semesters/:id/set-current', authenticate, authorize('super_admin', 'school_admin'), asyncHandler(academicController.setCurrentSemester));
router.put('/periods/:id/toggle-lock', authenticate, authorize('super_admin', 'school_admin'), asyncHandler(academicController.togglePeriodLock));
router.post('/grading-config', authenticate, authorize('super_admin', 'school_admin'), asyncHandler(academicController.updateGradingConfig));
router.get('/grading-config', authenticate, asyncHandler(academicController.getGradingConfig));

module.exports = router;
