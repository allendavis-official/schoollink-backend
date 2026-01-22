/**
 * Custom error class for application errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;

  // Log error for debugging
  console.error('Error:', {
    message: err.message,
    statusCode: error.statusCode,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // PostgreSQL errors
  if (err.code === '23505') {
    // Duplicate key error
    const field = err.detail?.match(/Key \((.*?)\)=/)?.[1] || 'field';
    error.message = `A record with this ${field} already exists.`;
    error.statusCode = 409;
  }

  if (err.code === '23503') {
    // Foreign key violation
    error.message = 'Cannot complete operation. Related record not found.';
    error.statusCode = 400;
  }

  if (err.code === '22P02') {
    // Invalid text representation
    error.message = 'Invalid data format provided.';
    error.statusCode = 400;
  }

  if (err.code === '23502') {
    // Not null violation
    const field = err.column || 'field';
    error.message = `Required field '${field}' is missing.`;
    error.statusCode = 400;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token. Please login again.';
    error.statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Your session has expired. Please login again.';
    error.statusCode = 401;
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    error.message = Object.values(err.errors).map(e => e.message).join(', ');
    error.statusCode = 400;
  }

  // Send error response
  const response = {
    success: false,
    message: error.message || 'An error occurred. Please try again.',
    ...(process.env.NODE_ENV === 'development' && {
      error: err.message,
      stack: err.stack
    })
  };

  res.status(error.statusCode).json(response);
};

/**
 * Handle 404 errors (route not found)
 */
const notFound = (req, res, next) => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

/**
 * Async handler wrapper to catch errors in async routes
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  AppError,
  errorHandler,
  notFound,
  asyncHandler
};
