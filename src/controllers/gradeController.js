const db = require("../config/database");
const { AppError } = require("../middleware/errorHandler");

// Get students with their grades for a specific class and subject
// Get students with their grades for a specific class and subject
const getClassSubjectGrades = async (req, res) => {
  const { classId, subjectId, periodId } = req.query;
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  if (!classId || !subjectId || !periodId) {
    throw new AppError("Class ID, Subject ID, and Period ID are required", 400);
  }

  // For teachers, verify they teach this subject in this class
  if (req.user.role === "teacher") {
    const accessCheck = await db.query(
      "SELECT id FROM class_subjects WHERE class_id = $1 AND subject_id = $2 AND teacher_id = $3",
      [classId, subjectId, req.user.id]
    );

    if (accessCheck.rows.length === 0) {
      throw new AppError(
        "You do not have permission to enter grades for this subject in this class",
        403
      );
    }
  }

  // Get all students enrolled in the class
  const studentsQuery = `
    SELECT 
      s.id,
      s.student_id,
      s.first_name,
      s.last_name,
      sg.id as grade_id,
      sg.score,
      sg.entered_at,
      CONCAT(u.first_name, ' ', u.last_name) as entered_by
    FROM students s
    JOIN student_enrollments se ON s.id = se.student_id
    LEFT JOIN student_grades sg ON s.id = sg.student_id 
      AND sg.subject_id = $1 
      AND sg.assessment_period_id = $2
    LEFT JOIN users u ON sg.teacher_id = u.id
    WHERE se.class_id = $3 
      AND se.status = 'enrolled'
      AND s.school_id = $4
    ORDER BY s.first_name, s.last_name
  `;

  const result = await db.query(studentsQuery, [
    subjectId,
    periodId,
    classId,
    schoolId,
  ]);

  res.json({
    success: true,
    data: result.rows,
  });
};

// Enter or update a grade
const enterGrade = async (req, res) => {
  const { studentId, classId, subjectId, assessmentPeriodId, score } = req.body;
  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;
  const teacherId = req.user.id;

  // Validate score
  if (score < 0 || score > 100) {
    throw new AppError("Score must be between 0 and 100", 400);
  }

  // Get academic year from period
  const periodResult = await db.query(
    `SELECT ay.id as academic_year_id, s.id as semester_id
     FROM assessment_periods ap
     JOIN semesters s ON ap.semester_id = s.id
     JOIN academic_years ay ON s.academic_year_id = ay.id
     WHERE ap.id = $1`,
    [assessmentPeriodId]
  );

  if (periodResult.rows.length === 0) {
    throw new AppError("Assessment period not found", 404);
  }

  const { academic_year_id, semester_id } = periodResult.rows[0];

  // Check if grade exists
  const existingGrade = await db.query(
    "SELECT id FROM student_grades WHERE student_id = $1 AND subject_id = $2 AND assessment_period_id = $3",
    [studentId, subjectId, assessmentPeriodId]
  );

  let result;

  if (existingGrade.rows.length > 0) {
    // Update existing grade
    result = await db.query(
      `UPDATE student_grades 
       SET score = $1, teacher_id = $2, entered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [score, teacherId, existingGrade.rows[0].id]
    );
  } else {
    // Insert new grade
    result = await db.query(
      `INSERT INTO student_grades 
       (student_id, class_id, subject_id, assessment_period_id, academic_year_id, school_id, score, teacher_id, entered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        studentId,
        classId,
        subjectId,
        assessmentPeriodId,
        academic_year_id,
        schoolId,
        score,
        teacherId,
      ]
    );
  }

  // Recalculate averages
  await calculateAverages(
    studentId,
    subjectId,
    academic_year_id,
    semester_id,
    schoolId
  );

  res.json({
    success: true,
    message: "Grade entered successfully",
    data: result.rows[0],
  });
};

