const db = require("../config/database");

/**
 * Generate unique ID for students, teachers, etc.
 * Format: {SCHOOL_CODE}-{TYPE}-{YEAR}-{SEQUENCE}
 * Example: MON-STU-2025-0001
 */
const generateId = async (schoolId, idType) => {
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Get school code
    const schoolResult = await client.query(
      "SELECT school_code FROM schools WHERE id = $1",
      [schoolId],
    );

    if (schoolResult.rows.length === 0) {
      throw new Error("School not found");
    }

    const schoolCode = schoolResult.rows[0].school_code;
    const currentYear = new Date().getFullYear();

    // Get or create sequence
    const sequenceResult = await client.query(
      `INSERT INTO id_sequences (school_id, sequence_type, current_year, current_sequence)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (school_id, sequence_type, current_year)
       DO UPDATE SET 
         current_sequence = id_sequences.current_sequence + 1,
         updated_at = CURRENT_TIMESTAMP
       RETURNING current_sequence`,
      [schoolId, idType, currentYear],
    );

    const sequence = sequenceResult.rows[0].current_sequence;

    // Format sequence with leading zeros (4 digits)
    const paddedSequence = sequence.toString().padStart(4, "0");

    // Generate ID: SCHOOL_CODE-TYPE-YEAR-SEQUENCE
    const typeCode = idType.toUpperCase().substring(0, 3); // STU, TEA, etc.
    const generatedId = `${schoolCode}-${typeCode}-${currentYear}-${paddedSequence}`;

    await client.query("COMMIT");

    return generatedId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Check if an ID already exists
 */
const checkIdExists = async (idValue, idType, schoolId) => {
  let query;

  if (idType === "student") {
    query = "SELECT id FROM students WHERE student_id = $1 AND school_id = $2";
  } else if (idType === "teacher") {
    query = "SELECT id FROM teachers WHERE teacher_id = $1 AND school_id = $2";
  } else {
    return false;
  }

  const result = await db.query(query, [idValue, schoolId]);
  return result.rows.length > 0;
};

module.exports = {
  generateId,
  checkIdExists,
};
