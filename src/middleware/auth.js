const { verifyAccessToken } = require('../config/jwt');
const db = require('../config/database');

/**
 * Middleware to verify JWT token and authenticate user
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please login to continue.'
      });
    }

    // Extract token
    const token = authHeader.substring(7);

    // Verify token
    const decoded = verifyAccessToken(token);

    // Check if user still exists and is active
    const userQuery = await db.query(
      'SELECT id, email, role, school_id, is_active, first_name, last_name FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userQuery.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Please login again.'
      });
    }

    const user = userQuery.rows[0];

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact administration.'
      });
    }

    // Attach user to request object
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.school_id,
      firstName: user.first_name,
      lastName: user.last_name
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.message === 'Invalid or expired token') {
      return res.status(401).json({
        success: false,
        message: 'Your session has expired. Please login again.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Authentication failed. Please try again.'
    });
  }
};

/**
 * Middleware to check if user has required role(s)
 * @param {string|Array} roles - Required role(s)
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    const hasRole = roles.includes(req.user.role);

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this resource.'
      });
    }

    next();
  };
};

/**
 * Middleware to check if user belongs to the school (multi-tenant isolation)
 * @param {string} paramName - Request parameter name containing school_id
 */
const checkSchoolAccess = (paramName = 'schoolId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    // Super admin can access all schools
    if (req.user.role === 'super_admin') {
      return next();
    }

    const requestedSchoolId = req.params[paramName] || req.body.school_id || req.query.school_id;

    if (requestedSchoolId && requestedSchoolId !== req.user.schoolId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this school.'
      });
    }

    next();
  };
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);

    const userQuery = await db.query(
      'SELECT id, email, role, school_id, is_active, first_name, last_name FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (userQuery.rows.length > 0) {
      const user = userQuery.rows[0];
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.school_id,
        firstName: user.first_name,
        lastName: user.last_name
      };
    }

    next();
  } catch (error) {
    // Silent fail for optional auth
    next();
  }
};

module.exports = {
  authenticate,
  authorize,
  checkSchoolAccess,
  optionalAuth
};
