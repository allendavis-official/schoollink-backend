const bcrypt = require("bcryptjs");
const { generateTokenPair, verifyRefreshToken } = require("../config/jwt");
const db = require("../config/database");
const { AppError } = require("../middleware/errorHandler");
const { logLogin, logLogout } = require("../middleware/auditLog");

/**
 * Register a new user
 */
const register = async (req, res) => {
  const { email, password, firstName, lastName, phone, role, schoolId } =
    req.body;

  // Validate required fields
  if (!email || !password || !firstName || !lastName || !role) {
    throw new AppError("Please provide all required fields", 400);
  }

  // Validate role
  const validRoles = [
    "school_admin",
    "accountant",
    "teacher",
    "ict_officer",
    "parent",
  ];
  if (!validRoles.includes(role) && req.user?.role !== "super_admin") {
    throw new AppError("Invalid role specified", 400);
  }

  // Check if user already exists
  const existingUser = await db.query("SELECT id FROM users WHERE email = $1", [
    email.toLowerCase(),
  ]);

  if (existingUser.rows.length > 0) {
    throw new AppError("A user with this email already exists", 409);
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  // Determine school_id
  let finalSchoolId = schoolId;
  if (req.user?.role !== "super_admin") {
    finalSchoolId = req.user?.schoolId;
  }

  // Create user
  const result = await db.query(
    `INSERT INTO users 
     (email, password_hash, first_name, last_name, phone, role, school_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
     RETURNING id, email, first_name, last_name, phone, role, school_id, is_active, created_at`,
    [
      email.toLowerCase(),
      passwordHash,
      firstName,
      lastName,
      phone,
      role,
      finalSchoolId,
    ],
  );

  const user = result.rows[0];

  // Generate tokens
  const tokens = generateTokenPair(user);

  res.status(201).json({
    success: true,
    message: "User registered successfully",
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        role: user.role,
        schoolId: user.school_id,
      },
      ...tokens,
    },
  });
};

/**
 * Login user
 */
const login = async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    throw new AppError("Please provide email and password", 400);
  }

  // Find user
  const result = await db.query(
    `SELECT u.*, s.school_name, s.school_code 
     FROM users u
     LEFT JOIN schools s ON u.school_id = s.id
     WHERE u.email = $1`,
    [email.toLowerCase()],
  );

  if (result.rows.length === 0) {
    throw new AppError("Invalid email or password", 401);
  }

  const user = result.rows[0];

  // Check if user is active
  if (!user.is_active) {
    throw new AppError(
      "Your account has been deactivated. Please contact administration.",
      401,
    );
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    throw new AppError("Invalid email or password", 401);
  }

  // Update last login
  await db.query(
    "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1",
    [user.id],
  );

  // Log login
  await logLogin(
    user.id,
    user.school_id,
    req.ip || req.connection.remoteAddress,
    req.get("user-agent"),
  );

  // Generate tokens
  const tokens = generateTokenPair(user);

  res.cookie("refreshToken", tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/api/v1/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.json({
    success: true,
    message: "Login successful",
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        role: user.role,
        schoolId: user.school_id,
        schoolName: user.school_name,
        schoolCode: user.school_code,
      },
      accessToken: tokens.accessToken,
    },
  });
};

/**
 * Refresh access token
 */
const refreshToken = async (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!refreshToken) {
    throw new AppError("Refresh token is required", 400);
  }

  // Verify refresh token
  const decoded = verifyRefreshToken(refreshToken);

  // Get user
  const result = await db.query(
    "SELECT id, email, role, school_id, is_active FROM users WHERE id = $1",
    [decoded.userId],
  );

  if (result.rows.length === 0 || !result.rows[0].is_active) {
    throw new AppError("Invalid refresh token", 401);
  }

  const user = result.rows[0];

  // Generate new tokens
  const tokens = generateTokenPair(user);

  // Set new refresh token cookie
  res.cookie("refreshToken", tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/api/v1/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.json({
    success: true,
    message: "Token refreshed successfully",
    data: {
      accessToken: tokens.accessToken,
    },
  });
};

/**
 * Logout user
 */
const logout = async (req, res) => {
  // Log logout
  await logLogout(
    req.user.id,
    req.user.schoolId,
    req.ip || req.connection.remoteAddress,
    req.get("user-agent"),
  );

  res.json({
    success: true,
    message: "Logout successful",
  });
};

/**
 * Get current user profile
 */
const getProfile = async (req, res) => {
  const result = await db.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role, 
            u.school_id, u.is_active, u.last_login, u.created_at,
            s.school_name, s.school_code, s.school_type
     FROM users u
     LEFT JOIN schools s ON u.school_id = s.id
     WHERE u.id = $1`,
    [req.user.id],
  );

  if (result.rows.length === 0) {
    throw new AppError("User not found", 404);
  }

  const user = result.rows[0];

  res.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      role: user.role,
      schoolId: user.school_id,
      schoolName: user.school_name,
      schoolCode: user.school_code,
      schoolType: user.school_type,
      isActive: user.is_active,
      lastLogin: user.last_login,
      createdAt: user.created_at,
    },
  });
};

/**
 * Update user profile
 */
const updateProfile = async (req, res) => {
  const { firstName, lastName, phone } = req.body;

  const updates = [];
  const values = [];
  let paramCount = 0;

  if (firstName) {
    paramCount++;
    updates.push(`first_name = $${paramCount}`);
    values.push(firstName);
  }

  if (lastName) {
    paramCount++;
    updates.push(`last_name = $${paramCount}`);
    values.push(lastName);
  }

  if (phone) {
    paramCount++;
    updates.push(`phone = $${paramCount}`);
    values.push(phone);
  }

  if (updates.length === 0) {
    throw new AppError("No fields to update", 400);
  }

  paramCount++;
  values.push(req.user.id);

  const result = await db.query(
    `UPDATE users 
     SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${paramCount}
     RETURNING id, email, first_name, last_name, phone, role, school_id`,
    values,
  );

  res.json({
    success: true,
    message: "Profile updated successfully",
    data: result.rows[0],
  });
};

/**
 * Change password
 */
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new AppError("Please provide current and new password", 400);
  }

  if (newPassword.length < 6) {
    throw new AppError("Password must be at least 6 characters long", 400);
  }

  // Get current password hash
  const result = await db.query(
    "SELECT password_hash FROM users WHERE id = $1",
    [req.user.id],
  );

  const user = result.rows[0];

  // Verify current password
  const isPasswordValid = await bcrypt.compare(
    currentPassword,
    user.password_hash,
  );

  if (!isPasswordValid) {
    throw new AppError("Current password is incorrect", 401);
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const newPasswordHash = await bcrypt.hash(newPassword, salt);

  // Update password
  await db.query(
    "UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
    [newPasswordHash, req.user.id],
  );

  res.json({
    success: true,
    message: "Password changed successfully",
  });
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  changePassword,
};
