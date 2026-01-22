const db = require("../config/database");
const { AppError } = require("../middleware/errorHandler");
const bcrypt = require("bcryptjs");
const { generateId, checkIdExists } = require("../utils/idGenerator");

// Create teacher
const createTeacher = async (req, res) => {
  let {
    email,
    password,
    firstName,
    lastName,
    phone,
    teacherId,
    qualification,
    specialization,
    yearsOfExperience,
    dateOfJoining,
    employmentType,
    photoUrl,
  } = req.body;

  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;

  // Auto-generate teacher ID if not provided
  let finalTeacherId = teacherId;

  if (!finalTeacherId || finalTeacherId.trim() === "") {
    finalTeacherId = await generateId(schoolId, "teacher");
  } else {
    // Check if manually provided ID already exists
    const idExists = await checkIdExists(finalTeacherId, "teacher", schoolId);
    if (idExists) {
      throw new AppError("Teacher ID already exists", 409);
    }
  }

  // Create user account first
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password || "Teacher@123", salt);

  const client = await db.getClient();
  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `INSERT INTO users (school_id, email, password_hash, first_name, last_name, phone, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, 'teacher', true) RETURNING *`,
      [schoolId, email.toLowerCase(), passwordHash, firstName, lastName, phone],
    );

    const user = userResult.rows[0];

    const teacherResult = await client.query(
      `INSERT INTO teachers (school_id, user_id, teacher_id, qualification, specialization,
   years_of_experience, date_of_joining, employment_type, photo_url, status)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active') RETURNING *`,
      [
        schoolId,
        user.id,
        finalTeacherId,
        qualification || null,
        specialization || null,
        yearsOfExperience && yearsOfExperience !== ""
          ? parseInt(yearsOfExperience)
          : null, // FIX HERE
        dateOfJoining || new Date(),
        employmentType || "full_time",
        photoUrl || null,
      ],
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Teacher created successfully",
      data: { ...teacherResult.rows[0], user },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Get teachers
const getTeachers = async (req, res) => {
  const { page = 1, limit = 20, search, status } = req.query;
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;
  const offset = (page - 1) * limit;

  let query = `
  SELECT t.*, u.email, u.first_name, u.last_name, u.phone, u.is_active,
    (SELECT COUNT(*) FROM teacher_subjects WHERE teacher_id = t.id) as subject_count,
    (SELECT COUNT(*) FROM classes WHERE class_teacher_id = u.id) as class_teacher_count
  FROM teachers t
  JOIN users u ON t.user_id = u.id
  WHERE t.school_id = $1 AND t.status != 'terminated'`;
  const params = [schoolId];
  let paramCount = 1;

  if (search) {
    paramCount++;
    query += ` AND (u.first_name ILIKE $${paramCount} OR u.last_name ILIKE $${paramCount} OR t.teacher_id ILIKE $${paramCount})`;
    params.push(`%${search}%`);
  }

  if (status) {
    paramCount++;
    query += ` AND t.status = $${paramCount}`;
    params.push(status);
  }

  // Get count - use a simpler query without subqueries
  const countQuery = `
    SELECT COUNT(*) 
    FROM teachers t
    JOIN users u ON t.user_id = u.id
    WHERE t.school_id = $1 AND t.status != 'terminated'${
      search
        ? ` AND (u.first_name ILIKE $2 OR u.last_name ILIKE $2 OR t.teacher_id ILIKE $2)`
        : ""
    }${
      status && search
        ? ` AND t.status = $3`
        : status && !search
          ? ` AND t.status = $2`
          : ""
    }`;

  const countResult = await db.query(countQuery, params);
  const totalRecords = parseInt(countResult.rows[0].count);

  query += ` ORDER BY u.first_name, u.last_name LIMIT $${
    paramCount + 1
  } OFFSET $${paramCount + 2}`;
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

// Get teacher by ID
const getTeacherById = async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    `
  SELECT t.*, u.email, u.first_name, u.last_name, u.phone, u.is_active,
    (SELECT json_agg(json_build_object(
      'id', cs.id, 'subject', s.subject_name, 'class', c.class_name
    )) FROM class_subjects cs
    JOIN subjects s ON cs.subject_id = s.id
    JOIN classes c ON cs.class_id = c.id
    WHERE cs.teacher_id = u.id) as assigned_subjects,
    (SELECT json_agg(json_build_object(
      'id', c.id, 'className', c.class_name
    )) FROM classes c
    WHERE c.class_teacher_id = u.id) as class_teacher_of,
    (SELECT json_agg(json_build_object(
      'id', ts.id,
      'subjectId', ts.subject_id,
      'subjectName', s.subject_name,
      'subjectCode', s.subject_code
    )) FROM teacher_subjects ts
    JOIN subjects s ON ts.subject_id = s.id
    WHERE ts.teacher_id = t.id) as teaching_subjects
  FROM teachers t
  JOIN users u ON t.user_id = u.id
  WHERE t.id = $1
`,
    [id],
  );

  if (result.rows.length === 0) {
    throw new AppError("Teacher not found", 404);
  }

  if (
    req.user.role !== "super_admin" &&
    result.rows[0].school_id !== req.user.schoolId
  ) {
    throw new AppError("Access denied", 403);
  }

  res.json({
    success: true,
    data: result.rows[0],
  });
};

