require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes")
const userRoutes = require("./routes/userRoutes")
const taskRoutes = require("./routes/taskRoutes")
const reportRoutes = require("./routes/reportRoutes")
const attendanceRoutes = require("./routes/attendanceRoutes")
const dayPlanRoutes = require("./routes/dayPlanRoutes")
const assignmentRoutes = require("./routes/assignmentRoutes")
const observationRoutes = require("./routes/observationRoutes")
const notificationRoutes = require("./routes/notificationRoutes")
const dashboardRoutes = require("./routes/dashboardRoutes")
const joinerRoutes = require("./routes/joinerRoutes")
const resultRoutes = require("./routes/resultRoutes")
const traineeDayPlanRoutes = require("./routes/traineeDayPlanRoutes")
const demoRoutes = require("./routes/demoRoutes")
const campusRoutes = require("./routes/campusRoutes")
const allocationRoutes = require("./routes/allocationRoutes")

const app = express();

// Middleware to handle CORS
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // Allow localhost for development
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      
      // Allow Vercel domains
      if (origin.includes('.vercel.app')) {
        return callback(null, true);
      }
      
      // Allow specific domains
      const allowedOrigins = [
        process.env.FRONTEND_URL,
        "https://task-frontend-x8j5.vercel.app",
        "https://task-manager-frontend.vercel.app"
      ].filter(Boolean);
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Block other origins
      callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true, // Allow cookies to be sent
  })
);

// Connect Database
connectDB();

// Middleware
app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/dayplans", dayPlanRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/observations", observationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/joiners", joinerRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/trainee-dayplans", traineeDayPlanRoutes);
app.use("/api/demos", demoRoutes);
app.use("/api/campus", campusRoutes);
app.use("/api/allocation", allocationRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    success: true, 
    message: "Server is running", 
    timestamp: new Date().toISOString() 
  });
});

// Serve uploads folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  // console.log(`Server running on port ${PORT}`);
});