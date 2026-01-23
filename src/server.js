const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const cookieParser = require("cookie-parser");

const db = require("./config/database");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { sanitizeInput } = require("./middleware/validator");

// Import routes
const authRoutes = require("./routes/authRoutes");
const schoolRoutes = require("./routes/schoolRoutes");
const academicRoutes = require("./routes/academicRoutes");
const studentRoutes = require("./routes/studentRoutes");
const teacherRoutes = require("./routes/teacherRoutes");
const classRoutes = require("./routes/classRoutes");
const gradeRoutes = require("./routes/gradeRoutes");
const reportCardRoutes = require("./routes/reportCardRoutes");
const teacherDashboardRoutes = require("./routes/teacherDashboardRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");

// Initialize Express app
const app = express();

app.set("trust proxy", 1);

app.get("/", (req, res) => {
  res.status(200).send("SchoolLink API is running");
});

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", limiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Input sanitization
app.use(sanitizeInput);

// Health check endpoint
app.get("/health", async (req, res) => {
  const dbHealthy = await db.healthCheck();

  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbHealthy ? "connected" : "disconnected",
    environment: process.env.NODE_ENV || "development",
  });
});

// API routes
const API_VERSION = process.env.API_VERSION || "v1";

app.get(`/api/${API_VERSION}`, (req, res) => {
  res.json({
    success: true,
    message: "SchoolLink API - Liberian School Management System",
    version: API_VERSION,
    documentation: "/api/docs",
  });
});

// Mount routes
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/schools`, schoolRoutes);
app.use(`/api/${API_VERSION}/academic`, academicRoutes);
app.use(`/api/${API_VERSION}/students`, studentRoutes);
app.use(`/api/${API_VERSION}/teachers`, teacherRoutes);
app.use(`/api/${API_VERSION}/classes`, classRoutes);
app.use(`/api/${API_VERSION}/grades`, gradeRoutes);
app.use(`/api/${API_VERSION}/report-cards`, reportCardRoutes);
app.use(`/api/${API_VERSION}/teacher`, teacherDashboardRoutes);
app.use(`/api/${API_VERSION}/attendance`, attendanceRoutes);

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log("=".repeat(50));
  console.log("🚀 SchoolLink API Server");
  console.log("=".repeat(50));
  console.log(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`📚 API Base URL: http://localhost:${PORT}/api/${API_VERSION}`);
  console.log(`💚 Health Check: http://localhost:${PORT}/health`);
  console.log("=".repeat(50));
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    db.pool.end(() => {
      console.log("Database pool closed");
      process.exit(0);
    });
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    db.pool.end(() => {
      console.log("Database pool closed");
      process.exit(0);
    });
  });
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
  // Close server & exit process
  server.close(() => process.exit(1));
});

module.exports = app;