// Update teacher
const updateTeacher = async (req, res) => {
  const { id } = req.params;
  const updates = [];
  const values = [];
  let paramCount = 0;

  const allowedFields = {
    qualification: "qualification",
    specialization: "specialization",
    yearsOfExperience: "years_of_experience",
    employmentType: "employment_type",
    status: "status",
    photoUrl: "photo_url",
  };

  Object.keys(allowedFields).forEach((field) => {
    if (req.body[field] !== undefined) {
      paramCount++;
      updates.push(`${allowedFields[field]} = $${paramCount}`);
      values.push(req.body[field]);
    }
  });

  if (updates.length === 0) {
    throw new AppError("No fields to update", 400);
  }

  paramCount++;
  values.push(id);

  const result = await db.query(
    `UPDATE teachers SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${paramCount} RETURNING *`,
    values,
  );

  if (result.rows.length === 0) {
    throw new AppError("Teacher not found", 404);
  }

  res.json({
    success: true,
    message: "Teacher updated successfully",
    data: result.rows[0],
  });
};

// Delete teacher (soft delete)
const deleteTeacher = async (req, res) => {
  const { id } = req.params;

  // For super admin, skip school check; for others, verify school ownership
  if (req.user.role !== "super_admin") {
    const schoolId = req.user.schoolId;

    // Verify teacher belongs to the school
    const checkResult = await db.query(
      "SELECT id FROM teachers WHERE id = $1 AND school_id = $2",
      [id, schoolId],
    );

    if (checkResult.rows.length === 0) {
      throw new AppError(
        "Teacher not found or does not belong to your school",
        404,
      );
    }
  } else {
    // For super admin, just verify teacher exists
    const checkResult = await db.query(
      "SELECT id FROM teachers WHERE id = $1",
      [id],
    );

    if (checkResult.rows.length === 0) {
      throw new AppError("Teacher not found", 404);
    }
  }

  // Check if teacher is assigned to any classes as class teacher
  const classTeacherCheck = await db.query(
    "SELECT COUNT(*) as count FROM classes WHERE class_teacher_id = (SELECT user_id FROM teachers WHERE id = $1)",
    [id],
  );

  if (parseInt(classTeacherCheck.rows[0].count) > 0) {
    throw new AppError(
      "Cannot delete teacher who is a class teacher. Please reassign classes first.",
      400,
    );
  }

  // Soft delete - set status to 'terminated'
  await db.query(
    "UPDATE teachers SET status = 'terminated', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [id],
  );

  // Also deactivate the user account
  await db.query(
    "UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT user_id FROM teachers WHERE id = $1)",
    [id],
  );

  res.json({
    success: true,
    message: "Teacher deleted successfully",
  });
};

// Get subjects assigned to a teacher
const getTeacherSubjects = async (req, res) => {
  const { teacherId } = req.params;

  const result = await db.query(
    `SELECT 
      ts.id,
      ts.subject_id,
      s.subject_name,
      s.subject_code,
      s.is_core
     FROM teacher_subjects ts
     JOIN subjects s ON ts.subject_id = s.id
     WHERE ts.teacher_id = $1
     ORDER BY s.subject_name`,
    [teacherId],
  );

  res.json({
    success: true,
    data: result.rows,
  });
};

// Assign subject to teacher
const assignSubjectToTeacher = async (req, res) => {
  const { teacherId } = req.params;
  const { subjectId } = req.body;
  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;

  // Check if already assigned
  const existing = await db.query(
    "SELECT id FROM teacher_subjects WHERE teacher_id = $1 AND subject_id = $2",
    [teacherId, subjectId],
  );

  if (existing.rows.length > 0) {
    throw new AppError("This subject is already assigned to this teacher", 409);
  }

  // Assign the subject
  const result = await db.query(
    `INSERT INTO teacher_subjects (teacher_id, subject_id, school_id)
     VALUES ($1, $2, $3) RETURNING *`,
    [teacherId, subjectId, schoolId],
  );

  res.status(201).json({
    success: true,
    message: "Subject assigned to teacher successfully",
    data: result.rows[0],
  });
};

// Remove subject from teacher
const removeSubjectFromTeacher = async (req, res) => {
  const { teacherId, subjectId } = req.params;

  await db.query(
    "DELETE FROM teacher_subjects WHERE teacher_id = $1 AND subject_id = $2",
    [teacherId, subjectId],
  );

  res.json({
    success: true,
    message: "Subject removed from teacher successfully",
  });
};

module.exports = {
  createTeacher,
  getTeachers,
  getTeacherById,
  updateTeacher,
  deleteTeacher,
  getTeacherSubjects,
  assignSubjectToTeacher,
  removeSubjectFromTeacher,
};
