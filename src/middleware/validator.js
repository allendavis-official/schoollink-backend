const { validationResult } = require('express-validator');

/**
 * Middleware to handle validation errors from express-validator
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const extractedErrors = errors.array().map(err => ({
      field: err.param,
      message: err.msg
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: extractedErrors
    });
  }
  
  next();
};

/**
 * Middleware to sanitize user input
 */
const sanitizeInput = (req, res, next) => {
  // Remove any potential XSS attempts
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .trim();
    }
    if (typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach(key => {
        obj[key] = sanitize(obj[key]);
      });
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  if (req.params) {
    req.params = sanitize(req.params);
  }

  next();
};

/**
 * Middleware to ensure school_id is included for multi-tenant operations
 */
const requireSchoolId = (req, res, next) => {
  const schoolId = req.body.school_id || req.query.school_id || req.params.schoolId;

  // Super admin can operate without school_id in some cases
  if (req.user && req.user.role === 'super_admin' && !schoolId) {
    return next();
  }

  if (!schoolId && req.user && req.user.schoolId) {
    // Use authenticated user's school_id if not provided
    req.body.school_id = req.user.schoolId;
    return next();
  }

  if (!schoolId) {
    return res.status(400).json({
      success: false,
      message: 'School ID is required for this operation.'
    });
  }

  next();
};

module.exports = {
  validate,
  sanitizeInput,
  requireSchoolId
};
