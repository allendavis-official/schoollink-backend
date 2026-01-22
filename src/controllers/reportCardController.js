const db = require("../config/database");
const { AppError } = require("../middleware/errorHandler");
const PDFDocument = require("pdfkit");

// Get student report card data
// Get student report card data
const getStudentReportCardData = async (req, res) => {
  const { studentId, academicYearId } = req.params;
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  // Use the internal helper function to get all data including period averages
  const reportData = await getReportCardDataInternal(
    studentId,
    academicYearId,
    schoolId
  );

  res.json({
    success: true,
    data: reportData,
  });
};

// Generate PDF report card
// Generate PDF report card
const generateReportCardPDF = async (req, res) => {
  const { studentId, academicYearId } = req.params;
  const schoolId =
    req.user.role === "super_admin" ? req.query.schoolId : req.user.schoolId;

  // Get report card data
  const dataResponse = await getReportCardDataInternal(
    studentId,
    academicYearId,
    schoolId
  );
  const { student, school, academicYear, subjects, periodAverages } =
    dataResponse;

  // Create PDF
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  // Set response headers
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=report-card-${student.student_id}.pdf`
  );

  // Pipe PDF to response
  doc.pipe(res);

  // School Header
  doc
    .fontSize(20)
    .font("Helvetica-Bold")
    .text(school.school_name, { align: "center" });
  doc
    .fontSize(10)
    .font("Helvetica")
    .text(school.address || "", { align: "center" });
  doc.text(
    `Phone: ${school.phone || "N/A"} | Email: ${school.email || "N/A"}`,
    { align: "center" }
  );
  doc.moveDown();

  // Title
  doc
    .fontSize(16)
    .font("Helvetica-Bold")
    .text("STUDENT REPORT CARD", { align: "center" });
  doc
    .fontSize(12)
    .text(`Academic Year: ${academicYear.year_name}`, { align: "center" });
  doc.moveDown(1.5);

  // Student Information
  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .text("Student Information", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).font("Helvetica");
  doc.text(`Name: ${student.first_name} ${student.last_name}`, {
    continued: true,
  });
  doc.text(`         Student ID: ${student.student_id}`, { align: "left" });
  doc.text(`Class: ${student.class_name || "N/A"}`, { continued: true });
  doc.text(`         Gender: ${student.gender}`, { align: "left" });
  doc.moveDown(1.5);

  // Grades Table
  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .text("Academic Performance", { underline: true });
  doc.moveDown(0.5);

  // Table setup
  const tableTop = doc.y;
  const rowHeight = 25;
  const colWidths = [120, 35, 35, 35, 35, 50, 35, 35, 35, 35, 50, 50];
  let currentY = tableTop;

  // Helper function to draw cell
  const drawCell = (text, x, y, width, height, options = {}) => {
    const {
      bold = false,
      align = "center",
      bgColor = null,
      textColor = "black",
    } = options;

    if (bgColor) {
      doc.rect(x, y, width, height).fill(bgColor);
    }

    doc.fontSize(8).font(bold ? "Helvetica-Bold" : "Helvetica");

    if (textColor === "blue") {
      doc.fillColor("#0066CC");
    } else if (textColor === "red") {
      doc.fillColor("#CC0000");
    } else {
      doc.fillColor("black");
    }

    const textX = align === "center" ? x + width / 2 : x + 5;
    const textY = y + height / 2 - 4;

    doc.text(text || "-", textX, textY, {
      width: width - 10,
      align: align === "center" ? "center" : "left",
      lineBreak: false,
    });

    doc.fillColor("black");
    doc.rect(x, y, width, height).stroke();
  };

  // Table Headers
  let xPos = 50;
  drawCell("Subject", xPos, currentY, colWidths[0], rowHeight, {
    bold: true,
    bgColor: "#E0E0E0",
  });
  xPos += colWidths[0];
  drawCell("P1", xPos, currentY, colWidths[1], rowHeight, {
    bold: true,
    bgColor: "#E0E0E0",
  });
  xPos += colWidths[1];
  drawCell("P2", xPos, currentY, colWidths[2], rowHeight, {
    bold: true,
    bgColor: "#E0E0E0",
  });
  xPos += colWidths[2];
  drawCell("P3", xPos, currentY, colWidths[3], rowHeight, {
    bold: true,
    bgColor: "#E0E0E0",
  });
  xPos += colWidths[3];
  drawCell("Exam", xPos, currentY, colWidths[4], rowHeight, {
    bold: true,
    bgColor: "#E0E0E0",
  });
  xPos += colWidths[4];
  drawCell("Sem 1", xPos, currentY, colWidths[5], rowHeight, {
    bold: true,
    bgColor: "#E0E0E0",
  });
  xPos += colWidths[5];
  drawCell("P4", xPos, currentY, colWidths[6], rowHeight, {
    bold: true,
    bgColor: "#E0E0E0",
  });
  xPos += colWidths[6];
  drawCell("P5", xPos, currentY, colWidths[7], rowHeight, {
    bold: true,
    bgColor: "#E0E0E0",
  });
  xPos += colWidths[7];
  drawCell("P6", xPos, currentY, colWidths[8], rowHeight, {
    bold: true,
    bgColor: "#E0E0E0",
  });
  xPos += colWidths[8];
  drawCell("Exam", xPos, currentY, colWidths[9], rowHeight, {
    bold: true,
    bgColor: "#E0E0E0",
  });
  xPos += colWidths[9];
  drawCell("Sem 2", xPos, currentY, colWidths[10], rowHeight, {
    bold: true,
    bgColor: "#E0E0E0",
  });
  xPos += colWidths[10];
  drawCell("Yearly", xPos, currentY, colWidths[11], rowHeight, {
    bold: true,
    bgColor: "#E0E0E0",
  });

  currentY += rowHeight;

  // Table Rows
  subjects.forEach((subject) => {
    xPos = 50;

    // Check if we need a new page
    if (currentY > 700) {
      doc.addPage();
      currentY = 50;
    }

    const getColor = (score) => {
      if (!score) return "black";
      return parseFloat(score) >= 70 ? "blue" : "red";
    };

    const formatScore = (score) => {
      if (!score) return "-";
      return parseFloat(score).toFixed(1);
    };

    drawCell(subject.subjectName, xPos, currentY, colWidths[0], rowHeight, {
      align: "left",
    });
    xPos += colWidths[0];
    drawCell(
      formatScore(subject.period1),
      xPos,
      currentY,
      colWidths[1],
      rowHeight,
      { textColor: getColor(subject.period1) }
    );
    xPos += colWidths[1];
    drawCell(
      formatScore(subject.period2),
      xPos,
      currentY,
      colWidths[2],
      rowHeight,
      { textColor: getColor(subject.period2) }
    );
    xPos += colWidths[2];
    drawCell(
      formatScore(subject.period3),
      xPos,
      currentY,
      colWidths[3],
      rowHeight,
      { textColor: getColor(subject.period3) }
    );
    xPos += colWidths[3];
    drawCell(
      formatScore(subject.sem1Exam),
      xPos,
      currentY,
      colWidths[4],
      rowHeight,
      { textColor: getColor(subject.sem1Exam) }
    );
    xPos += colWidths[4];
    drawCell(
      formatScore(subject.sem1Average),
      xPos,
      currentY,
      colWidths[5],
      rowHeight,
      { textColor: getColor(subject.sem1Average), bold: true }
    );
    xPos += colWidths[5];
    drawCell(
      formatScore(subject.period4),
      xPos,
      currentY,
      colWidths[6],
      rowHeight,
      { textColor: getColor(subject.period4) }
    );
    xPos += colWidths[6];
    drawCell(
      formatScore(subject.period5),
      xPos,
      currentY,
      colWidths[7],
      rowHeight,
      { textColor: getColor(subject.period5) }
    );
    xPos += colWidths[7];
    drawCell(
      formatScore(subject.period6),
      xPos,
      currentY,
      colWidths[8],
      rowHeight,
      { textColor: getColor(subject.period6) }
    );
    xPos += colWidths[8];
    drawCell(
      formatScore(subject.sem2Exam),
      xPos,
      currentY,
      colWidths[9],
      rowHeight,
      { textColor: getColor(subject.sem2Exam) }
    );
    xPos += colWidths[9];
    drawCell(
      formatScore(subject.sem2Average),
      xPos,
      currentY,
      colWidths[10],
      rowHeight,
      { textColor: getColor(subject.sem2Average), bold: true }
    );
    xPos += colWidths[10];
    drawCell(
      formatScore(subject.yearlyAverage),
      xPos,
      currentY,
      colWidths[11],
      rowHeight,
      { textColor: getColor(subject.yearlyAverage), bold: true }
    );

    currentY += rowHeight;
  });

  // Add Period Averages Row
  xPos = 50;

  const getColor = (score) => {
    if (!score) return "black";
    return parseFloat(score) >= 70 ? "blue" : "red";
  };

  const formatScore = (score) => {
    if (!score) return "-";
    return parseFloat(score).toFixed(1);
  };

  drawCell("Period Averages", xPos, currentY, colWidths[0], rowHeight, {
    bold: true,
    bgColor: "#F5F5F5",
    align: "left",
  });
  xPos += colWidths[0];
  drawCell(
    formatScore(periodAverages.period1Avg),
    xPos,
    currentY,
    colWidths[1],
    rowHeight,
    {
      textColor: getColor(periodAverages.period1Avg),
      bold: true,
      bgColor: "#F5F5F5",
    }
  );
  xPos += colWidths[1];
  drawCell(
    formatScore(periodAverages.period2Avg),
    xPos,
    currentY,
    colWidths[2],
    rowHeight,
    {
      textColor: getColor(periodAverages.period2Avg),
      bold: true,
      bgColor: "#F5F5F5",
    }
  );
  xPos += colWidths[2];
  drawCell(
    formatScore(periodAverages.period3Avg),
    xPos,
    currentY,
    colWidths[3],
    rowHeight,
    {
      textColor: getColor(periodAverages.period3Avg),
      bold: true,
      bgColor: "#F5F5F5",
    }
  );
  xPos += colWidths[3];
  drawCell(
    formatScore(periodAverages.sem1ExamAvg),
    xPos,
    currentY,
    colWidths[4],
    rowHeight,
    {
      textColor: getColor(periodAverages.sem1ExamAvg),
      bold: true,
      bgColor: "#F5F5F5",
    }
  );
  xPos += colWidths[4];
  drawCell(
    formatScore(periodAverages.sem1OverallAvg),
    xPos,
    currentY,
    colWidths[5],
    rowHeight,
    {
      textColor: getColor(periodAverages.sem1OverallAvg),
      bold: true,
      bgColor: "#F5F5F5",
    }
  );
  xPos += colWidths[5];
  drawCell(
    formatScore(periodAverages.period4Avg),
    xPos,
    currentY,
    colWidths[6],
    rowHeight,
    {
      textColor: getColor(periodAverages.period4Avg),
      bold: true,
      bgColor: "#F5F5F5",
    }
  );
  xPos += colWidths[6];
  drawCell(
    formatScore(periodAverages.period5Avg),
    xPos,
    currentY,
    colWidths[7],
    rowHeight,
    {
      textColor: getColor(periodAverages.period5Avg),
      bold: true,
      bgColor: "#F5F5F5",
    }
  );
  xPos += colWidths[7];
  drawCell(
    formatScore(periodAverages.period6Avg),
    xPos,
    currentY,
    colWidths[8],
    rowHeight,
    {
      textColor: getColor(periodAverages.period6Avg),
      bold: true,
      bgColor: "#F5F5F5",
    }
  );
  xPos += colWidths[8];
  drawCell(
    formatScore(periodAverages.sem2ExamAvg),
    xPos,
    currentY,
    colWidths[9],
    rowHeight,
    {
      textColor: getColor(periodAverages.sem2ExamAvg),
      bold: true,
      bgColor: "#F5F5F5",
    }
  );
  xPos += colWidths[9];
  drawCell(
    formatScore(periodAverages.sem2OverallAvg),
    xPos,
    currentY,
    colWidths[10],
    rowHeight,
    {
      textColor: getColor(periodAverages.sem2OverallAvg),
      bold: true,
      bgColor: "#F5F5F5",
    }
  );
  xPos += colWidths[10];
  drawCell(
    formatScore(periodAverages.yearlyOverallAvg),
    xPos,
    currentY,
    colWidths[11],
    rowHeight,
    {
      textColor: getColor(periodAverages.yearlyOverallAvg),
      bold: true,
      bgColor: "#F5F5F5",
    }
  );

  currentY += rowHeight;

  // Legend
  doc.moveDown(2);
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .text("Grading Scale:", 50, currentY + 10);
  doc.fontSize(8).font("Helvetica");
  doc.fillColor("#0066CC").text("Blue = PASS (70-100)", 50, currentY + 25);
  doc.fillColor("#CC0000").text("Red = FAIL (0-69)", 50, currentY + 38);
  doc.fillColor("black");

  // Signatures
  doc.moveDown(3);
  const sigY = doc.y + 30;
  doc.fontSize(9).font("Helvetica");
  doc.text("_____________________", 50, sigY);
  doc.text("Class Teacher", 50, sigY + 15, { width: 150, align: "center" });

  doc.text("_____________________", 350, sigY);
  doc.text("Principal", 350, sigY + 15, { width: 150, align: "center" });

  // Footer
  doc
    .fontSize(8)
    .text(`Generated on ${new Date().toLocaleDateString()}`, 50, 750, {
      align: "center",
    });

  doc.end();
};

// Internal helper function
const getReportCardDataInternal = async (
  studentId,
  academicYearId,
  schoolId
) => {
  // Get student info
  const studentResult = await db.query(
    `SELECT s.*, se.class_id, c.class_name
     FROM students s
     LEFT JOIN student_enrollments se ON s.id = se.student_id AND se.status = 'enrolled'
     LEFT JOIN classes c ON se.class_id = c.id
     WHERE s.id = $1 AND s.school_id = $2`,
    [studentId, schoolId]
  );

  if (studentResult.rows.length === 0) {
    throw new AppError("Student not found", 404);
  }

  const student = studentResult.rows[0];

  // Get school info
  const schoolResult = await db.query("SELECT * FROM schools WHERE id = $1", [
    schoolId,
  ]);
  const school = schoolResult.rows[0];

  // Get academic year info
  const yearResult = await db.query(
    "SELECT * FROM academic_years WHERE id = $1",
    [academicYearId]
  );

  if (yearResult.rows.length === 0) {
    throw new AppError("Academic year not found", 404);
  }

  const academicYear = yearResult.rows[0];

  // Get all subjects
  const subjectsResult = await db.query(
    `SELECT DISTINCT s.id, s.subject_name, s.subject_code, s.is_core
     FROM subjects s
     JOIN class_subjects cs ON s.id = cs.subject_id
     WHERE cs.class_id = $1
     ORDER BY s.is_core DESC, s.subject_name`,
    [student.class_id]
  );

  // Get all grades
  const gradesResult = await db.query(
    `SELECT sg.*, ap.period_number, s.semester_number
     FROM student_grades sg
     JOIN assessment_periods ap ON sg.assessment_period_id = ap.id
     JOIN semesters s ON ap.semester_id = s.id
     WHERE sg.student_id = $1 AND sg.academic_year_id = $2`,
    [studentId, academicYearId]
  );

  // Get averages
  const averagesResult = await db.query(
    `SELECT * FROM student_averages
     WHERE student_id = $1 AND academic_year_id = $2`,
    [studentId, academicYearId]
  );

  // Organize data
  const reportData = subjectsResult.rows.map((subject) => {
    const subjectGrades = gradesResult.rows.filter(
      (g) => g.subject_id === subject.id
    );
    const subjectAverages = averagesResult.rows.filter(
      (a) => a.subject_id === subject.id
    );

    const gradesByPeriod = {};
    subjectGrades.forEach((grade) => {
      const key = `sem${grade.semester_number}_period${grade.period_number}`;
      gradesByPeriod[key] = grade.score;
    });

    const sem1Avg = subjectAverages.find(
      (a) => a.semester_id && a.semester_average
    );
    const sem2Avg = subjectAverages.find(
      (a) =>
        a.semester_id &&
        a.semester_average &&
        a.semester_id !== sem1Avg?.semester_id
    );
    const yearlyAvg = subjectAverages.find(
      (a) => !a.semester_id && a.yearly_average
    );

    return {
      subjectName: subject.subject_name,
      subjectCode: subject.subject_code,
      isCore: subject.is_core,
      period1: gradesByPeriod.sem1_period1 || null,
      period2: gradesByPeriod.sem1_period2 || null,
      period3: gradesByPeriod.sem1_period3 || null,
      sem1Exam: gradesByPeriod.sem1_period4 || null,
      sem1Average: sem1Avg?.semester_average || null,
      period4: gradesByPeriod.sem2_period1 || null,
      period5: gradesByPeriod.sem2_period2 || null,
      period6: gradesByPeriod.sem2_period3 || null,
      sem2Exam: gradesByPeriod.sem2_period4 || null,
      sem2Average: sem2Avg?.semester_average || null,
      yearlyAverage: yearlyAvg?.yearly_average || null,
      gradeStatus: yearlyAvg?.grade_status || null,
    };
  });

  // Calculate period averages across all subjects
  const calculatePeriodAverage = (periodKey) => {
    const scores = reportData
      .map((subject) => subject[periodKey])
      .filter((score) => score !== null && score !== undefined);

    if (scores.length === 0) return null;

    const sum = scores.reduce((acc, score) => acc + parseFloat(score), 0);
    return sum / scores.length;
  };

  const periodAverages = {
    period1Avg: calculatePeriodAverage("period1"),
    period2Avg: calculatePeriodAverage("period2"),
    period3Avg: calculatePeriodAverage("period3"),
    sem1ExamAvg: calculatePeriodAverage("sem1Exam"),
    sem1OverallAvg: calculatePeriodAverage("sem1Average"),
    period4Avg: calculatePeriodAverage("period4"),
    period5Avg: calculatePeriodAverage("period5"),
    period6Avg: calculatePeriodAverage("period6"),
    sem2ExamAvg: calculatePeriodAverage("sem2Exam"),
    sem2OverallAvg: calculatePeriodAverage("sem2Average"),
    yearlyOverallAvg: calculatePeriodAverage("yearlyAverage"),
  };

  return {
    student,
    school,
    academicYear,
    subjects: reportData,
    periodAverages,
  };
};

module.exports = {
  getStudentReportCardData,
  generateReportCardPDF,
};