// Calculate semester and yearly averages
const calculateAverages = async (
  studentId,
  subjectId,
  academicYearId,
  semesterId,
  schoolId
) => {
  // Get all period scores for this semester
  const periodScores = await db.query(
    `SELECT sg.score, ap.period_type
     FROM student_grades sg
     JOIN assessment_periods ap ON sg.assessment_period_id = ap.id
     WHERE sg.student_id = $1 
       AND sg.subject_id = $2 
       AND ap.semester_id = $3
       AND sg.score IS NOT NULL`,
    [studentId, subjectId, semesterId]
  );

  if (periodScores.rows.length >= 4) {
    // Calculate semester average (3 periods + 1 exam) / 4
    const total = periodScores.rows.reduce(
      (sum, row) => sum + parseFloat(row.score),
      0
    );
    const semesterAverage = total / 4;
    const gradeStatus = semesterAverage >= 70 ? "pass" : "fail";

    // Check if average record exists
    const existingAvg = await db.query(
      `SELECT id FROM student_averages 
       WHERE student_id = $1 AND subject_id = $2 AND academic_year_id = $3 AND semester_id = $4`,
      [studentId, subjectId, academicYearId, semesterId]
    );

    if (existingAvg.rows.length > 0) {
      // Update
      await db.query(
        `UPDATE student_averages 
         SET semester_average = $1, grade_status = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [semesterAverage, gradeStatus, existingAvg.rows[0].id]
      );
    } else {
      // Insert
      await db.query(
        `INSERT INTO student_averages 
         (student_id, subject_id, academic_year_id, school_id, semester_id, semester_average, grade_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          studentId,
          subjectId,
          academicYearId,
          schoolId,
          semesterId,
          semesterAverage,
          gradeStatus,
        ]
      );
    }
  }

  // Calculate yearly average if both semesters are complete
  const semesterAverages = await db.query(
    `SELECT semester_average 
     FROM student_averages
     WHERE student_id = $1 
       AND subject_id = $2 
       AND academic_year_id = $3
       AND semester_average IS NOT NULL`,
    [studentId, subjectId, academicYearId]
  );

  if (semesterAverages.rows.length === 2) {
    const yearlyAverage =
      semesterAverages.rows.reduce(
        (sum, row) => sum + parseFloat(row.semester_average),
        0
      ) / 2;
    const yearlyStatus = yearlyAverage >= 70 ? "pass" : "fail";

    // Update yearly average (set semester_id to null for yearly record)
    const yearlyRecord = await db.query(
      `SELECT id FROM student_averages 
       WHERE student_id = $1 AND subject_id = $2 AND academic_year_id = $3 AND semester_id IS NULL`,
      [studentId, subjectId, academicYearId]
    );

    if (yearlyRecord.rows.length > 0) {
      await db.query(
        `UPDATE student_averages 
         SET yearly_average = $1, grade_status = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [yearlyAverage, yearlyStatus, yearlyRecord.rows[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO student_averages 
         (student_id, subject_id, academic_year_id, school_id, yearly_average, grade_status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          studentId,
          subjectId,
          academicYearId,
          schoolId,
          yearlyAverage,
          yearlyStatus,
        ]
      );
    }
  }
};

// Get student's grade report (all subjects)
const getStudentGradeReport = async (req, res) => {
  const { studentId, academicYearId } = req.params;
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  const result = await db.query(
    `SELECT 
      sub.subject_name,
      sub.subject_code,
      sub.is_core,
      sa.semester_average,
      sa.yearly_average,
      sa.grade_status,
      s.semester_number
     FROM student_averages sa
     JOIN subjects sub ON sa.subject_id = sub.id
     LEFT JOIN semesters s ON sa.semester_id = s.id
     WHERE sa.student_id = $1 
       AND sa.academic_year_id = $2
       AND sa.school_id = $3
     ORDER BY sub.subject_name, s.semester_number`,
    [studentId, academicYearId, schoolId]
  );

  res.json({
    success: true,
    data: result.rows,
  });
};

module.exports = {
  getClassSubjectGrades,
  enterGrade,
  getStudentGradeReport,
};
