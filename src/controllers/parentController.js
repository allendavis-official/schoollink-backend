const db = require("../config/database");
const bcrypt = require("bcryptjs");
const { AppError } = require("../middleware/errorHandler");

// Get all parents
const getParents = async (req, res) => {
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  const result = await db.query(
    `SELECT p.*, u.email, u.is_active, u.created_at as user_created_at,
            (SELECT COUNT(*) FROM student_parents WHERE parent_id = p.id) as children_count
     FROM parents p
     LEFT JOIN users u ON p.user_id = u.id
     WHERE p.school_id = $1
     ORDER BY p.last_name, p.first_name`,
    [schoolId],
  );

  res.json({
    success: true,
    data: result.rows,
  });
};

// Get parent by ID
const getParentById = async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    `SELECT p.*, u.email, u.is_active
     FROM parents p
     LEFT JOIN users u ON p.user_id = u.id
     WHERE p.id = $1`,
    [id],
  );

  if (result.rows.length === 0) {
    throw new AppError("Parent not found", 404);
  }

  // Get linked children
  const childrenResult = await db.query(
    `SELECT s.id, s.student_id, s.first_name, s.last_name, 
            sp.relationship, sp.is_primary,
            c.class_name
     FROM students s
     JOIN student_parents sp ON s.id = sp.student_id
     LEFT JOIN student_enrollments se ON s.id = se.student_id AND se.status = 'enrolled'
     LEFT JOIN classes c ON se.class_id = c.id
     WHERE sp.parent_id = $1
     ORDER BY sp.is_primary DESC, s.first_name`,
    [id],
  );

  res.json({
    success: true,
    data: {
      parent: result.rows[0],
      children: childrenResult.rows,
    },
  });
};

// Create parent with user account
const createParent = async (req, res) => {
  const {
    email,
    password,
    firstName,
    lastName,
    phone,
    relationship,
    address,
    occupation,
    studentIds, // Array of student IDs to link
  } = req.body;

  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;

  if (!email || !password || !firstName || !lastName) {
    throw new AppError(
      "Email, password, first name, and last name are required",
      400,
    );
  }

  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Check if email already exists
    const emailCheck = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase()],
    );

    if (emailCheck.rows.length > 0) {
      throw new AppError("Email already exists", 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user account
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, school_id, is_active)
       VALUES ($1, $2, $3, $4, 'parent', $5, true)
       RETURNING id`,
      [email.toLowerCase(), passwordHash, firstName, lastName, schoolId],
    );

    const userId = userResult.rows[0].id;

    // Create parent record
    const parentResult = await client.query(
      `INSERT INTO parents (school_id, user_id, first_name, last_name, email, phone, relationship, address, occupation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        schoolId,
        userId,
        firstName,
        lastName,
        email.toLowerCase(),
        phone,
        relationship,
        address,
        occupation,
      ],
    );

    const parent = parentResult.rows[0];

    // Link to students if provided
    if (studentIds && studentIds.length > 0) {
      for (let i = 0; i < studentIds.length; i++) {
        const studentId = studentIds[i];
        const isPrimary = i === 0; // First student is primary by default

        await client.query(
          `INSERT INTO student_parents (student_id, parent_id, relationship, is_primary)
           VALUES ($1, $2, $3, $4)`,
          [studentId, parent.id, relationship || "parent", isPrimary],
        );
      }
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Parent account created successfully",
      data: parent,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Update parent
const updateParent = async (req, res) => {
  const { id } = req.params;
  const {
    firstName,
    lastName,
    phone,
    relationship,
    address,
    occupation,
    email,
  } = req.body;

  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Update parent record
    const parentResult = await client.query(
      `UPDATE parents 
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           phone = COALESCE($3, phone),
           relationship = COALESCE($4, relationship),
           address = COALESCE($5, address),
           occupation = COALESCE($6, occupation),
           email = COALESCE($7, email),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [
        firstName,
        lastName,
        phone,
        relationship,
        address,
        occupation,
        email,
        id,
      ],
    );

    if (parentResult.rows.length === 0) {
      throw new AppError("Parent not found", 404);
    }

    // Update user email if changed
    if (email) {
      await client.query(
        `UPDATE users SET email = $1 WHERE id = (SELECT user_id FROM parents WHERE id = $2)`,
        [email.toLowerCase(), id],
      );
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Parent updated successfully",
      data: parentResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Link parent to student
const linkParentToStudent = async (req, res) => {
  const { parentId } = req.params;
  const { studentId, relationship, isPrimary } = req.body;

  if (!studentId) {
    throw new AppError("Student ID is required", 400);
  }

  // Check if link already exists
  const existingLink = await db.query(
    "SELECT id FROM student_parents WHERE parent_id = $1 AND student_id = $2",
    [parentId, studentId],
  );

  if (existingLink.rows.length > 0) {
    throw new AppError("Parent is already linked to this student", 409);
  }

  const result = await db.query(
    `INSERT INTO student_parents (student_id, parent_id, relationship, is_primary)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [studentId, parentId, relationship || "parent", isPrimary || false],
  );

  res.status(201).json({
    success: true,
    message: "Parent linked to student successfully",
    data: result.rows[0],
  });
};

// Unlink parent from student
const unlinkParentFromStudent = async (req, res) => {
  const { parentId, studentId } = req.params;

  const result = await db.query(
    "DELETE FROM student_parents WHERE parent_id = $1 AND student_id = $2 RETURNING *",
    [parentId, studentId],
  );

  if (result.rows.length === 0) {
    throw new AppError("Link not found", 404);
  }

  res.json({
    success: true,
    message: "Parent unlinked from student successfully",
  });
};

// Deactivate parent account
const deactivateParent = async (req, res) => {
  const { id } = req.params;

  // Deactivate user account
  await db.query(
    `UPDATE users 
     SET is_active = false 
     WHERE id = (SELECT user_id FROM parents WHERE id = $1)`,
    [id],
  );

  res.json({
    success: true,
    message: "Parent account deactivated successfully",
  });
};

// Reactivate parent account
const reactivateParent = async (req, res) => {
  const { id } = req.params;

  // Reactivate user account
  await db.query(
    `UPDATE users 
     SET is_active = true 
     WHERE id = (SELECT user_id FROM parents WHERE id = $1)`,
    [id],
  );

  res.json({
    success: true,
    message: "Parent account reactivated successfully",
  });
};

// Reset parent password
const resetParentPassword = async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    throw new AppError("Password must be at least 6 characters", 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await db.query(
    `UPDATE users 
     SET password_hash = $1 
     WHERE id = (SELECT user_id FROM parents WHERE id = $2)`,
    [passwordHash, id],
  );

  res.json({
    success: true,
    message: "Password reset successfully",
  });
};

module.exports = {
  getParents,
  getParentById,
  createParent,
  updateParent,
  linkParentToStudent,
  unlinkParentFromStudent,
  deactivateParent,
  reactivateParent,
  resetParentPassword,
};
