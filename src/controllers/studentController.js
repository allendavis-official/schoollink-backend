const db = require("../config/database");
const { AppError } = require("../middleware/errorHandler");
const { generateId, checkIdExists } = require("../utils/idGenerator");

// Create student
const createStudent = async (req, res) => {
  let {
    schoolId,
    studentId,
    firstName,
    middleName,
    lastName,
    dateOfBirth,
    gender,
    address,
    city,
    county,
    guardianName, // Frontend sends this
    guardianPhone, // Frontend sends this
    guardianEmail, // Frontend sends this (not used in DB yet)
    guardianRelationship, // Frontend sends this
    emergencyContactName, // Backend column name
    emergencyContactPhone, // Backend column name
    emergencyContactRelationship, // Backend column name
    medicalNotes,
    bloodGroup,
    allergies,
    previousSchool,
    transferDate,
    admissionDate,
    photoUrl,
    classId, // Frontend sends this for enrollment
  } = req.body;

  const finalSchoolId =
    req.user.role === "super_admin" ? schoolId : req.user.schoolId;

  // Auto-generate student ID if not provided
  let finalStudentId = studentId;

  if (!finalStudentId || finalStudentId.trim() === "") {
    finalStudentId = await generateId(finalSchoolId, "student");
  } else {
    // Check if manually provided ID already exists
    const idExists = await checkIdExists(
      finalStudentId,
      "student",
      finalSchoolId,
    );
    if (idExists) {
      throw new AppError("Student ID already exists", 409);
    }
  }

  // Map guardian fields to emergency contact fields (frontend uses "guardian", DB uses "emergency_contact")
  const finalEmergencyName = emergencyContactName || guardianName;
  const finalEmergencyPhone = emergencyContactPhone || guardianPhone;
  const finalEmergencyRelationship =
    emergencyContactRelationship || guardianRelationship;

  // If classId is provided, use transaction to create enrollment
  if (classId) {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      // Create student
      const result = await client.query(
        `INSERT INTO students (
          school_id, student_id, first_name, middle_name, last_name, date_of_birth, gender,
          address, city, county, emergency_contact_name, emergency_contact_phone,
          emergency_contact_relationship, medical_notes, blood_group, allergies,
          previous_school, transfer_date, admission_date, photo_url, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'active')
        RETURNING *`,
        [
          finalSchoolId,
          finalStudentId,
          firstName,
          middleName,
          lastName,
          dateOfBirth,
          gender,
          address,
          city || "Monrovia",
          county,
          finalEmergencyName,
          finalEmergencyPhone,
          finalEmergencyRelationship,
          medicalNotes,
          bloodGroup,
          allergies,
          previousSchool,
          transferDate,
          admissionDate || new Date(),
          photoUrl,
        ],
      );

      const newStudent = result.rows[0];

      // Get current academic year
      const academicYearResult = await client.query(
        "SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1",
        [finalSchoolId],
      );

      if (academicYearResult.rows.length > 0) {
        // Create enrollment with status 'enrolled' (matches getStudents query)
        await client.query(
          `INSERT INTO student_enrollments (school_id, student_id, class_id, academic_year_id, enrollment_date, status)
           VALUES ($1, $2, $3, $4, $5, 'enrolled')`,
          [
            finalSchoolId,
            newStudent.id,
            classId,
            academicYearResult.rows[0].id,
            admissionDate || new Date(),
          ],
        );
      }

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Student created successfully",
        data: newStudent,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } else {
    // No class assignment - simple insert
    const result = await db.query(
      `INSERT INTO students (
        school_id, student_id, first_name, middle_name, last_name, date_of_birth, gender,
        address, city, county, emergency_contact_name, emergency_contact_phone,
        emergency_contact_relationship, medical_notes, blood_group, allergies,
        previous_school, transfer_date, admission_date, photo_url, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'active')
      RETURNING *`,
      [
        finalSchoolId,
        finalStudentId,
        firstName,
        middleName,
        lastName,
        dateOfBirth,
        gender,
        address,
        city || "Monrovia",
        county,
        finalEmergencyName,
        finalEmergencyPhone,
        finalEmergencyRelationship,
        medicalNotes,
        bloodGroup,
        allergies,
        previousSchool,
        transferDate,
        admissionDate || new Date(),
        photoUrl,
      ],
    );

    res.status(201).json({
      success: true,
      message: "Student created successfully",
      data: result.rows[0],
    });
  }
};

