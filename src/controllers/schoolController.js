const db = require("../config/database");
const { AppError } = require("../middleware/errorHandler");

/**
 * Create a new school (Super Admin only)
 */
const createSchool = async (req, res) => {
  const {
    schoolCode,
    schoolName,
    schoolType,
    email,
    phone,
    address,
    city,
    county,
    logoUrl,
    subdomain,
  } = req.body;

  // Validate required fields
  if (!schoolCode || !schoolName || !schoolType) {
    throw new AppError("School code, name, and type are required", 400);
  }

  // Validate school type
  const validTypes = ["primary", "secondary", "technical"];
  if (!validTypes.includes(schoolType)) {
    throw new AppError("Invalid school type", 400);
  }

  // Check if school code already exists
  // Check for duplicate school code
  const codeCheck = await db.query(
    "SELECT id FROM schools WHERE school_code = $1",
    [schoolCode],
  );

  if (codeCheck.rows.length > 0) {
    throw new AppError("School code already exists", 409);
  }

  // Check for duplicate subdomain (only if subdomain is provided)
  if (subdomain && subdomain.trim() !== "") {
    const subdomainCheck = await db.query(
      "SELECT id FROM schools WHERE subdomain = $1",
      [subdomain],
    );

    if (subdomainCheck.rows.length > 0) {
      throw new AppError("Subdomain already exists", 409);
    }
  }

  // Create school
  const result = await db.query(
    `INSERT INTO schools 
   (school_code, school_name, school_type, email, phone, address, city, county, logo_url, subdomain, is_active)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
   RETURNING *`,
    [
      schoolCode,
      schoolName,
      schoolType,
      email,
      phone,
      address,
      city || "Monrovia",
      county,
      logoUrl,
      subdomain && subdomain.trim() !== "" ? subdomain : null, // Convert empty string to null
    ],
  );

  const school = result.rows[0];

  // Create default grading configuration
  await db.query(
    `INSERT INTO grading_config (school_id, pass_mark, use_custom_weights)
     VALUES ($1, 70.00, false)`,
    [school.id],
  );

  res.status(201).json({
    success: true,
    message: "School created successfully",
    data: school,
  });
};

/**
 * Get all schools (Super Admin) or current school (other users)
 */
