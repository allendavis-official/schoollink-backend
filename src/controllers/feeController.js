const db = require("../config/database");
const { AppError } = require("../middleware/errorHandler");

// ============================================================================
// FEE TYPES
// ============================================================================

// Get all fee types
const getFeeTypes = async (req, res) => {
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  const result = await db.query(
    `SELECT * FROM fee_types 
     WHERE school_id = $1 AND is_active = true 
     ORDER BY fee_name`,
    [schoolId],
  );

  res.json({
    success: true,
    data: result.rows,
  });
};

// Create fee type
const createFeeType = async (req, res) => {
  const { feeName, description, isMandatory } = req.body;
  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;

  if (!feeName) {
    throw new AppError("Fee name is required", 400);
  }

  const result = await db.query(
    `INSERT INTO fee_types (school_id, fee_name, description, is_mandatory)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      schoolId,
      feeName,
      description,
      isMandatory !== undefined ? isMandatory : true,
    ],
  );

  res.status(201).json({
    success: true,
    message: "Fee type created successfully",
    data: result.rows[0],
  });
};

// Update fee type
const updateFeeType = async (req, res) => {
  const { id } = req.params;
  const { feeName, description, isMandatory, isActive } = req.body;

  const result = await db.query(
    `UPDATE fee_types 
     SET fee_name = COALESCE($1, fee_name),
         description = COALESCE($2, description),
         is_mandatory = COALESCE($3, is_mandatory),
         is_active = COALESCE($4, is_active),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [feeName, description, isMandatory, isActive, id],
  );

  if (result.rows.length === 0) {
    throw new AppError("Fee type not found", 404);
  }

  res.json({
    success: true,
    message: "Fee type updated successfully",
    data: result.rows[0],
  });
};

// Delete fee type
const deleteFeeType = async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    "UPDATE fee_types SET is_active = false WHERE id = $1 RETURNING *",
    [id],
  );

  if (result.rows.length === 0) {
    throw new AppError("Fee type not found", 404);
  }

  res.json({
    success: true,
    message: "Fee type deactivated successfully",
  });
};

// ============================================================================
// FEE STRUCTURES
// ============================================================================

// Get fee structures
const getFeeStructures = async (req, res) => {
  const { academicYearId, classId } = req.query;
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  let query = `
    SELECT fs.*, ft.fee_name, ft.description, ft.is_mandatory,
           c.class_name, ay.year_name
    FROM fee_structures fs
    JOIN fee_types ft ON fs.fee_type_id = ft.id
    LEFT JOIN classes c ON fs.class_id = c.id
    JOIN academic_years ay ON fs.academic_year_id = ay.id
    WHERE fs.school_id = $1
  `;

  const params = [schoolId];
  let paramCount = 1;

  if (academicYearId) {
    paramCount++;
    query += ` AND fs.academic_year_id = $${paramCount}`;
    params.push(academicYearId);
  }

  if (classId) {
    paramCount++;
    query += ` AND fs.class_id = $${paramCount}`;
    params.push(classId);
  }

  query += " ORDER BY ft.fee_name, c.class_name";

  const result = await db.query(query, params);

  res.json({
    success: true,
    data: result.rows,
  });
};