// Get students
const getStudents = async (req, res) => {
  const { page = 1, limit = 20, search = "" } = req.query;
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  if (!schoolId) {
    throw new AppError("School ID is required", 400);
  }

  const offset = (page - 1) * limit;

  // Build query parameters
  let queryParams = [schoolId];
  let searchCondition = "";

  if (search && search.trim() !== "") {
    searchCondition = `AND (s.first_name ILIKE $2 OR s.last_name ILIKE $2 OR s.student_id ILIKE $2)`;
    queryParams.push(`%${search}%`);
  }

  // Get total count (excluding withdrawn students)
  const countQuery = `
    SELECT COUNT(*) as total
    FROM students s
    WHERE s.school_id = $1 AND s.status != 'withdrawn' ${searchCondition}
  `;

  const countResult = await db.query(countQuery, queryParams);
  const totalRecords = parseInt(countResult.rows[0].total);

  // Get paginated students with class enrollment info (excluding withdrawn students)
  const studentsQuery = `
    SELECT 
      s.*,
      s.emergency_contact_name as guardian_name,
      s.emergency_contact_phone as guardian_phone,
      s.emergency_contact_relationship as guardian_relationship,
      c.class_name as current_class,
      se.class_id
    FROM students s
    LEFT JOIN LATERAL (
      SELECT class_id, academic_year_id
      FROM student_enrollments 
      WHERE student_id = s.id 
        AND status = 'enrolled'
      ORDER BY enrollment_date DESC 
      LIMIT 1
    ) se ON true
    LEFT JOIN classes c ON se.class_id = c.id
    WHERE s.school_id = $1 AND s.status != 'withdrawn' ${searchCondition}
    ORDER BY s.created_at DESC
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
  `;

  const studentsResult = await db.query(studentsQuery, [
    ...queryParams,
    limit,
    offset,
  ]);

  res.json({
    success: true,
    data: studentsResult.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalRecords: totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
    },
  });
};

