const db = require("../config/database");
const { AppError } = require("../middleware/errorHandler");

// Mark attendance for a class
const markAttendance = async (req, res) => {
  const { classId, attendanceDate, attendanceRecords } = req.body;
  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;
  const markedBy = req.user.id;

  if (
    !classId ||
    !attendanceDate ||
    !attendanceRecords ||
    !Array.isArray(attendanceRecords)
  ) {
    throw new AppError(
      "Class ID, date, and attendance records are required",
      400,
    );
  }

  // For teachers, verify they teach this class
  if (req.user.role === "teacher") {
    const accessCheck = await db.query(
      "SELECT id FROM class_subjects WHERE class_id = $1 AND teacher_id = $2",
      [classId, req.user.id],
    );

    if (accessCheck.rows.length === 0) {
      throw new AppError(
        "You do not have permission to mark attendance for this class",
        403,
      );
    }
  }

  // Get current academic year
  const yearResult = await db.query(
    "SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1",
    [schoolId],
  );

  if (yearResult.rows.length === 0) {
    throw new AppError("No active academic year found", 404);
  }

  const academicYearId = yearResult.rows[0].id;

  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Process each attendance record
    for (const record of attendanceRecords) {
      const { studentId, status, remarks } = record;

      // Check if attendance already exists for this student and date
      const existingAttendance = await client.query(
        "SELECT id FROM attendance WHERE student_id = $1 AND attendance_date = $2",
        [studentId, attendanceDate],
      );

      if (existingAttendance.rows.length > 0) {
        // Update existing record
        await client.query(
          `UPDATE attendance 
           SET status = $1, remarks = $2, marked_by = $3, updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [status, remarks, markedBy, existingAttendance.rows[0].id],
        );
      } else {
        // Insert new record
        await client.query(
          `INSERT INTO attendance 
           (student_id, class_id, school_id, academic_year_id, attendance_date, status, marked_by, remarks)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            studentId,
            classId,
            schoolId,
            academicYearId,
            attendanceDate,
            status,
            markedBy,
            remarks,
          ],
        );
      }
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Attendance marked successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Get attendance for a class on a specific date
const getClassAttendance = async (req, res) => {
  const { classId, date } = req.query;
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  if (!classId || !date) {
    throw new AppError("Class ID and date are required", 400);
  }

  // For teachers, verify they teach this class
  if (req.user.role === "teacher") {
    const accessCheck = await db.query(
      "SELECT id FROM class_subjects WHERE class_id = $1 AND teacher_id = $2",
      [classId, req.user.id],
    );

    if (accessCheck.rows.length === 0) {
      throw new AppError(
        "You do not have permission to view attendance for this class",
        403,
      );
    }
  }

  // Get all students in the class with their attendance for the date
  const result = await db.query(
    `SELECT 
      s.id,
      s.student_id,
      s.first_name,
      s.last_name,
      a.status,
      a.remarks,
      a.marked_at,
      CONCAT(u.first_name, ' ', u.last_name) as marked_by_name
    FROM students s
    JOIN student_enrollments se ON s.id = se.student_id
    LEFT JOIN attendance a ON s.id = a.student_id AND a.attendance_date = $1
    LEFT JOIN users u ON a.marked_by = u.id
    WHERE se.class_id = $2 
      AND se.status = 'enrolled'
      AND s.school_id = $3
    ORDER BY s.first_name, s.last_name`,
    [date, classId, schoolId],
  );

  res.json({
    success: true,
    data: result.rows,
  });
};

// Get attendance report for a student
const getStudentAttendanceReport = async (req, res) => {
  const { studentId } = req.params;
  const { startDate, endDate } = req.query;
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  let query = `
    SELECT 
      a.attendance_date,
      a.status,
      a.remarks,
      c.class_name,
      CONCAT(u.first_name, ' ', u.last_name) as marked_by_name
    FROM attendance a
    JOIN classes c ON a.class_id = c.id
    JOIN users u ON a.marked_by = u.id
    WHERE a.student_id = $1 AND a.school_id = $2
  `;

  const params = [studentId, schoolId];
  let paramCount = 2;

  if (startDate) {
    paramCount++;
    query += ` AND a.attendance_date >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` AND a.attendance_date <= $${paramCount}`;
    params.push(endDate);
  }

  query += " ORDER BY a.attendance_date DESC";

  const result = await db.query(query, params);

  // Calculate statistics
  const stats = {
    total: result.rows.length,
    present: result.rows.filter((r) => r.status === "present").length,
    absent: result.rows.filter((r) => r.status === "absent").length,
    late: result.rows.filter((r) => r.status === "late").length,
    excused: result.rows.filter((r) => r.status === "excused").length,
  };

  stats.presentPercentage =
    stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(2) : 0;

  res.json({
    success: true,
    data: {
      records: result.rows,
      statistics: stats,
    },
  });
};

// Get attendance summary for a class
const getClassAttendanceSummary = async (req, res) => {
  const { classId } = req.params;
  const { startDate, endDate } = req.query;
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  // For teachers, verify they teach this class
  if (req.user.role === "teacher") {
    const accessCheck = await db.query(
      "SELECT id FROM class_subjects WHERE class_id = $1 AND teacher_id = $2",
      [classId, req.user.id],
    );

    if (accessCheck.rows.length === 0) {
      throw new AppError(
        "You do not have permission to view attendance for this class",
        403,
      );
    }
  }

  let query = `
    SELECT 
      s.id,
      s.student_id,
      s.first_name,
      s.last_name,
      COUNT(a.id) as total_days,
      SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present_days,
      SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_days,
      SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) as late_days,
      SUM(CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END) as excused_days
    FROM students s
    JOIN student_enrollments se ON s.id = se.student_id
    LEFT JOIN attendance a ON s.id = a.student_id AND a.class_id = $1 AND a.school_id = $2
  `;

  const params = [classId, schoolId];
  let paramCount = 2;

  if (startDate) {
    paramCount++;
    query += ` AND a.attendance_date >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` AND a.attendance_date <= $${paramCount}`;
    params.push(endDate);
  }

  query += `
    WHERE se.class_id = $1 AND se.status = 'enrolled' AND s.school_id = $2
    GROUP BY s.id, s.student_id, s.first_name, s.last_name
    ORDER BY s.first_name, s.last_name
  `;

  const result = await db.query(query, params);

  // Calculate percentage for each student
  const studentsWithPercentage = result.rows.map((student) => ({
    ...student,
    attendance_percentage:
      student.total_days > 0
        ? (
            (parseInt(student.present_days) / parseInt(student.total_days)) *
            100
          ).toFixed(2)
        : 0,
  }));

  res.json({
    success: true,
    data: studentsWithPercentage,
  });
};

module.exports = {
  markAttendance,
  getClassAttendance,
  getStudentAttendanceReport,
  getClassAttendanceSummary,
};