const getSchools = async (req, res) => {
  const { page = 1, limit = 10, search, schoolType, isActive } = req.query;
  const offset = (page - 1) * limit;

  let query = "SELECT * FROM schools WHERE 1=1";
  const params = [];
  let paramCount = 0;

  // Super Admin can see all schools
  if (req.user.role !== "super_admin") {
    paramCount++;
    query += ` AND id = $${paramCount}`;
    params.push(req.user.schoolId);
  }

  // Apply filters
  if (search) {
    paramCount++;
    query += ` AND (school_name ILIKE $${paramCount} OR school_code ILIKE $${paramCount})`;
    params.push(`%${search}%`);
  }

  if (schoolType) {
    paramCount++;
    query += ` AND school_type = $${paramCount}`;
    params.push(schoolType);
  }

  // Default to showing only active schools unless explicitly requesting all
  if (isActive !== undefined) {
    paramCount++;
    query += ` AND is_active = $${paramCount}`;
    params.push(isActive === "true");
  } else {
    // Default: show only active schools
    paramCount++;
    query += ` AND is_active = $${paramCount}`;
    params.push(true);
  }

  // Get total count
  const countQuery = query.replace("SELECT *", "SELECT COUNT(*)");
  const countResult = await db.query(countQuery, params);
  const totalRecords = parseInt(countResult.rows[0].count);

  // Add pagination
  query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${
    paramCount + 2
  }`;
  params.push(limit, offset);

  const result = await db.query(query, params);

  res.json({
    success: true,
    data: result.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
    },
  });
};

/**
 * Get school by ID
 */
const getSchoolById = async (req, res) => {
  const { id } = req.params;

  // Check access permission
  if (req.user.role !== "super_admin" && req.user.schoolId !== id) {
    throw new AppError("You do not have permission to access this school", 403);
  }

  const result = await db.query("SELECT * FROM schools WHERE id = $1", [id]);

  if (result.rows.length === 0) {
    throw new AppError("School not found", 404);
  }

  // Get additional statistics
  const stats = await db.query(
    `SELECT 
       (SELECT COUNT(*) FROM students WHERE school_id = $1 AND status = 'active') as total_students,
       (SELECT COUNT(*) FROM teachers WHERE school_id = $1 AND status = 'active') as total_teachers,
       (SELECT COUNT(*) FROM classes WHERE school_id = $1) as total_classes,
       (SELECT COUNT(*) FROM users WHERE school_id = $1 AND is_active = true) as total_users`,
    [id],
  );

  res.json({
    success: true,
    data: {
      ...result.rows[0],
      statistics: stats.rows[0],
    },
  });
};

/**
 * Update school
 */
const updateSchool = async (req, res) => {
  const { id } = req.params;
  const {
    schoolName,
    schoolType,
    email,
    phone,
    address,
    city,
    county,
    logoUrl,
    subdomain,
    isActive,
  } = req.body;

  // Check access permission
  if (req.user.role !== "super_admin" && req.user.schoolId !== id) {
    throw new AppError("You do not have permission to update this school", 403);
  }

  const updates = [];
  const values = [];
  let paramCount = 0;

  if (schoolName) {
    paramCount++;
    updates.push(`school_name = $${paramCount}`);
    values.push(schoolName);
  }

  if (schoolType) {
    paramCount++;
    updates.push(`school_type = $${paramCount}`);
    values.push(schoolType);
  }

  if (email) {
    paramCount++;
    updates.push(`email = $${paramCount}`);
    values.push(email);
  }

  if (phone) {
    paramCount++;
    updates.push(`phone = $${paramCount}`);
    values.push(phone);
  }

  if (address) {
    paramCount++;
    updates.push(`address = $${paramCount}`);
    values.push(address);
  }

  if (city) {
    paramCount++;
    updates.push(`city = $${paramCount}`);
    values.push(city);
  }

  if (county) {
    paramCount++;
    updates.push(`county = $${paramCount}`);
    values.push(county);
  }

  if (logoUrl) {
    paramCount++;
    updates.push(`logo_url = $${paramCount}`);
    values.push(logoUrl);
  }

  if (subdomain) {
    paramCount++;
    updates.push(`subdomain = $${paramCount}`);
    values.push(subdomain);
  }

  if (isActive !== undefined && req.user.role === "super_admin") {
    paramCount++;
    updates.push(`is_active = $${paramCount}`);
    values.push(isActive);
  }

  if (updates.length === 0) {
    throw new AppError("No fields to update", 400);
  }

  paramCount++;
  values.push(id);

  const result = await db.query(
    `UPDATE schools 
     SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${paramCount}
     RETURNING *`,
    values,
  );

  if (result.rows.length === 0) {
    throw new AppError("School not found", 404);
  }

  res.json({
    success: true,
    message: "School updated successfully",
    data: result.rows[0],
  });
};

/**
 * Delete school (Super Admin only - soft delete)
 */
const deleteSchool = async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    "UPDATE schools SET is_active = false WHERE id = $1 RETURNING *",
    [id],
  );

  if (result.rows.length === 0) {
    throw new AppError("School not found", 404);
  }

  res.json({
    success: true,
    message: "School deactivated successfully",
    data: result.rows[0],
  });
};

/**
 * Get school dashboard statistics
 */
const getSchoolDashboard = async (req, res) => {
  const schoolId =
    req.user.role === "super_admin" ? req.params.schoolId : req.user.schoolId;

  if (!schoolId) {
    throw new AppError("School ID is required", 400);
  }

  // Get comprehensive statistics
  const stats = await db.query(
    `SELECT 
       -- Student statistics
       (SELECT COUNT(*) FROM students WHERE school_id = $1 AND status = 'active') as total_students,
       (SELECT COUNT(*) FROM students WHERE school_id = $1 AND status = 'active' AND gender = 'male') as male_students,
       (SELECT COUNT(*) FROM students WHERE school_id = $1 AND status = 'active' AND gender = 'female') as female_students,
       (SELECT COUNT(*) FROM students WHERE school_id = $1 AND status = 'graduated') as graduated_students,
       (SELECT COUNT(*) FROM students WHERE school_id = $1 AND status = 'withdrawn') as withdrawn_students,
       
       -- Teacher statistics
       (SELECT COUNT(*) FROM teachers WHERE school_id = $1 AND status = 'active') as total_teachers,
       
       -- Class statistics
       (SELECT COUNT(*) FROM classes WHERE school_id = $1) as total_classes,
       
       -- User statistics
       (SELECT COUNT(*) FROM users WHERE school_id = $1 AND is_active = true) as total_users,
       (SELECT COUNT(*) FROM users WHERE school_id = $1 AND role = 'parent') as total_parents
    `,
    [schoolId],
  );

  // Get current academic year
  const currentYear = await db.query(
    "SELECT * FROM academic_years WHERE school_id = $1 AND is_current = true",
    [schoolId],
  );

  // Get recent enrollments (last 30 days)
  const recentEnrollments = await db.query(
    `SELECT COUNT(*) as count 
     FROM student_enrollments 
     WHERE school_id = $1 
     AND enrollment_date >= CURRENT_DATE - INTERVAL '30 days'`,
    [schoolId],
  );

  res.json({
    success: true,
    data: {
      ...stats.rows[0],
      currentAcademicYear: currentYear.rows[0] || null,
      recentEnrollments: parseInt(recentEnrollments.rows[0].count),
    },
  });
};

const getDashboardStats = async (req, res) => {
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  if (!schoolId) {
    throw new AppError("School ID is required", 400);
  }

  // Get students count
  const studentsResult = await db.query(
    "SELECT COUNT(*) as count FROM students WHERE school_id = $1 AND status = $2",
    [schoolId, "active"],
  );

  // Get teachers count
  const teachersResult = await db.query(
    "SELECT COUNT(*) as count FROM teachers WHERE school_id = $1 AND status = $2",
    [schoolId, "active"],
  );

  // Get classes count
  const classesResult = await db.query(
    "SELECT COUNT(*) as count FROM classes WHERE school_id = $1",
    [schoolId],
  );

  // Get users count
  const usersResult = await db.query(
    "SELECT COUNT(*) as count FROM users WHERE school_id = $1 AND is_active = true",
    [schoolId],
  );

  // Get gender distribution
  const genderResult = await db.query(
    `SELECT 
      gender,
      COUNT(*) as count
     FROM students 
     WHERE school_id = $1 AND status = 'active'
     GROUP BY gender`,
    [schoolId],
  );

  const genderDistribution = {
    male: 0,
    female: 0,
  };

  genderResult.rows.forEach((row) => {
    genderDistribution[row.gender] = parseInt(row.count);
  });

  // Get current academic year
  const academicYearResult = await db.query(
    `SELECT year_name, start_date, end_date 
     FROM academic_years 
     WHERE school_id = $1 AND is_current = true
     LIMIT 1`,
    [schoolId],
  );

  res.json({
    success: true,
    data: {
      students: parseInt(studentsResult.rows[0].count),
      teachers: parseInt(teachersResult.rows[0].count),
      classes: parseInt(classesResult.rows[0].count),
      users: parseInt(usersResult.rows[0].count),
      genderDistribution,
      currentAcademicYear: academicYearResult.rows[0] || null,
    },
  });
};

// Create school admin
const createSchoolAdmin = async (req, res) => {
  const { schoolId } = req.params;
  const { email, password, firstName, lastName, phone } = req.body;

  // Only super admin can create school admins
  if (req.user.role !== "super_admin") {
    throw new AppError("Only super admin can create school admins", 403);
  }

  // Check if school exists
  const schoolResult = await db.query("SELECT id FROM schools WHERE id = $1", [
    schoolId,
  ]);

  if (schoolResult.rows.length === 0) {
    throw new AppError("School not found", 404);
  }

  // Check if user with email already exists
  const existingUser = await db.query("SELECT id FROM users WHERE email = $1", [
    email,
  ]);

  if (existingUser.rows.length > 0) {
    throw new AppError("User with this email already exists", 409);
  }

  const bcrypt = require("bcryptjs");
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user with admin role
  const result = await db.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, role, school_id, is_active)
   VALUES ($1, $2, $3, $4, $5, 'school_admin', $6, true)
   RETURNING id, email, first_name, last_name, phone, role, school_id, is_active, created_at`,
    [email, hashedPassword, firstName, lastName, phone, schoolId],
  );

  res.status(201).json({
    success: true,
    message: "School admin created successfully",
    data: result.rows[0],
  });
};

// Get school admins
const getSchoolAdmins = async (req, res) => {
  const { schoolId } = req.params;

  const result = await db.query(
    `SELECT id, email, first_name, last_name, phone, is_active, created_at
   FROM users
   WHERE school_id = $1 AND role = 'school_admin'
   ORDER BY created_at DESC`,
    [schoolId],
  );

  res.json({
    success: true,
    data: result.rows,
  });
};

module.exports = {
  createSchool,
  getSchools,
  getSchoolById,
  updateSchool,
  deleteSchool,
  getSchoolDashboard,
  getDashboardStats,
  createSchoolAdmin,
  getSchoolAdmins,
};
