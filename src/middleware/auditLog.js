const db = require('../config/database');

/**
 * Create an audit log entry
 * @param {Object} params - Audit log parameters
 */
const createAuditLog = async ({
  schoolId,
  userId,
  action,
  tableName,
  recordId,
  oldValues = null,
  newValues = null,
  ipAddress,
  userAgent
}) => {
  try {
    await db.query(
      `INSERT INTO audit_logs 
       (school_id, user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        schoolId,
        userId,
        action,
        tableName,
        recordId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        ipAddress,
        userAgent
      ]
    );
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw error - audit logging shouldn't break the main operation
  }
};

/**
 * Middleware to automatically log certain actions
 */
const auditLog = (tableName, action) => {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to capture response
    res.json = function (data) {
      // Only log successful operations (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Extract record ID from response or request
        let recordId = null;
        if (data && data.data && data.data.id) {
          recordId = data.data.id;
        } else if (req.params.id) {
          recordId = req.params.id;
        }

        // Create audit log asynchronously (don't wait for it)
        createAuditLog({
          schoolId: req.user?.schoolId || req.body?.school_id,
          userId: req.user?.id,
          action: action || req.method,
          tableName,
          recordId,
          oldValues: req.method === 'PUT' || req.method === 'PATCH' ? req.body : null,
          newValues: data && data.data ? data.data : null,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent')
        }).catch(err => console.error('Audit log error:', err));
      }

      // Call original json method
      return originalJson(data);
    };

    next();
  };
};

/**
 * Log user login
 */
const logLogin = async (userId, schoolId, ipAddress, userAgent) => {
  await createAuditLog({
    schoolId,
    userId,
    action: 'LOGIN',
    tableName: 'users',
    recordId: userId,
    ipAddress,
    userAgent
  });
};

/**
 * Log user logout
 */
const logLogout = async (userId, schoolId, ipAddress, userAgent) => {
  await createAuditLog({
    schoolId,
    userId,
    action: 'LOGOUT',
    tableName: 'users',
    recordId: userId,
    ipAddress,
    userAgent
  });
};

/**
 * Get audit logs with filtering
 */
const getAuditLogs = async (filters = {}) => {
  const {
    schoolId,
    userId,
    action,
    tableName,
    startDate,
    endDate,
    limit = 100,
    offset = 0
  } = filters;

  let query = `
    SELECT 
      al.*,
      u.first_name || ' ' || u.last_name as user_name,
      u.email as user_email,
      u.role as user_role
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  let paramCount = 0;

  if (schoolId) {
    paramCount++;
    query += ` AND al.school_id = $${paramCount}`;
    params.push(schoolId);
  }

  if (userId) {
    paramCount++;
    query += ` AND al.user_id = $${paramCount}`;
    params.push(userId);
  }

  if (action) {
    paramCount++;
    query += ` AND al.action = $${paramCount}`;
    params.push(action);
  }

  if (tableName) {
    paramCount++;
    query += ` AND al.table_name = $${paramCount}`;
    params.push(tableName);
  }

  if (startDate) {
    paramCount++;
    query += ` AND al.created_at >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` AND al.created_at <= $${paramCount}`;
    params.push(endDate);
  }

  query += ` ORDER BY al.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
  params.push(limit, offset);

  const result = await db.query(query, params);
  return result.rows;
};

module.exports = {
  auditLog,
  createAuditLog,
  logLogin,
  logLogout,
  getAuditLogs
};