// Create fee structure
const createFeeStructure = async (req, res) => {
  const { academicYearId, classId, feeTypeId, amount, dueDate } = req.body;
  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;

  if (!academicYearId || !feeTypeId || !amount) {
    throw new AppError("Academic year, fee type, and amount are required", 400);
  }

  const result = await db.query(
    `INSERT INTO fee_structures (school_id, academic_year_id, class_id, fee_type_id, amount, due_date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [schoolId, academicYearId, classId, feeTypeId, amount, dueDate],
  );

  res.status(201).json({
    success: true,
    message: "Fee structure created successfully",
    data: result.rows[0],
  });
};

// Update fee structure
const updateFeeStructure = async (req, res) => {
  const { id } = req.params;
  const { amount, dueDate } = req.body;

  const result = await db.query(
    `UPDATE fee_structures 
     SET amount = COALESCE($1, amount),
         due_date = COALESCE($2, due_date),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING *`,
    [amount, dueDate, id],
  );

  if (result.rows.length === 0) {
    throw new AppError("Fee structure not found", 404);
  }

  res.json({
    success: true,
    message: "Fee structure updated successfully",
    data: result.rows[0],
  });
};

// Delete fee structure
const deleteFeeStructure = async (req, res) => {
  const { id } = req.params;

  await db.query("DELETE FROM fee_structures WHERE id = $1", [id]);

  res.json({
    success: true,
    message: "Fee structure deleted successfully",
  });
};

// ============================================================================
// STUDENT FEES
// ============================================================================

// Get student fees
const getStudentFees = async (req, res) => {
  const { studentId, academicYearId, status } = req.query;
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  let query = `
    SELECT sf.*, s.student_id, s.first_name, s.last_name,
           ft.fee_name, ay.year_name,
           fs.amount as structure_amount
    FROM student_fees sf
    JOIN students s ON sf.student_id = s.id
    JOIN fee_structures fs ON sf.fee_structure_id = fs.id
    JOIN fee_types ft ON fs.fee_type_id = ft.id
    JOIN academic_years ay ON sf.academic_year_id = ay.id
    WHERE sf.school_id = $1
  `;

  const params = [schoolId];
  let paramCount = 1;

  if (studentId) {
    paramCount++;
    query += ` AND sf.student_id = $${paramCount}`;
    params.push(studentId);
  }

  if (academicYearId) {
    paramCount++;
    query += ` AND sf.academic_year_id = $${paramCount}`;
    params.push(academicYearId);
  }

  if (status) {
    paramCount++;
    query += ` AND sf.status = $${paramCount}`;
    params.push(status);
  }

  query += " ORDER BY s.last_name, s.first_name, ft.fee_name";

  const result = await db.query(query, params);

  res.json({
    success: true,
    data: result.rows,
  });
};

// Assign fee to student
const assignFeeToStudent = async (req, res) => {
  const { studentId, academicYearId, feeStructureId, customAmount, dueDate } =
    req.body;
  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;

  if (!studentId || !academicYearId || !feeStructureId) {
    throw new AppError(
      "Student, academic year, and fee structure are required",
      400,
    );
  }

  // Get fee structure amount
  const structureResult = await db.query(
    "SELECT amount, due_date FROM fee_structures WHERE id = $1",
    [feeStructureId],
  );

  if (structureResult.rows.length === 0) {
    throw new AppError("Fee structure not found", 404);
  }

  const structure = structureResult.rows[0];
  const amountDue = customAmount || structure.amount;
  const finalDueDate = dueDate || structure.due_date;

  const result = await db.query(
    `INSERT INTO student_fees 
     (school_id, student_id, academic_year_id, fee_structure_id, custom_amount, amount_due, due_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      schoolId,
      studentId,
      academicYearId,
      feeStructureId,
      customAmount,
      amountDue,
      finalDueDate,
    ],
  );

  res.status(201).json({
    success: true,
    message: "Fee assigned to student successfully",
    data: result.rows[0],
  });
};