// Get student by ID
const getStudentById = async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    `
    SELECT s.*, 
      (SELECT json_agg(json_build_object(
        'id', c.id, 'className', c.class_name, 'academicYear', ay.year_name,
        'enrollmentDate', se.enrollment_date, 'status', se.status
      )) FROM student_enrollments se
      JOIN classes c ON se.class_id = c.id
      JOIN academic_years ay ON se.academic_year_id = ay.id
      WHERE se.student_id = s.id) as enrollments,
      (SELECT json_agg(json_build_object(
        'id', p.id, 'firstName', p.first_name, 'lastName', p.last_name,
        'relationship', sp.relationship, 'phone', p.phone, 'email', p.email
      )) FROM student_parents sp
      JOIN parents p ON sp.parent_id = p.id
      WHERE sp.student_id = s.id) as parents
    FROM students s WHERE s.id = $1
  `,
    [id],
  );

  if (result.rows.length === 0) {
    throw new AppError("Student not found", 404);
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

// Update student
const updateStudent = async (req, res) => {
  const { id } = req.params;
  const { classId, guardianName, guardianPhone, guardianRelationship } =
    req.body;
  const updates = [];
  const values = [];
  let paramCount = 0;

  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;

  // Verify student belongs to the school
  const checkResult = await db.query(
    "SELECT id FROM students WHERE id = $1 AND school_id = $2",
    [id, schoolId],
  );

  if (checkResult.rows.length === 0) {
    throw new AppError(
      "Student not found or does not belong to your school",
      404,
    );
  }

  const allowedFields = [
    "firstName",
    "middleName",
    "lastName",
    "dateOfBirth",
    "gender",
    "address",
    "city",
    "county",
    "guardianName", // Frontend sends this
    "guardianPhone", // Frontend sends this
    "guardianRelationship", // Frontend sends this
    "emergencyContactName",
    "emergencyContactPhone",
    "emergencyContactRelationship",
    "medicalNotes",
    "bloodGroup",
    "allergies",
    "status",
    "photoUrl",
  ];

  const fieldMap = {
    firstName: "first_name",
    middleName: "middle_name",
    lastName: "last_name",
    dateOfBirth: "date_of_birth",
    address: "address",
    city: "city",
    county: "county",
    guardianName: "emergency_contact_name", // Map to DB column
    guardianPhone: "emergency_contact_phone", // Map to DB column
    guardianRelationship: "emergency_contact_relationship", // Map to DB column
    emergencyContactName: "emergency_contact_name",
    emergencyContactPhone: "emergency_contact_phone",
    emergencyContactRelationship: "emergency_contact_relationship",
    medicalNotes: "medical_notes",
    bloodGroup: "blood_group",
    allergies: "allergies",
    status: "status",
    photoUrl: "photo_url",
    gender: "gender",
  };

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      paramCount++;
      updates.push(`${fieldMap[field]} = $${paramCount}`);
      values.push(req.body[field]);
    }
  });

  // If classId is provided, handle enrollment update separately
  if (classId !== undefined) {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      // Update student basic info if there are updates
      if (updates.length > 0) {
        paramCount++;
        values.push(id);

        await client.query(
          `UPDATE students SET ${updates.join(
            ", ",
          )}, updated_at = CURRENT_TIMESTAMP
           WHERE id = $${paramCount}`,
          values,
        );
      }

      // Handle class enrollment
      if (classId) {
        // Get current academic year
        const academicYearResult = await client.query(
          "SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1",
          [schoolId],
        );

        if (academicYearResult.rows.length > 0) {
          const academicYearId = academicYearResult.rows[0].id;

          // Check if enrollment exists
          const enrollmentCheck = await client.query(
            "SELECT id FROM student_enrollments WHERE student_id = $1 AND academic_year_id = $2",
            [id, academicYearId],
          );

          if (enrollmentCheck.rows.length > 0) {
            // Update existing enrollment
            await client.query(
              "UPDATE student_enrollments SET class_id = $1, updated_at = CURRENT_TIMESTAMP WHERE student_id = $2 AND academic_year_id = $3",
              [classId, id, academicYearId],
            );
          } else {
            // Create new enrollment
            await client.query(
              `INSERT INTO student_enrollments (student_id, class_id, academic_year_id, school_id, enrollment_date, status)
               VALUES ($1, $2, $3, $4, CURRENT_DATE, 'enrolled')`,
              [id, classId, academicYearId, schoolId],
            );
          }
        }
      } else {
        // If classId is empty string, remove enrollment
        const academicYearResult = await client.query(
          "SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1",
          [schoolId],
        );

        if (academicYearResult.rows.length > 0) {
          await client.query(
            "DELETE FROM student_enrollments WHERE student_id = $1 AND academic_year_id = $2",
            [id, academicYearResult.rows[0].id],
          );
        }
      }

      // Get updated student data
      const result = await client.query(
        "SELECT * FROM students WHERE id = $1",
        [id],
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Student updated successfully",
        data: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } else {
    // No class update - simple update
    if (updates.length === 0) {
      throw new AppError("No fields to update", 400);
    }

    paramCount++;
    values.push(id);

    const result = await db.query(
      `UPDATE students SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new AppError("Student not found", 404);
    }

    res.json({
      success: true,
      message: "Student updated successfully",
      data: result.rows[0],
    });
  }
};

// Enroll student in class
const enrollStudent = async (req, res) => {
  const { studentId, classId, academicYearId, enrollmentDate } = req.body;
  const schoolId = req.user.schoolId;

  // Check if already enrolled in this academic year
  const existing = await db.query(
    "SELECT id FROM student_enrollments WHERE student_id = $1 AND academic_year_id = $2",
    [studentId, academicYearId],
  );

  if (existing.rows.length > 0) {
    throw new AppError("Student already enrolled in this academic year", 409);
  }

  const result = await db.query(
    `INSERT INTO student_enrollments (school_id, student_id, class_id, academic_year_id, enrollment_date, status)
     VALUES ($1, $2, $3, $4, $5, 'enrolled') RETURNING *`,
    [
      schoolId,
      studentId,
      classId,
      academicYearId,
      enrollmentDate || new Date(),
    ],
  );

  res.status(201).json({
    success: true,
    message: "Student enrolled successfully",
    data: result.rows[0],
  });
};

// Delete student (soft delete)
const deleteStudent = async (req, res) => {
  const { id } = req.params;

  // For super admin, skip school check; for others, verify school ownership
  if (req.user.role !== "super_admin") {
    const schoolId = req.user.schoolId;

    // Verify student belongs to the school
    const checkResult = await db.query(
      "SELECT id FROM students WHERE id = $1 AND school_id = $2",
      [id, schoolId],
    );

    if (checkResult.rows.length === 0) {
      throw new AppError(
        "Student not found or does not belong to your school",
        404,
      );
    }
  } else {
    // For super admin, just verify student exists
    const checkResult = await db.query(
      "SELECT id FROM students WHERE id = $1",
      [id],
    );

    if (checkResult.rows.length === 0) {
      throw new AppError("Student not found", 404);
    }
  }

  // Soft delete - set status to 'withdrawn'
  await db.query(
    "UPDATE students SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [id],
  );

  res.json({
    success: true,
    message: "Student deleted successfully",
  });
};

module.exports = {
  createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
  enrollStudent,
};
