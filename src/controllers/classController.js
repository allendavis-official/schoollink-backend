const db = require("../config/database");
const { AppError } = require("../middleware/errorHandler");

// Create class
const createClass = async (req, res) => {
  const {
    className,
    classLevel,
    classType,
    capacity,
    classTeacherId,
    academicYearId,
  } = req.body;
  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;

  // Convert empty strings to null for optional integer fields
  const finalCapacity = capacity && capacity !== "" ? parseInt(capacity) : null;
  const finalClassTeacherId =
    classTeacherId && classTeacherId !== "" ? classTeacherId : null;

  const result = await db.query(
    `INSERT INTO classes (school_id, class_name, class_level, class_type, capacity, class_teacher_id, academic_year_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      schoolId,
      className,
      parseInt(classLevel),
      classType,
      finalCapacity,
      finalClassTeacherId,
      academicYearId,
    ]
  );

  res.status(201).json({
    success: true,
    message: "Class created successfully",
    data: result.rows[0],
  });
};

// Update class
const updateClass = async (req, res) => {
  const { id } = req.params;
  const { className, classLevel, classType, capacity, classTeacherId } =
    req.body;
  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;

  // Verify class belongs to the school
  const checkResult = await db.query(
    "SELECT id FROM classes WHERE id = $1 AND school_id = $2",
    [id, schoolId]
  );

  if (checkResult.rows.length === 0) {
    throw new AppError(
      "Class not found or does not belong to your school",
      404
    );
  }

  // Convert empty strings to null for optional integer fields
  const finalCapacity = capacity && capacity !== "" ? parseInt(capacity) : null;
  const finalClassTeacherId =
    classTeacherId && classTeacherId !== "" ? classTeacherId : null;

  const result = await db.query(
    `UPDATE classes 
     SET class_name = $1, class_level = $2, class_type = $3, capacity = $4, 
         class_teacher_id = $5, updated_at = CURRENT_TIMESTAMP
     WHERE id = $6
     RETURNING *`,
    [
      className,
      parseInt(classLevel),
      classType,
      finalCapacity,
      finalClassTeacherId,
      id,
    ]
  );

  res.json({
    success: true,
    message: "Class updated successfully",
    data: result.rows[0],
  });
};

// Get classes
const getClasses = async (req, res) => {
  const { academicYearId } = req.query;
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  let query = `
    SELECT c.*, 
      u.first_name || ' ' || u.last_name as class_teacher_name,
      ay.year_name,
      (SELECT COUNT(*) FROM student_enrollments WHERE class_id = c.id AND status = 'enrolled') as student_count
    FROM classes c
    LEFT JOIN users u ON c.class_teacher_id = u.id
    LEFT JOIN academic_years ay ON c.academic_year_id = ay.id
    WHERE c.school_id = $1`;

  const params = [schoolId];

  if (academicYearId) {
    query += " AND c.academic_year_id = $2";
    params.push(academicYearId);
  }

  query += " ORDER BY c.class_level, c.class_name";

  const result = await db.query(query, params);

  res.json({
    success: true,
    data: result.rows,
  });
};

// Get class by ID with full details
const getClassById = async (req, res) => {
  const { id } = req.params;
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  // Get class basic info
  const classResult = await db.query(
    `SELECT 
      c.*,
      ay.year_name as academic_year_name,
      CONCAT(u.first_name, ' ', u.last_name) as class_teacher_name,
      u.email as class_teacher_email
     FROM classes c
     LEFT JOIN academic_years ay ON c.academic_year_id = ay.id
     LEFT JOIN users u ON c.class_teacher_id = u.id
     WHERE c.id = $1 AND c.school_id = $2`,
    [id, schoolId]
  );

  if (classResult.rows.length === 0) {
    throw new AppError("Class not found", 404);
  }

  const classData = classResult.rows[0];

  // Get enrolled students
  const studentsResult = await db.query(
    `SELECT 
      s.id,
      s.student_id,
      s.first_name,
      s.last_name,
      s.gender,
      s.date_of_birth,
      se.enrollment_date,
      se.status as enrollment_status
     FROM student_enrollments se
     JOIN students s ON se.student_id = s.id
     WHERE se.class_id = $1 AND se.status = 'enrolled'
     ORDER BY s.first_name, s.last_name`,
    [id]
  );

  // Get assigned subjects
  const subjectsResult = await db.query(
    `SELECT 
      cs.id,
      cs.subject_id,
      s.subject_name,
      s.subject_code,
      s.is_core,
      CONCAT(u.first_name, ' ', u.last_name) as teacher_name,
      u.email as teacher_email
     FROM class_subjects cs
     JOIN subjects s ON cs.subject_id = s.id
     LEFT JOIN users u ON cs.teacher_id = u.id
     WHERE cs.class_id = $1
     ORDER BY s.subject_name`,
    [id]
  );

  // Calculate statistics
  const enrolledCount = studentsResult.rows.length;
  const capacity = classData.capacity || 0;
  const capacityPercentage =
    capacity > 0 ? Math.round((enrolledCount / capacity) * 100) : 0;

  res.json({
    success: true,
    data: {
      ...classData,
      students: studentsResult.rows,
      subjects: subjectsResult.rows,
      statistics: {
        enrolledCount,
        capacity,
        capacityPercentage,
        subjectCount: subjectsResult.rows.length,
      },
    },
  });
};

// Delete class
const deleteClass = async (req, res) => {
  const { id } = req.params;

  // For super admin, skip school check; for others, verify school ownership
  if (req.user.role !== "super_admin") {
    const schoolId = req.user.schoolId;

    // Verify class belongs to the school
    const checkResult = await db.query(
      "SELECT id FROM classes WHERE id = $1 AND school_id = $2",
      [id, schoolId]
    );

    if (checkResult.rows.length === 0) {
      throw new AppError(
        "Class not found or does not belong to your school",
        404
      );
    }
  } else {
    // For super admin, just verify class exists
    const checkResult = await db.query("SELECT id FROM classes WHERE id = $1", [
      id,
    ]);

    if (checkResult.rows.length === 0) {
      throw new AppError("Class not found", 404);
    }
  }

  // Check if there are students enrolled in this class
  const enrollmentCheck = await db.query(
    "SELECT COUNT(*) as count FROM student_enrollments WHERE class_id = $1 AND status = 'enrolled'",
    [id]
  );

  if (parseInt(enrollmentCheck.rows[0].count) > 0) {
    throw new AppError(
      "Cannot delete class with enrolled students. Please move students first.",
      400
    );
  }

  // Delete the class (this will cascade delete class_subjects due to foreign key)
  await db.query("DELETE FROM classes WHERE id = $1", [id]);

  res.json({
    success: true,
    message: "Class deleted successfully",
  });
};

// Create subject
const createSubject = async (req, res) => {
  const { subjectName, subjectCode, description, isCore } = req.body;
  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;

  const result = await db.query(
    `INSERT INTO subjects (school_id, subject_name, subject_code, description, is_core)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [schoolId, subjectName, subjectCode, description, isCore !== false]
  );

  res.status(201).json({
    success: true,
    message: "Subject created successfully",
    data: result.rows[0],
  });
};