// Bulk assign fees to class
const bulkAssignFeesToClass = async (req, res) => {
  const { classId, academicYearId, feeStructureIds } = req.body;
  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;

  if (
    !classId ||
    !academicYearId ||
    !feeStructureIds ||
    feeStructureIds.length === 0
  ) {
    throw new AppError(
      "Class, academic year, and fee structures are required",
      400,
    );
  }

  // Get all students in class
  const studentsResult = await db.query(
    `SELECT student_id FROM student_enrollments 
     WHERE class_id = $1 AND academic_year_id = $2 AND status = 'enrolled'`,
    [classId, academicYearId],
  );

  const students = studentsResult.rows;

  if (students.length === 0) {
    throw new AppError("No students found in this class", 404);
  }

  const client = await db.getClient();
  let assignedCount = 0;

  try {
    await client.query("BEGIN");

    for (const student of students) {
      for (const feeStructureId of feeStructureIds) {
        // Get fee structure amount
        const structureResult = await client.query(
          "SELECT amount, due_date FROM fee_structures WHERE id = $1",
          [feeStructureId],
        );

        if (structureResult.rows.length > 0) {
          const structure = structureResult.rows[0];

          // Check if already assigned
          const existingResult = await client.query(
            `SELECT id FROM student_fees 
             WHERE student_id = $1 AND academic_year_id = $2 AND fee_structure_id = $3`,
            [student.student_id, academicYearId, feeStructureId],
          );

          if (existingResult.rows.length === 0) {
            await client.query(
              `INSERT INTO student_fees 
               (school_id, student_id, academic_year_id, fee_structure_id, amount_due, due_date)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                schoolId,
                student.student_id,
                academicYearId,
                feeStructureId,
                structure.amount,
                structure.due_date,
              ],
            );
            assignedCount++;
          }
        }
      }
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: `Fees assigned to ${students.length} students (${assignedCount} total assignments)`,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================================================
// PAYMENTS
// ============================================================================

// Record payment
const recordPayment = async (req, res) => {
  const {
    studentFeeId,
    studentId,
    amount,
    paymentMethod,
    paymentDate,
    transactionReference,
    notes,
  } = req.body;
  const schoolId =
    req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;

  if (
    !studentFeeId ||
    !studentId ||
    !amount ||
    !paymentMethod ||
    !paymentDate
  ) {
    throw new AppError("All payment details are required", 400);
  }

  // Generate receipt number
  const timestamp = Date.now();
  const receiptNumber = `RCP-${timestamp}`;

  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Record payment
    const paymentResult = await client.query(
      `INSERT INTO fee_payments 
       (school_id, student_fee_id, student_id, amount, payment_method, payment_date, 
        transaction_reference, notes, recorded_by, receipt_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        schoolId,
        studentFeeId,
        studentId,
        amount,
        paymentMethod,
        paymentDate,
        transactionReference,
        notes,
        req.user.id,
        receiptNumber,
      ],
    );

    // Update student fee
    await client.query(
      `UPDATE student_fees 
       SET amount_paid = amount_paid + $1,
           status = CASE 
             WHEN amount_paid + $1 >= amount_due THEN 'paid'
             WHEN amount_paid + $1 > 0 THEN 'partial'
             ELSE status
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [amount, studentFeeId],
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      data: paymentResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Get payment history
const getPaymentHistory = async (req, res) => {
  const { studentId, startDate, endDate } = req.query;
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  let query = `
    SELECT fp.*, s.student_id, s.first_name, s.last_name,
           ft.fee_name, u.first_name as recorded_by_first_name, u.last_name as recorded_by_last_name
    FROM fee_payments fp
    JOIN students s ON fp.student_id = s.id
    JOIN student_fees sf ON fp.student_fee_id = sf.id
    JOIN fee_structures fs ON sf.fee_structure_id = fs.id
    JOIN fee_types ft ON fs.fee_type_id = ft.id
    JOIN users u ON fp.recorded_by = u.id
    WHERE fp.school_id = $1
  `;

  const params = [schoolId];
  let paramCount = 1;

  if (studentId) {
    paramCount++;
    query += ` AND fp.student_id = $${paramCount}`;
    params.push(studentId);
  }

  if (startDate) {
    paramCount++;
    query += ` AND fp.payment_date >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` AND fp.payment_date <= $${paramCount}`;
    params.push(endDate);
  }

  query += " ORDER BY fp.payment_date DESC, fp.created_at DESC";

  const result = await db.query(query, params);

  res.json({
    success: true,
    data: result.rows,
  });
};

module.exports = {
  getFeeTypes,
  createFeeType,
  updateFeeType,
  deleteFeeType,
  getFeeStructures,
  createFeeStructure,
  updateFeeStructure,
  deleteFeeStructure,
  getStudentFees,
  assignFeeToStudent,
  bulkAssignFeesToClass,
  recordPayment,
  getPaymentHistory,
};
