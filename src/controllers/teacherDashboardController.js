const db = require("../config/database");
const { AppError } = require("../middleware/errorHandler");

// Get teacher dashboard statistics
const getTeacherDashboard = async (req, res) => {
  const teacherId = req.user.id;
  const schoolId = req.user.schoolId;

  // Get teacher info
  const teacherResult = await db.query(
    `SELECT t.*, u.first_name, u.last_name, u.email
     FROM teachers t
     JOIN users u ON t.user_id = u.id
     WHERE u.id = $1`,
    [teacherId]
  );

  if (teacherResult.rows.length === 0) {
    throw new AppError("Teacher not found", 404);
  }

  const teacher = teacherResult.rows[0];

  // Get assigned subjects count
  const subjectsCount = await db.query(
    "SELECT COUNT(*) as count FROM teacher_subjects WHERE teacher_id = $1",
    [teacher.id]
  );

  // Get classes where teacher teaches (from class_subjects)
  const classesCount = await db.query(
    `SELECT COUNT(DISTINCT cs.class_id) as count
     FROM class_subjects cs
     WHERE cs.teacher_id = $1`,
    [teacherId]
  );

  // Get total students in teacher's classes
  const studentsCount = await db.query(
    `SELECT COUNT(DISTINCT se.student_id) as count
     FROM class_subjects cs
     JOIN student_enrollments se ON cs.class_id = se.class_id AND se.status = 'enrolled'
     WHERE cs.teacher_id = $1`,
    [teacherId]
  );

  // Get if teacher is a class teacher
  const classTeacherOf = await db.query(
    `SELECT c.id, c.class_name
     FROM classes c
     WHERE c.class_teacher_id = $1`,
    [teacherId]
  );

  res.json({
    success: true,
    data: {
      teacher,
      stats: {
        subjectsCount: parseInt(subjectsCount.rows[0].count),
        classesCount: parseInt(classesCount.rows[0].count),
        studentsCount: parseInt(studentsCount.rows[0].count),
      },
      classTeacherOf: classTeacherOf.rows,
    },
  });
};

// Get teacher's assigned classes
const getTeacherClasses = async (req, res) => {
  const teacherId = req.user.id;

  const result = await db.query(
    `SELECT DISTINCT 
      c.id,
      c.class_name,
      c.class_level,
      c.class_type,
      (SELECT COUNT(*) FROM student_enrollments WHERE class_id = c.id AND status = 'enrolled') as student_count,
      (SELECT COUNT(*) FROM class_subjects WHERE class_id = c.id AND teacher_id = $1) as subject_count
     FROM classes c
     JOIN class_subjects cs ON c.id = cs.class_id
     WHERE cs.teacher_id = $1
     ORDER BY c.class_name`,
    [teacherId]
  );

  res.json({
    success: true,
    data: result.rows,
  });
};

// Get teacher's assigned subjects
const getTeacherSubjects = async (req, res) => {
  const teacherId = req.user.id;

  // Get subjects from teacher_subjects (subjects they can teach)
  const teachableSubjects = await db.query(
    `SELECT ts.*, s.subject_name, s.subject_code, s.is_core
     FROM teacher_subjects ts
     JOIN subjects s ON ts.subject_id = s.id
     WHERE ts.teacher_id = (SELECT id FROM teachers WHERE user_id = $1)
     ORDER BY s.subject_name`,
    [teacherId]
  );

  // Get subjects they're actively teaching in classes
  const activeSubjects = await db.query(
    `SELECT DISTINCT
      s.id,
      s.subject_name,
      s.subject_code,
      s.is_core,
      COUNT(DISTINCT cs.class_id) as class_count
     FROM class_subjects cs
     JOIN subjects s ON cs.subject_id = s.id
     WHERE cs.teacher_id = $1
     GROUP BY s.id, s.subject_name, s.subject_code, s.is_core
     ORDER BY s.subject_name`,
    [teacherId]
  );

  res.json({
    success: true,
    data: {
      teachableSubjects: teachableSubjects.rows,
      activeSubjects: activeSubjects.rows,
    },
  });
};

// Get students in a specific class that teacher teaches
const getClassStudents = async (req, res) => {
  const { classId } = req.params;
  const teacherId = req.user.id;

  // Verify teacher teaches this class
  const accessCheck = await db.query(
    "SELECT id FROM class_subjects WHERE class_id = $1 AND teacher_id = $2",
    [classId, teacherId]
  );

  if (accessCheck.rows.length === 0) {
    throw new AppError("You do not have access to this class", 403);
  }

  // Get students
  const result = await db.query(
    `SELECT s.*, se.enrollment_date
     FROM students s
     JOIN student_enrollments se ON s.id = se.student_id
     WHERE se.class_id = $1 AND se.status = 'enrolled'
     ORDER BY s.first_name, s.last_name`,
    [classId]
  );

  res.json({
    success: true,
    data: result.rows,
  });
};

module.exports = {
  getTeacherDashboard,
  getTeacherClasses,
  getTeacherSubjects,
  getClassStudents,
};