// Get subjects
const getSubjects = async (req, res) => {
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  const result = await db.query(
    `SELECT s.*,
      (SELECT COUNT(*) FROM teacher_subjects WHERE subject_id = s.id) as teacher_count
     FROM subjects s 
     WHERE s.school_id = $1 
     ORDER BY s.subject_name`,
    [schoolId]
  );

  res.json({
    success: true,
    data: result.rows,
  });
};

// Update subject
const updateSubject = async (req, res) => {
  const { id } = req.params;
  const { subjectName, subjectCode, description, isCore } = req.body;
  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;

  // Verify subject belongs to the school
  const checkResult = await db.query(
    "SELECT id FROM subjects WHERE id = $1 AND school_id = $2",
    [id, schoolId]
  );

  if (checkResult.rows.length === 0) {
    throw new AppError(
      "Subject not found or does not belong to your school",
      404
    );
  }

  // Check if subject code is being changed and if it already exists
  const existing = await db.query(
    "SELECT id FROM subjects WHERE school_id = $1 AND subject_code = $2 AND id != $3",
    [schoolId, subjectCode, id]
  );

  if (existing.rows.length > 0) {
    throw new AppError("A subject with this code already exists", 409);
  }

  const result = await db.query(
    `UPDATE subjects 
     SET subject_name = $1, subject_code = $2, description = $3, is_core = $4, updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [subjectName, subjectCode, description || null, isCore !== false, id]
  );

  res.json({
    success: true,
    message: "Subject updated successfully",
    data: result.rows[0],
  });
};

// Delete subject
const deleteSubject = async (req, res) => {
  const { id } = req.params;

  // For super admin, skip school check; for others, verify school ownership
  if (req.user.role !== "super_admin") {
    const schoolId = req.user.schoolId;

    // Verify subject belongs to the school
    const checkResult = await db.query(
      "SELECT id FROM subjects WHERE id = $1 AND school_id = $2",
      [id, schoolId]
    );

    if (checkResult.rows.length === 0) {
      throw new AppError(
        "Subject not found or does not belong to your school",
        404
      );
    }
  } else {
    // For super admin, just verify subject exists
    const checkResult = await db.query(
      "SELECT id FROM subjects WHERE id = $1",
      [id]
    );

    if (checkResult.rows.length === 0) {
      throw new AppError("Subject not found", 404);
    }
  }

  // Check if subject is assigned to any classes
  const assignmentCheck = await db.query(
    "SELECT COUNT(*) as count FROM class_subjects WHERE subject_id = $1",
    [id]
  );

  if (parseInt(assignmentCheck.rows[0].count) > 0) {
    throw new AppError(
      "Cannot delete subject that is assigned to classes. Please remove it from all classes first.",
      400
    );
  }

  // Delete the subject
  await db.query("DELETE FROM subjects WHERE id = $1", [id]);

  res.json({
    success: true,
    message: "Subject deleted successfully",
  });
};

// Assign subject to class
// const assignSubjectToClass = async (req, res) => {
//   const { classId, subjectId, teacherId, academicYearId } = req.body;
//   const schoolId = req.user.schoolId;

//   const result = await db.query(
//     `INSERT INTO class_subjects (school_id, class_id, subject_id, teacher_id, academic_year_id)
//      VALUES ($1, $2, $3, $4, $5) RETURNING *`,
//     [schoolId, classId, subjectId, teacherId, academicYearId]
//   );

//   res.status(201).json({
//     success: true,
//     message: "Subject assigned successfully",
//     data: result.rows[0],
//   });
// };

// Get class subjects
// const getClassSubjects = async (req, res) => {
//   const { classId } = req.params;

//   const result = await db.query(
//     `
//     SELECT cs.*, s.subject_name, s.subject_code, s.is_core,
//       u.first_name || ' ' || u.last_name as teacher_name
//     FROM class_subjects cs
//     JOIN subjects s ON cs.subject_id = s.id
//     LEFT JOIN users u ON cs.teacher_id = u.id
//     WHERE cs.class_id = $1
//     ORDER BY s.subject_name
//   `,
//     [classId]
//   );

//   res.json({
//     success: true,
//     data: result.rows,
//   });
// };

// Get subjects for a class
const getClassSubjects = async (req, res) => {
  const { classId } = req.params;

  const result = await db.query(
    `SELECT 
      cs.id,
      cs.subject_id,
      cs.teacher_id,
      s.subject_name,
      s.subject_code,
      s.is_core,
      CONCAT(u.first_name, ' ', u.last_name) as teacher_name
     FROM class_subjects cs
     JOIN subjects s ON cs.subject_id = s.id
     LEFT JOIN users u ON cs.teacher_id = u.id
     WHERE cs.class_id = $1
     ORDER BY s.subject_name`,
    [classId]
  );

  res.json({
    success: true,
    data: result.rows,
  });
};

// Assign subject to class
// Assign subject to class
const assignSubjectToClass = async (req, res) => {
  const { classId } = req.params;
  const { subjectId, teacherId } = req.body;
  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;

  if (!schoolId) {
    throw new AppError("School ID is required", 400);
  }

  // Verify the class belongs to the school
  const classCheck = await db.query(
    "SELECT id FROM classes WHERE id = $1 AND school_id = $2",
    [classId, schoolId]
  );

  if (classCheck.rows.length === 0) {
    throw new AppError(
      "Class not found or does not belong to your school",
      404
    );
  }

  // Verify the subject belongs to the school
  const subjectCheck = await db.query(
    "SELECT id FROM subjects WHERE id = $1 AND school_id = $2",
    [subjectId, schoolId]
  );

  if (subjectCheck.rows.length === 0) {
    throw new AppError(
      "Subject not found or does not belong to your school",
      404
    );
  }

  // Check if already assigned
  const existing = await db.query(
    "SELECT id FROM class_subjects WHERE class_id = $1 AND subject_id = $2",
    [classId, subjectId]
  );

  if (existing.rows.length > 0) {
    throw new AppError("This subject is already assigned to this class", 409);
  }

  // Assign the subject
  const result = await db.query(
    `INSERT INTO class_subjects (class_id, subject_id, teacher_id, school_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [classId, subjectId, teacherId || null, schoolId]
  );

  res.status(201).json({
    success: true,
    message: "Subject assigned successfully",
    data: result.rows[0],
  });
};

// Remove subject from class
const removeSubjectFromClass = async (req, res) => {
  const { classId, subjectId } = req.params;

  await db.query(
    "DELETE FROM class_subjects WHERE class_id = $1 AND subject_id = $2",
    [classId, subjectId]
  );

  res.json({
    success: true,
    message: "Subject removed from class",
  });
};

module.exports = {
  createClass,
  getClasses,
  getClassById,
  updateClass,
  deleteClass,
  createSubject,
  getSubjects,
  updateSubject,
  deleteSubject,
  assignSubjectToClass,
  getClassSubjects,
  getClassSubjects,
  assignSubjectToClass,
  removeSubjectFromClass,
};
