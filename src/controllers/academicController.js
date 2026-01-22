const db = require("../config/database");
const { AppError } = require("../middleware/errorHandler");
const { format, parse } = require("date-fns");

/**
 * Create a new academic year with semesters and periods
 */
const createAcademicYear = async (req, res) => {
  const { schoolId, yearName, startDate, endDate, isCurrent } = req.body;

  const finalSchoolId =
    req.user.role === "super_admin" ? schoolId : req.user.schoolId;

  if (!finalSchoolId || !yearName || !startDate || !endDate) {
    throw new AppError(
      "School ID, year name, start date, and end date are required",
      400
    );
  }

  // Check if year name already exists for this school
  const existing = await db.query(
    "SELECT id FROM academic_years WHERE school_id = $1 AND year_name = $2",
    [finalSchoolId, yearName]
  );

  if (existing.rows.length > 0) {
    throw new AppError("An academic year with this name already exists", 409);
  }

  // Start transaction
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // If this is the current year, unset others
    if (isCurrent) {
      await client.query(
        "UPDATE academic_years SET is_current = false WHERE school_id = $1",
        [finalSchoolId]
      );
    }

    // Create academic year
    const yearResult = await client.query(
      `INSERT INTO academic_years (school_id, year_name, start_date, end_date, is_current)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [finalSchoolId, yearName, startDate, endDate, isCurrent || false]
    );

    const academicYear = yearResult.rows[0];

    // Calculate semester dates (split the year in half)
    const yearStart = new Date(startDate);
    const yearEnd = new Date(endDate);
    const yearMidpoint = new Date(
      (yearStart.getTime() + yearEnd.getTime()) / 2
    );

    // Create Semester 1
    const semester1Result = await client.query(
      `INSERT INTO semesters 
   (academic_year_id, school_id, semester_number, semester_name, start_date, end_date, is_current)
   VALUES ($1, $2, $3, $4, $5, $6, $7)
   RETURNING *`,
      [
        academicYear.id,
        finalSchoolId,
        1,
        "Semester 1",
        startDate,
        format(yearMidpoint, "yyyy-MM-dd"),
        isCurrent || false,
      ]
    );

    const semester1 = semester1Result.rows[0];

    // Create Semester 2
    const semester2Start = new Date(yearMidpoint.getTime() + 86400000); // Add 1 day
    const semester2Result = await client.query(
      `INSERT INTO semesters 
   (academic_year_id, school_id, semester_number, semester_name, start_date, end_date, is_current)
   VALUES ($1, $2, $3, $4, $5, $6, $7)
   RETURNING *`,
      [
        academicYear.id,
        finalSchoolId,
        2,
        "Semester 2",
        format(semester2Start, "yyyy-MM-dd"),
        endDate,
        false,
      ]
    );

    const semester2 = semester2Result.rows[0];

    // Helper function to create periods
    // Helper function to create periods
    const createPeriods = async (
      semesterId,
      semesterStart,
      semesterEnd,
      semesterNumber
    ) => {
      const start = new Date(semesterStart);
      const end = new Date(semesterEnd);
      const totalDays = (end.getTime() - start.getTime()) / 86400000;
      const periodDuration = Math.floor(totalDays / 4); // 4 components: 3 periods + 1 exam

      const periods = [];

      // Create 3 periods
      for (let i = 1; i <= 3; i++) {
        const periodStart = new Date(
          start.getTime() + (i - 1) * periodDuration * 86400000
        );
        const periodEnd = new Date(
          start.getTime() + i * periodDuration * 86400000 - 86400000
        );

        // Period names based on semester
        let periodName;
        if (semesterNumber === 1) {
          periodName = `${i}${i === 1 ? "st" : i === 2 ? "nd" : "rd"} Period`;
        } else {
          periodName = `${i + 3}${
            i + 3 === 4 ? "th" : i + 3 === 5 ? "th" : "th"
          } Period`;
        }

        const result = await client.query(
          `INSERT INTO assessment_periods 
       (semester_id, school_id, period_number, period_name, period_type, start_date, end_date, weight_percentage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
          [
            semesterId,
            finalSchoolId,
            i, // Always 1, 2, or 3
            periodName,
            "period",
            format(periodStart, "yyyy-MM-dd"),
            format(periodEnd, "yyyy-MM-dd"),
            25.0,
          ]
        );

        periods.push(result.rows[0]);
      }

      // Create semester exam (always period_number = 4)
      const examStart = new Date(
        start.getTime() + 3 * periodDuration * 86400000
      );
      const examResult = await client.query(
        `INSERT INTO assessment_periods 
     (semester_id, school_id, period_number, period_name, period_type, start_date, end_date, weight_percentage)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
        [
          semesterId,
          finalSchoolId,
          4, // Always 4 for exam
          `Semester ${semesterNumber} Exam`,
          "exam",
          format(examStart, "yyyy-MM-dd"),
          format(end, "yyyy-MM-dd"),
          25.0,
        ]
      );

      periods.push(examResult.rows[0]);
      return periods;
    };

    // Create periods for Semester 1 (periods 1, 2, 3)
    const semester1Periods = await createPeriods(
      semester1.id,
      semester1.start_date,
      semester1.end_date,
      1
    );

    // Create periods for Semester 2 (periods 4, 5, 6)
    const semester2Periods = await createPeriods(
      semester2.id,
      semester2.start_date,
      semester2.end_date,
      2
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Academic year created successfully with semesters and periods",
      data: {
        academicYear,
        semesters: [
          { ...semester1, periods: semester1Periods },
          { ...semester2, periods: semester2Periods },
        ],
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get all academic years for a school
 */
const getAcademicYears = async (req, res) => {
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  if (!schoolId) {
    throw new AppError("School ID is required", 400);
  }

  const result = await db.query(
    `SELECT ay.*, 
       (SELECT COUNT(*) FROM semesters WHERE academic_year_id = ay.id) as semester_count
     FROM academic_years ay
     WHERE ay.school_id = $1
     ORDER BY ay.start_date DESC`,
    [schoolId]
  );

  res.json({
    success: true,
    data: result.rows,
  });
};

/**
 * Get academic year by ID with full details
 */
const getAcademicYearById = async (req, res) => {
  const { id } = req.params;

  // Get academic year
  const yearResult = await db.query(
    "SELECT * FROM academic_years WHERE id = $1",
    [id]
  );

  if (yearResult.rows.length === 0) {
    throw new AppError("Academic year not found", 404);
  }

  const academicYear = yearResult.rows[0];

  // Check access
  if (
    req.user.role !== "super_admin" &&
    academicYear.school_id !== req.user.schoolId
  ) {
    throw new AppError(
      "You do not have permission to access this academic year",
      403
    );
  }

  // Get semesters
  const semestersResult = await db.query(
    "SELECT * FROM semesters WHERE academic_year_id = $1 ORDER BY semester_number",
    [id]
  );

  // Get periods for each semester
  const semesters = await Promise.all(
    semestersResult.rows.map(async (semester) => {
      const periodsResult = await db.query(
        "SELECT * FROM assessment_periods WHERE semester_id = $1 ORDER BY period_number",
        [semester.id]
      );
      return {
        ...semester,
        periods: periodsResult.rows,
      };
    })
  );

  res.json({
    success: true,
    data: {
      ...academicYear,
      semesters,
    },
  });
};

/**
 * Set current academic year
 */
const setCurrentAcademicYear = async (req, res) => {
  const { id } = req.params;

  // Get the academic year
  const yearResult = await db.query(
    "SELECT * FROM academic_years WHERE id = $1",
    [id]
  );

  if (yearResult.rows.length === 0) {
    throw new AppError("Academic year not found", 404);
  }

  const academicYear = yearResult.rows[0];

  // Check access
  if (
    req.user.role !== "super_admin" &&
    academicYear.school_id !== req.user.schoolId
  ) {
    throw new AppError(
      "You do not have permission to modify this academic year",
      403
    );
  }

  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Unset all current years for this school
    await client.query(
      "UPDATE academic_years SET is_current = false WHERE school_id = $1",
      [academicYear.school_id]
    );

    // Unset all current semesters for this school
    await client.query(
      "UPDATE semesters SET is_current = false WHERE school_id = $1",
      [academicYear.school_id]
    );

    // Set this year as current
    await client.query(
      "UPDATE academic_years SET is_current = true WHERE id = $1",
      [id]
    );

    // Set first semester as current
    await client.query(
      `UPDATE semesters SET is_current = true 
       WHERE academic_year_id = $1 AND semester_number = 1`,
      [id]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Current academic year updated successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Set current semester
 */
const setCurrentSemester = async (req, res) => {
  const { id } = req.params;

  // Get the semester
  const semesterResult = await db.query(
    "SELECT s.*, ay.school_id FROM semesters s JOIN academic_years ay ON s.academic_year_id = ay.id WHERE s.id = $1",
    [id]
  );

  if (semesterResult.rows.length === 0) {
    throw new AppError("Semester not found", 404);
  }

  const semester = semesterResult.rows[0];

  // Check access
  if (
    req.user.role !== "super_admin" &&
    semester.school_id !== req.user.schoolId
  ) {
    throw new AppError(
      "You do not have permission to modify this semester",
      403
    );
  }

  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Unset all current semesters for this school
    await client.query(
      "UPDATE semesters SET is_current = false WHERE school_id = $1",
      [semester.school_id]
    );

    // Set this semester as current
    await client.query("UPDATE semesters SET is_current = true WHERE id = $1", [
      id,
    ]);

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Current semester updated successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Lock or unlock an assessment period
 */
const togglePeriodLock = async (req, res) => {
  const { id } = req.params;
  const { isLocked } = req.body;

  // Get the period
  const periodResult = await db.query(
    `SELECT ap.*, s.school_id 
     FROM assessment_periods ap 
     JOIN semesters s ON ap.semester_id = s.id 
     WHERE ap.id = $1`,
    [id]
  );

  if (periodResult.rows.length === 0) {
    throw new AppError("Assessment period not found", 404);
  }

  const period = periodResult.rows[0];

  // Check access (only school admin and super admin can lock/unlock)
  if (!["super_admin", "school_admin"].includes(req.user.role)) {
    throw new AppError(
      "You do not have permission to lock/unlock periods",
      403
    );
  }

  if (
    req.user.role !== "super_admin" &&
    period.school_id !== req.user.schoolId
  ) {
    throw new AppError("You do not have permission to modify this period", 403);
  }

  await db.query("UPDATE assessment_periods SET is_locked = $1 WHERE id = $2", [
    isLocked,
    id,
  ]);

  res.json({
    success: true,
    message: `Period ${isLocked ? "locked" : "unlocked"} successfully`,
  });
};

/**
 * Update grading configuration
 */
const updateGradingConfig = async (req, res) => {
  const {
    schoolId,
    passMark,
    useCustomWeights,
    periodWeight,
    examWeight,
    semesterCalculation,
    yearCalculation,
  } = req.body;

  const finalSchoolId =
    req.user.role === "super_admin" ? schoolId : req.user.schoolId;

  if (!finalSchoolId) {
    throw new AppError("School ID is required", 400);
  }

  // Check if config exists
  const existingConfig = await db.query(
    "SELECT id FROM grading_config WHERE school_id = $1",
    [finalSchoolId]
  );

  let result;

  if (existingConfig.rows.length > 0) {
    // Update existing config
    const updates = [];
    const values = [];
    let paramCount = 0;

    if (passMark !== undefined) {
      paramCount++;
      updates.push(`pass_mark = $${paramCount}`);
      values.push(passMark);
    }

    if (useCustomWeights !== undefined) {
      paramCount++;
      updates.push(`use_custom_weights = $${paramCount}`);
      values.push(useCustomWeights);
    }

    if (periodWeight !== undefined) {
      paramCount++;
      updates.push(`period_weight = $${paramCount}`);
      values.push(periodWeight);
    }

    if (examWeight !== undefined) {
      paramCount++;
      updates.push(`exam_weight = $${paramCount}`);
      values.push(examWeight);
    }

    if (semesterCalculation) {
      paramCount++;
      updates.push(`semester_calculation = $${paramCount}`);
      values.push(semesterCalculation);
    }

    if (yearCalculation) {
      paramCount++;
      updates.push(`year_calculation = $${paramCount}`);
      values.push(yearCalculation);
    }

    if (updates.length === 0) {
      throw new AppError("No fields to update", 400);
    }

    paramCount++;
    values.push(finalSchoolId);

    result = await db.query(
      `UPDATE grading_config 
       SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE school_id = $${paramCount}
       RETURNING *`,
      values
    );
  } else {
    // Create new config
    result = await db.query(
      `INSERT INTO grading_config 
       (school_id, pass_mark, use_custom_weights, period_weight, exam_weight, semester_calculation, year_calculation)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        finalSchoolId,
        passMark || 70.0,
        useCustomWeights || false,
        periodWeight || 25.0,
        examWeight || 25.0,
        semesterCalculation || "average",
        yearCalculation || "average",
      ]
    );
  }

  res.json({
    success: true,
    message: "Grading configuration updated successfully",
    data: result.rows[0],
  });
};

/**
 * Get grading configuration
 */
const getGradingConfig = async (req, res) => {
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  if (!schoolId) {
    throw new AppError("School ID is required", 400);
  }

  const result = await db.query(
    "SELECT * FROM grading_config WHERE school_id = $1",
    [schoolId]
  );

  if (result.rows.length === 0) {
    // Return default config if none exists
    return res.json({
      success: true,
      data: {
        schoolId,
        passMark: 70.0,
        useCustomWeights: false,
        periodWeight: 25.0,
        examWeight: 25.0,
        semesterCalculation: "average",
        yearCalculation: "average",
      },
    });
  }

  res.json({
    success: true,
    data: result.rows[0],
  });
};

module.exports = {
  createAcademicYear,
  getAcademicYears,
  getAcademicYearById,
  setCurrentAcademicYear,
  setCurrentSemester,
  togglePeriodLock,
  updateGradingConfig,
  getGradingConfig,
};
