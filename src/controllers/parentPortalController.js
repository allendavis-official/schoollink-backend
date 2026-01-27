const db = require("../config/database");
const { AppError } = require("../middleware/errorHandler");

// Get parent's children
const getMyChildren = async (req, res) => {
  const parentUserId = req.user.id;

  // Get parent record
  const parentResult = await db.query(
    "SELECT id, school_id FROM parents WHERE user_id = $1",
    [parentUserId],
  );

  if (parentResult.rows.length === 0) {
    throw new AppError("Parent record not found", 404);
  }

  const parent = parentResult.rows[0];

  // Get all children linked to this parent
  const childrenResult = await db.query(
    `SELECT s.*, sp.relationship, sp.is_primary,
            c.class_name, ay.year_name as academic_year
     FROM students s
     JOIN student_parents sp ON s.id = sp.student_id
     LEFT JOIN student_enrollments se ON s.id = se.student_id AND se.status = 'enrolled'
     LEFT JOIN classes c ON se.class_id = c.id
     LEFT JOIN academic_years ay ON se.academic_year_id = ay.id
     WHERE sp.parent_id = $1
     ORDER BY sp.is_primary DESC, s.first_name`,
    [parent.id],
  );

  res.json({
    success: true,
    data: childrenResult.rows,
  });
};

// Get child's grades
const getChildGrades = async (req, res) => {
  const { studentId } = req.params;
  const { academicYearId } = req.query;
  const parentUserId = req.user.id;

  // Verify parent has access to this student
  const accessCheck = await db.query(
    `SELECT sp.id FROM student_parents sp
     JOIN parents p ON sp.parent_id = p.id
     WHERE p.user_id = $1 AND sp.student_id = $2`,
    [parentUserId, studentId],
  );

  if (accessCheck.rows.length === 0) {
    throw new AppError("Access denied to this student", 403);
  }

  // Get grades with subject details
  const gradesResult = await db.query(
    `SELECT sg.*, s.subject_name, s.subject_code,
            ap.period_number, ap.period_name,
            sem.semester_number, sem.semester_name,
            ay.year_name
     FROM student_grades sg
     JOIN subjects s ON sg.subject_id = s.id
     JOIN assessment_periods ap ON sg.assessment_period_id = ap.id
     JOIN semesters sem ON ap.semester_id = sem.id
     JOIN academic_years ay ON sg.academic_year_id = ay.id
     WHERE sg.student_id = $1 
     ${academicYearId ? "AND sg.academic_year_id = $2" : ""}
     ORDER BY ay.year_name DESC, sem.semester_number, ap.period_number, s.subject_name`,
    academicYearId ? [studentId, academicYearId] : [studentId],
  );

  // Get averages
  const averagesResult = await db.query(
    `SELECT sa.*, s.subject_name, ay.year_name
     FROM student_averages sa
     JOIN subjects s ON sa.subject_id = s.id
     JOIN academic_years ay ON sa.academic_year_id = ay.id
     WHERE sa.student_id = $1
     ${academicYearId ? "AND sa.academic_year_id = $2" : ""}
     ORDER BY ay.year_name DESC`,
    academicYearId ? [studentId, academicYearId] : [studentId],
  );

  res.json({
    success: true,
    data: {
      grades: gradesResult.rows,
      averages: averagesResult.rows,
    },
  });
};

// Get child's attendance
const getChildAttendance = async (req, res) => {
  const { studentId } = req.params;
  const { startDate, endDate, academicYearId } = req.query;
  const parentUserId = req.user.id;

  // Verify parent has access to this student
  const accessCheck = await db.query(
    `SELECT sp.id FROM student_parents sp
     JOIN parents p ON sp.parent_id = p.id
     WHERE p.user_id = $1 AND sp.student_id = $2`,
    [parentUserId, studentId],
  );

  if (accessCheck.rows.length === 0) {
    throw new AppError("Access denied to this student", 403);
  }

  // Build query
  let query = `
    SELECT a.*, c.class_name,
           u.first_name || ' ' || u.last_name as marked_by_name
    FROM attendance a
    LEFT JOIN classes c ON a.class_id = c.id
    LEFT JOIN users u ON a.marked_by = u.id
    WHERE a.student_id = $1
  `;

  const params = [studentId];
  let paramCount = 1;

  if (academicYearId) {
    paramCount++;
    query += ` AND a.academic_year_id = $${paramCount}`;
    params.push(academicYearId);
  }

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

  const attendanceResult = await db.query(query, params);

  // Calculate statistics
  const statsQuery = `
    SELECT 
      COUNT(*) as total_days,
      COUNT(*) FILTER (WHERE status = 'present') as present_days,
      COUNT(*) FILTER (WHERE status = 'absent') as absent_days,
      COUNT(*) FILTER (WHERE status = 'late') as late_days,
      COUNT(*) FILTER (WHERE status = 'excused') as excused_days
    FROM attendance
    WHERE student_id = $1
    ${academicYearId ? `AND academic_year_id = $${params.length + 1}` : ""}
    ${startDate ? `AND attendance_date >= $${params.length + (academicYearId ? 2 : 1)}` : ""}
    ${endDate ? `AND attendance_date <= $${params.length + (academicYearId ? 2 : 1) + (startDate ? 1 : 0)}` : ""}
  `;

  const statsParams = [studentId];
  if (academicYearId) statsParams.push(academicYearId);
  if (startDate) statsParams.push(startDate);
  if (endDate) statsParams.push(endDate);

  const statsResult = await db.query(statsQuery, statsParams);
  const stats = statsResult.rows[0];

  const attendancePercentage =
    stats.total_days > 0
      ? (
          (parseInt(stats.present_days) / parseInt(stats.total_days)) *
          100
        ).toFixed(1)
      : 0;

  res.json({
    success: true,
    data: {
      records: attendanceResult.rows,
      statistics: {
        ...stats,
        attendancePercentage,
      },
    },
  });
};

// Get child's fees
const getChildFees = async (req, res) => {
  const { studentId } = req.params;
  const { academicYearId } = req.query;
  const parentUserId = req.user.id;

  // Verify parent has access to this student
  const accessCheck = await db.query(
    `SELECT sp.id FROM student_parents sp
     JOIN parents p ON sp.parent_id = p.id
     WHERE p.user_id = $1 AND sp.student_id = $2`,
    [parentUserId, studentId],
  );

  if (accessCheck.rows.length === 0) {
    throw new AppError("Access denied to this student", 403);
  }

  // Get student fees
  const feesResult = await db.query(
    `SELECT sf.*, ft.fee_name, ft.description, ay.year_name
     FROM student_fees sf
     JOIN fee_structures fs ON sf.fee_structure_id = fs.id
     JOIN fee_types ft ON fs.fee_type_id = ft.id
     JOIN academic_years ay ON sf.academic_year_id = ay.id
     WHERE sf.student_id = $1
     ${academicYearId ? "AND sf.academic_year_id = $2" : ""}
     ORDER BY ay.year_name DESC, ft.fee_name`,
    academicYearId ? [studentId, academicYearId] : [studentId],
  );

  // Get payment history
  const paymentsResult = await db.query(
    `SELECT fp.*, ft.fee_name,
            u.first_name || ' ' || u.last_name as recorded_by_name
     FROM fee_payments fp
     JOIN student_fees sf ON fp.student_fee_id = sf.id
     JOIN fee_structures fs ON sf.fee_structure_id = fs.id
     JOIN fee_types ft ON fs.fee_type_id = ft.id
     LEFT JOIN users u ON fp.recorded_by = u.id
     WHERE fp.student_id = $1
     ${academicYearId ? "AND sf.academic_year_id = $2" : ""}
     ORDER BY fp.payment_date DESC`,
    academicYearId ? [studentId, academicYearId] : [studentId],
  );

  // Calculate totals
  let totalDue = 0;
  let totalPaid = 0;

  feesResult.rows.forEach((fee) => {
    totalDue += parseFloat(fee.amount_due);
    totalPaid += parseFloat(fee.amount_paid);
  });

  const totalBalance = totalDue - totalPaid;

  res.json({
    success: true,
    data: {
      fees: feesResult.rows,
      payments: paymentsResult.rows,
      summary: {
        totalDue,
        totalPaid,
        totalBalance,
      },
    },
  });
};

// Get child's report card
const getChildReportCard = async (req, res) => {
  const { studentId, academicYearId } = req.params;
  const parentUserId = req.user.id;

  // Verify parent has access to this student
  const accessCheck = await db.query(
    `SELECT sp.id, s.school_id FROM student_parents sp
     JOIN parents p ON sp.parent_id = p.id
     JOIN students s ON sp.student_id = s.id
     WHERE p.user_id = $1 AND sp.student_id = $2`,
    [parentUserId, studentId],
  );

  if (accessCheck.rows.length === 0) {
    throw new AppError("Access denied to this student", 403);
  }

  const schoolId = accessCheck.rows[0].school_id;

  // Use the existing report card generation logic
  const reportCardController = require("./reportCardController");

  // Call the internal report card data function
  const reportCardData = await reportCardController.getReportCardDataInternal(
    studentId,
    academicYearId,
    schoolId,
  );

  res.json({
    success: true,
    data: reportCardData,
  });
};

module.exports = {
  getMyChildren,
  getChildGrades,
  getChildAttendance,
  getChildFees,
  getChildReportCard,
};
