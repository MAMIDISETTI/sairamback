const User = require("../models/User");
const Attendance = require("../models/Attendance");
const DayPlan = require("../models/DayPlan");
const Assignment = require("../models/Assignment");
const Observation = require("../models/Observation");
const Notification = require("../models/Notification");
const LearningReport = require("../models/LearningReport");
const AttendanceReport = require("../models/AttendanceReport");
const GroomingReport = require("../models/GroomingReport");
const Result = require("../models/Result");

// @desc    Generate attendance report
// @route   GET /api/reports/attendance
// @access  Private (Master Trainer, Trainer)
const generateAttendanceReport = async (req, res) => {
  try {
    const { startDate, endDate, userId, format = 'json' } = req.query;
    const requesterId = req.user.id;
    const requesterRole = req.user.role;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start date and end date are required" });
    }

    const dateFilter = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };

    let matchQuery = { date: dateFilter };

    // If specific user requested, filter by user
    if (userId) {
      matchQuery.user = userId;
    } else if (requesterRole === "trainer") {
      // Trainers can only see their assigned trainees
      const trainer = await User.findById(requesterId).populate('assignedTrainees');
      matchQuery.user = { $in: trainer.assignedTrainees.map(t => t._id) };
    }

    const attendanceData = await Attendance.find(matchQuery)
      .populate('user', 'name email employeeId department role')
      .sort({ date: -1, user: 1 });

    // Calculate summary statistics
    const summary = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          presentCount: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] }
          },
          absentCount: {
            $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] }
          },
          lateCount: {
            $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] }
          },
          halfDayCount: {
            $sum: { $cond: [{ $eq: ["$status", "half_day"] }, 1, 0] }
          },
          overtimeCount: {
            $sum: { $cond: [{ $eq: ["$status", "overtime"] }, 1, 0] }
          },
          averageHours: { $avg: "$totalHours" },
          totalHours: { $sum: "$totalHours" }
        }
      }
    ]);

    const report = {
      period: {
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      },
      summary: summary[0] || {
        totalRecords: 0,
        presentCount: 0,
        absentCount: 0,
        lateCount: 0,
        halfDayCount: 0,
        overtimeCount: 0,
        averageHours: 0,
        totalHours: 0
      },
      data: attendanceData
    };

    if (format === 'csv') {
      // Convert to CSV format
      const csvData = convertAttendanceToCSV(attendanceData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${startDate}-to-${endDate}.csv"`);
      return res.send(csvData);
    }

    res.json(report);

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Generate day plan compliance report
// @route   GET /api/reports/day-plan-compliance
// @access  Private (Master Trainer, Trainer)
const generateDayPlanComplianceReport = async (req, res) => {
  try {
    const { startDate, endDate, trainerId, format = 'json' } = req.query;
    const requesterId = req.user.id;
    const requesterRole = req.user.role;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start date and end date are required" });
    }

    const dateFilter = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };

    let matchQuery = { date: dateFilter };

    if (trainerId) {
      matchQuery.trainer = trainerId;
    } else if (requesterRole === "trainer") {
      matchQuery.trainer = requesterId;
    }

    const dayPlans = await DayPlan.find(matchQuery)
      .populate('trainer', 'name email')
      .populate('assignedTrainees', 'name email employeeId')
      .sort({ date: -1 });

    // Calculate compliance statistics
    const complianceStats = await DayPlan.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalPlans: { $sum: 1 },
          publishedPlans: {
            $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] }
          },
          completedPlans: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
          },
          averageTasksPerPlan: { $avg: { $size: "$tasks" } },
          totalTasks: { $sum: { $size: "$tasks" } },
          completedTasks: {
            $sum: {
              $size: {
                $filter: {
                  input: "$tasks",
                  cond: { $eq: ["$$this.status", "completed"] }
                }
              }
            }
          }
        }
      }
    ]);

    const report = {
      period: {
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      },
      summary: complianceStats[0] || {
        totalPlans: 0,
        publishedPlans: 0,
        completedPlans: 0,
        averageTasksPerPlan: 0,
        totalTasks: 0,
        completedTasks: 0
      },
      data: dayPlans
    };

    if (format === 'csv') {
      const csvData = convertDayPlansToCSV(dayPlans);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="day-plan-compliance-${startDate}-to-${endDate}.csv"`);
      return res.send(csvData);
    }

    res.json(report);

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Generate observation report
// @route   GET /api/reports/observations
// @access  Private (Master Trainer, Trainer)
const generateObservationReport = async (req, res) => {
  try {
    const { startDate, endDate, trainerId, traineeId, format = 'json' } = req.query;
    const requesterId = req.user.id;
    const requesterRole = req.user.role;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start date and end date are required" });
    }

    const dateFilter = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };

    let matchQuery = { date: dateFilter };

    if (trainerId) {
      matchQuery.trainer = trainerId;
    } else if (requesterRole === "trainer") {
      matchQuery.trainer = requesterId;
    }

    if (traineeId) {
      matchQuery.trainee = traineeId;
    }

    const observations = await Observation.find(matchQuery)
      .populate('trainer', 'name email')
      .populate('trainee', 'name email employeeId department')
      .sort({ date: -1 });

    // Calculate observation statistics
    const observationStats = await Observation.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalObservations: { $sum: 1 },
          submittedObservations: {
            $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] }
          },
          reviewedObservations: {
            $sum: { $cond: [{ $eq: ["$status", "reviewed"] }, 1, 0] }
          },
          excellentCount: {
            $sum: { $cond: [{ $eq: ["$overallRating", "excellent"] }, 1, 0] }
          },
          goodCount: {
            $sum: { $cond: [{ $eq: ["$overallRating", "good"] }, 1, 0] }
          },
          averageCount: {
            $sum: { $cond: [{ $eq: ["$overallRating", "average"] }, 1, 0] }
          },
          needsImprovementCount: {
            $sum: { $cond: [{ $eq: ["$overallRating", "needs_improvement"] }, 1, 0] }
          }
        }
      }
    ]);

    const report = {
      period: {
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      },
      summary: observationStats[0] || {
        totalObservations: 0,
        submittedObservations: 0,
        reviewedObservations: 0,
        excellentCount: 0,
        goodCount: 0,
        averageCount: 0,
        needsImprovementCount: 0
      },
      data: observations
    };

    if (format === 'csv') {
      const csvData = convertObservationsToCSV(observations);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="observation-report-${startDate}-to-${endDate}.csv"`);
      return res.send(csvData);
    }

    res.json(report);

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Generate assignment report
// @route   GET /api/reports/assignments
// @access  Private (Master Trainer)
const generateAssignmentReport = async (req, res) => {
  try {
    const { startDate, endDate, status, format = 'json' } = req.query;
    const requesterId = req.user.id;

    let matchQuery = { masterTrainer: requesterId };

    if (startDate && endDate) {
      matchQuery.assignmentDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (status) {
      matchQuery.status = status;
    }

    const assignments = await Assignment.find(matchQuery)
      .populate('trainer', 'name email')
      .populate('trainees', 'name email employeeId department')
      .populate('masterTrainer', 'name email')
      .sort({ assignmentDate: -1 });

    // Calculate assignment statistics
    const assignmentStats = await Assignment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalAssignments: { $sum: 1 },
          activeAssignments: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] }
          },
          completedAssignments: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
          },
          totalTraineesAssigned: { $sum: "$totalTrainees" },
          averageTraineesPerAssignment: { $avg: "$totalTrainees" }
        }
      }
    ]);

    const report = {
      period: startDate && endDate ? {
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      } : null,
      summary: assignmentStats[0] || {
        totalAssignments: 0,
        activeAssignments: 0,
        completedAssignments: 0,
        totalTraineesAssigned: 0,
        averageTraineesPerAssignment: 0
      },
      data: assignments
    };

    if (format === 'csv') {
      const csvData = convertAssignmentsToCSV(assignments);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="assignment-report-${startDate || 'all'}-to-${endDate || 'all'}.csv"`);
      return res.send(csvData);
    }

    res.json(report);

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Generate audit log
// @route   GET /api/reports/audit
// @access  Private (Master Trainer)
const generateAuditLog = async (req, res) => {
  try {
    const { startDate, endDate, action, userId, format = 'json' } = req.query;
    const requesterId = req.user.id;

    let matchQuery = {};

    if (startDate && endDate) {
      matchQuery.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (action) {
      matchQuery.type = action;
    }

    if (userId) {
      matchQuery.sender = userId;
    }

    // Get notifications as audit trail
    const auditLog = await Notification.find(matchQuery)
      .populate('sender', 'name email role')
      .populate('recipient', 'name email role')
      .sort({ createdAt: -1 })
      .limit(1000); // Limit to prevent large responses

    const report = {
      period: startDate && endDate ? {
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      } : null,
      totalRecords: auditLog.length,
      data: auditLog
    };

    if (format === 'csv') {
      const csvData = convertAuditLogToCSV(auditLog);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-log-${startDate || 'all'}-to-${endDate || 'all'}.csv"`);
      return res.send(csvData);
    }

    res.json(report);

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Helper functions to convert data to CSV
const convertAttendanceToCSV = (attendanceData) => {
  const headers = ['Date', 'User', 'Email', 'Employee ID', 'Department', 'Clock In', 'Clock Out', 'Total Hours', 'Status', 'Notes'];
  const rows = attendanceData.map(record => [
    record.date.toISOString().split('T')[0],
    record.user.name,
    record.user.email,
    record.user.employeeId || '',
    record.user.department || '',
    record.clockIn?.time ? record.clockIn.time.toISOString() : '',
    record.clockOut?.time ? record.clockOut.time.toISOString() : '',
    record.totalHours || 0,
    record.status,
    record.notes || ''
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
};

const convertDayPlansToCSV = (dayPlans) => {
  const headers = ['Date', 'Title', 'Trainer', 'Status', 'Start Time', 'End Time', 'Duration', 'Assigned Trainees', 'Tasks Count', 'Completed Tasks'];
  const rows = dayPlans.map(plan => [
    plan.date.toISOString().split('T')[0],
    plan.title,
    plan.trainer.name,
    plan.status,
    plan.startTime,
    plan.endTime,
    plan.duration,
    plan.assignedTrainees.map(t => t.name).join('; '),
    plan.tasks.length,
    plan.tasks.filter(t => t.status === 'completed').length
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
};

const convertObservationsToCSV = (observations) => {
  const headers = ['Date', 'Trainer', 'Trainee', 'Overall Rating', 'Culture Rating', 'Grooming Rating', 'Status', 'Strengths', 'Areas for Improvement'];
  const rows = observations.map(obs => [
    obs.date.toISOString().split('T')[0],
    obs.trainer.name,
    obs.trainee.name,
    obs.overallRating,
    obs.culture.communication,
    obs.grooming.dressCode,
    obs.status,
    obs.strengths.join('; '),
    obs.areasForImprovement.join('; ')
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
};

const convertAssignmentsToCSV = (assignments) => {
  const headers = ['Assignment Date', 'Master Trainer', 'Trainer', 'Status', 'Total Trainees', 'Trainees', 'Notes'];
  const rows = assignments.map(assignment => [
    assignment.assignmentDate.toISOString().split('T')[0],
    assignment.masterTrainer.name,
    assignment.trainer.name,
    assignment.status,
    assignment.totalTrainees,
    assignment.trainees.map(t => t.name).join('; '),
    assignment.notes || ''
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
};

const convertAuditLogToCSV = (auditLog) => {
  const headers = ['Date', 'Time', 'Sender', 'Recipient', 'Action', 'Title', 'Message', 'Priority'];
  const rows = auditLog.map(log => [
    log.createdAt.toISOString().split('T')[0],
    log.createdAt.toISOString().split('T')[1].split('.')[0],
    log.sender.name,
    log.recipient.name,
    log.type,
    log.title,
    log.message,
    log.priority
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
};

// @desc    Get demos report (Online and Offline)
// @route   GET /api/reports/demos
// @access  Private (Admin)
const getDemosReport = async (req, res) => {
  try {
    const { period = 'weekly', type = 'all' } = req.query;
    
    // Calculate date range based on period
    const now = new Date();
    let startDate, endDate;
    
    if (period === 'weekly') {
      // Last 7 days
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      endDate = now;
    } else {
      // Current month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    // Fetch learning reports to get demo data
    const learningReports = await LearningReport.find({
      'reportData.Online demo counts': { $exists: true },
      lastUpdatedAt: { $gte: startDate, $lte: endDate }
    })
    .populate('user', 'name email author_id')
    .lean();

    const onlineDemos = [];
    const offlineDemos = [];

    learningReports.forEach(report => {
      const reportData = report.reportData || {};
      
      // Extract online demo data
      const onlineDemoCounts = reportData['Online demo counts'] || {};
      const onlineDemoRatings = reportData['Online demo ratings Average'] || {};
      
      Object.keys(onlineDemoCounts).forEach(course => {
        const count = parseFloat(onlineDemoCounts[course]) || 0;
        const rating = parseFloat(onlineDemoRatings[course]) || 0;
        
        if (count > 0) {
          onlineDemos.push({
            traineeName: report.user?.name || 'N/A',
            traineeId: report.user?.author_id || report.author_id,
            course: course,
            count: count,
            rating: rating,
            date: report.lastUpdatedAt,
            status: 'approved' // Default status
          });
        }
      });

      // Extract offline demo data
      const offlineDemoCounts = reportData['Offline demo counts'] || {};
      const offlineDemoRatings = reportData['Offline demo ratings Average'] || {};
      
      Object.keys(offlineDemoCounts).forEach(course => {
        const count = parseFloat(offlineDemoCounts[course]) || 0;
        const rating = parseFloat(offlineDemoRatings[course]) || 0;
        
        if (count > 0) {
          offlineDemos.push({
            traineeName: report.user?.name || 'N/A',
            traineeId: report.user?.author_id || report.author_id,
            course: course,
            count: count,
            rating: rating,
            date: report.lastUpdatedAt,
            status: 'approved' // Default status
          });
        }
      });
    });

    // Group by weekly/monthly
    const weeklyOnline = onlineDemos.filter(d => {
      const daysDiff = Math.floor((endDate - d.date) / (1000 * 60 * 60 * 24));
      return daysDiff <= 7;
    });
    
    const monthlyOnline = onlineDemos;
    
    const weeklyOffline = offlineDemos.filter(d => {
      const daysDiff = Math.floor((endDate - d.date) / (1000 * 60 * 60 * 24));
      return daysDiff <= 7;
    });
    
    const monthlyOffline = offlineDemos;

    res.json({
      success: true,
      data: {
        online: {
          weekly: weeklyOnline,
          monthly: monthlyOnline
        },
        offline: {
          weekly: weeklyOffline,
          monthly: monthlyOffline
        }
      }
    });

  } catch (error) {
    console.error('Error fetching demos report:', error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// @desc    Get attendance and grooming report
// @route   GET /api/reports/attendance-grooming
// @access  Private (Admin)
const getAttendanceGroomingReport = async (req, res) => {
  try {
    const { period = 'weekly' } = req.query;
    
    // Calculate date range based on period
    const now = new Date();
    let startDate, endDate;
    
    if (period === 'weekly') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
    }

    // Get total number of ACTIVE trainees only
    const totalTrainees = await User.countDocuments({ 
      role: 'trainee',
      $or: [
        { isActive: true, accountStatus: { $ne: 'deactivated' } },
        { isActive: true, status: 'active' }
      ]
    });

    // Helper function to check if a month key falls within date range
    const isMonthInRange = (monthKey, start, end) => {
      const monthOrder = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JULY', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      
      // Try to match "NOV'25" format
      let monthMatch = monthKey.match(/([A-Z]+)'(\d{2})/);
      let monthAbbr, year;
      
      if (monthMatch) {
        monthAbbr = monthMatch[1];
        year = '20' + monthMatch[2];
      } else {
        // Try to match "November Month" format
        const monthNameToFormatted = {
          "January Month": "JAN", "February Month": "FEB", "March Month": "MAR", "April Month": "APR",
          "May Month": "MAY", "June Month": "JUN", "July Month": "JULY", "August Month": "AUG",
          "September Month": "SEP", "October Month": "OCT", "November Month": "NOV", "December Month": "DEC"
        };
        
        if (monthNameToFormatted[monthKey]) {
          monthAbbr = monthNameToFormatted[monthKey];
          // Default to current year if not specified
          year = now.getFullYear().toString();
        } else {
          // Try numeric month (1-12)
          const monthNum = parseInt(monthKey);
          if (monthNum >= 1 && monthNum <= 12) {
            monthAbbr = monthOrder[monthNum - 1];
            year = now.getFullYear().toString();
          } else {
            return false;
          }
        }
      }
      
      const monthIndex = monthOrder.indexOf(monthAbbr);
      if (monthIndex !== -1) {
        const monthStart = new Date(parseInt(year), monthIndex, 1);
        monthStart.setHours(0, 0, 0, 0);
        const monthEnd = new Date(parseInt(year), monthIndex + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        // Check if month overlaps with date range
        return (monthStart <= end && monthEnd >= start);
      }
      return false;
    };

    // Fetch attendance data from AttendanceReport collection
    const attendanceReports = await AttendanceReport.find({})
      .populate('user', 'name email author_id isActive accountStatus status')
      .lean();

    console.log(`Found ${attendanceReports.length} attendance reports`);

    // Filter for active trainees only and populate user if missing
    const activeAttendanceReports = [];
    for (const report of attendanceReports) {
      let user = report.user;
      
      // If user is not populated, try to find it by author_id
      if (!user && report.author_id) {
        user = await User.findOne({ author_id: report.author_id })
          .select('name email author_id isActive accountStatus status')
          .lean();
      }
      
      // Also try to find by user ID if user field exists but is not populated
      if (!user && report.user) {
        const userId = typeof report.user === 'string' ? report.user : report.user.toString();
        user = await User.findById(userId)
          .select('name email author_id isActive accountStatus status')
          .lean();
      }
      
      if (!user) continue;
      
      // Check if user is an active trainee
      const isActiveTrainee = user.role === 'trainee' && 
                             user.isActive === true && 
                             (user.accountStatus !== 'deactivated' || user.status === 'active');
      
      if (isActiveTrainee) {
        // Attach user to report for later use
        report.user = user;
        activeAttendanceReports.push(report);
      }
    }

    console.log(`Filtered to ${activeAttendanceReports.length} active trainee reports`);

    // Count records by status
    let presentCount = 0;
    let leaveCount = 0;
    let absentCount = 0;

    // Track unique trainees for summary
    const presentTrainees = new Set();
    const absentTrainees = new Set();
    const leaveTrainees = new Set();

    // Helper to find value by multiple variations
    const findAttendanceValue = (obj, variations) => {
      if (!obj || typeof obj !== 'object') return null;
      for (const variation of variations) {
        if (obj[variation] !== undefined && obj[variation] !== null) {
          return obj[variation];
        }
      }
      const lowerVariations = variations.map(v => v.toLowerCase().trim());
      for (const key in obj) {
        const lowerKey = key.toLowerCase().trim();
        if (lowerVariations.includes(lowerKey) && obj[key] !== null && obj[key] !== undefined) {
          return obj[key];
        }
      }
      return null;
    };

    activeAttendanceReports.forEach(report => {
      const userId = report.user ? (report.user._id ? report.user._id.toString() : report.user.toString()) : null;
      if (!userId || !report.reportData) {
        console.log('Skipping report - no userId or reportData', { userId: !!userId, hasReportData: !!report.reportData });
        return;
      }

      const reportData = report.reportData;
      
      // Debug: log first report structure
      if (activeAttendanceReports.indexOf(report) === 0) {
        console.log('Sample reportData keys:', Object.keys(reportData));
        console.log('Sample totalWorkingDays keys:', Object.keys(findAttendanceValue(reportData, [
          'Total Working Days', 'total working days', 'Total working days', 'totalWorkingDays', 'workingDays', 'Working Days'
        ]) || {}));
      }
      
      // Get attendance data objects
      const totalWorkingDaysObj = findAttendanceValue(reportData, [
        'Total Working Days', 'total working days', 'Total working days', 'totalWorkingDays', 'workingDays', 'Working Days'
      ]) || {};
      
      const daysAttendedObj = findAttendanceValue(reportData, [
        'No of days attended', 'No Of Days Attended', 'No of Days Attended', 'daysAttended', 'noOfDaysAttended', 'Days Attended'
      ]) || {};
      
      const leavesTakenObj = findAttendanceValue(reportData, [
        'No of leaves taken', 'No Of Leaves Taken', 'No of Leaves Taken', 
        'No of leave taken', 'No Of Leave Taken', 'No of Leave Taken',
        'leavesTaken', 'noOfLeavesTaken', 'Leaves Taken',
        'Leaves', 'Leave', 'leaves', 'leave',
        'No of Leaves', 'No Of Leaves', 'Number of Leaves', 'Number Of Leaves',
        'Total Leaves', 'Total leaves'
      ]) || {};

      // Process each month in the date range
      // Get all possible month keys from all three objects
      const allMonthKeys = new Set([
        ...Object.keys(totalWorkingDaysObj),
        ...Object.keys(daysAttendedObj),
        ...Object.keys(leavesTakenObj)
      ]);

      allMonthKeys.forEach(monthKey => {
        // Check if this month overlaps with the date range
        const inRange = isMonthInRange(monthKey, startDate, endDate);
        if (!inRange) {
          return;
        }

        // Get values for this month key
        const workingDays = Number(totalWorkingDaysObj[monthKey]) || 0;
        const attended = Number(daysAttendedObj[monthKey]) || 0;
        const leaves = Number(leavesTakenObj[monthKey]) || 0;

        // For weekly view, we might want to include partial month data
        // For now, include all months that overlap with the date range
        if (workingDays > 0 || attended > 0 || leaves > 0) {
          // Count present days
          presentCount += attended;
          if (attended > 0) {
            presentTrainees.add(userId);
          }

          // Count leave days
          leaveCount += leaves;
          if (leaves > 0) {
            leaveTrainees.add(userId);
          }

          // Count absent days (working days - attended - leaves)
          // If workingDays is 0 but we have attended/leaves, calculate workingDays
          const actualWorkingDays = workingDays > 0 ? workingDays : (attended + leaves);
          const absent = actualWorkingDays - attended - leaves;
          if (absent > 0) {
            absentCount += absent;
            absentTrainees.add(userId);
          }
        }
      });
    });

    // Fetch grooming data from GroomingReport - filter for active trainees only
    const groomingReports = await GroomingReport.find({})
      .populate('user', 'name email author_id isActive accountStatus status')
      .lean();

    // Filter for active trainees only
    const activeGroomingReports = groomingReports.filter(report => {
      if (!report.user) return false;
      const user = report.user;
      return user.isActive === true && 
             (user.accountStatus !== 'deactivated' || user.status === 'active');
    });

    let dressCodeCount = 0;
    let hairCount = 0;
    let beardCount = 0;

    // Track unique trainees for grooming summary
    const compliantTrainees = new Set();
    const nonCompliantTrainees = new Set();

    activeGroomingReports.forEach(report => {
      const userId = report.user ? report.user._id ? report.user._id.toString() : report.user.toString() : null;
      const reportData = report.reportData || {};
      let hasNonCompliance = false;
      
      // Count from date-based entries (YYYY-MM-DD format)
      Object.keys(reportData).forEach(key => {
        // Check if key is a date (YYYY-MM-DD format)
        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
          const date = new Date(key);
          if (date >= startDate && date <= endDate) {
            const dayData = reportData[key];
            
            // Check if grooming status is "Dresscode NotFollowed"
            if (dayData && (
                dayData.grooming === 'Dresscode NotFollowed' || 
                dayData.status === 'Dresscode NotFollowed' ||
                dayData.dresscodeStatus === 'notFollowed' ||
                dayData === 'Dresscode NotFollowed')) {
              dressCodeCount++;
              hasNonCompliance = true;
            }
            
            // For hair and beard, check if there are specific fields
            if (dayData && typeof dayData === 'object') {
              if (dayData.hair === 'notFollowed' || dayData.hairStatus === 'notFollowed') {
                hairCount++;
                hasNonCompliance = true;
              }
              if (dayData.beard === 'notFollowed' || dayData.beardStatus === 'notFollowed') {
                beardCount++;
                hasNonCompliance = true;
              }
            }
          }
        }
      });
      
      // Also count from month-based structure as fallback
      const missedGrooming = reportData['How many times missed grooming check list'] || {};
      Object.values(missedGrooming).forEach(value => {
        if (typeof value === 'string' && value !== 'Dresscode Followed') {
          const missed = parseFloat(value) || 0;
          if (missed > 0) {
            dressCodeCount += missed;
            hasNonCompliance = true;
            if (hairCount === 0) hairCount += missed;
            if (beardCount === 0) beardCount += missed;
          }
        }
      });

      // Track compliance status
      if (userId) {
        if (hasNonCompliance) {
          nonCompliantTrainees.add(userId);
        } else {
          compliantTrainees.add(userId);
        }
      }
    });

    // Calculate summary
    const totalPresentTrainees = presentTrainees.size;
    const totalAbsentTrainees = new Set([...absentTrainees, ...leaveTrainees]).size;
    const totalCompliantTrainees = compliantTrainees.size;
    const totalNonCompliantTrainees = nonCompliantTrainees.size;

    res.json({
      success: true,
      data: {
        summary: {
          totalTrainees: totalTrainees,
          attendance: {
            totalPresent: totalPresentTrainees,
            totalAbsent: totalAbsentTrainees
          },
          grooming: {
            totalCompliant: totalCompliantTrainees,
            totalNonCompliant: totalNonCompliantTrainees
          }
        },
        attendance: {
          present: presentCount,
          leave: leaveCount,
          absent: absentCount
        },
        grooming: {
          dressCode: dressCodeCount,
          hair: hairCount,
          beard: beardCount
        }
      }
    });

  } catch (error) {
    console.error('Error fetching attendance/grooming report:', error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// @desc    Get fortnight exam report
// @route   GET /api/reports/fortnight
// @access  Private (Admin)
const getFortnightReport = async (req, res) => {
  try {
    const { period = 'weekly', month, year } = req.query;
    
    // Calculate date range based on period
    const now = new Date();
    let startDate, endDate;
    
    if (period === 'weekly') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      endDate = now;
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    // First, let's check what exam types exist in the database
    const allExamTypes = await Result.distinct('exam_type');
    console.log('All exam types in database:', allExamTypes);
    
    // Fetch Results for fortnight exams - use multiple patterns to catch variations
    // Try different patterns: fortnight, fornight (common typo), etc.
    const allFortnightResults = await Result.find({
      $or: [
        { exam_type: { $regex: /fortnight/i } },
        { exam_type: { $regex: /fornight/i } }, // Common typo
        { exam_type: { $regex: /^fortnight/i } },
        { exam_type: { $regex: /^fornight/i } }
      ]
    }).lean();

    console.log(`Total fortnight results found: ${allFortnightResults.length}`);
    if (allFortnightResults.length > 0) {
      console.log('Sample result:', {
        exam_type: allFortnightResults[0].exam_type,
        exam_date: allFortnightResults[0].exam_date,
        author_id: allFortnightResults[0].author_id,
        percentage: allFortnightResults[0].percentage
      });
    }
    
    // Filter by date range in application logic
    let fortnightResults = allFortnightResults.filter(result => {
      if (!result.exam_date) {
        console.log('Result missing exam_date:', result._id);
        return false;
      }
      const examDate = new Date(result.exam_date);
      if (isNaN(examDate.getTime())) {
        console.log('Invalid exam_date:', result.exam_date, 'for result:', result._id);
        return false;
      }
      // Set time to start/end of day for proper comparison
      const examDateOnly = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate());
      const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      return examDateOnly >= startDateOnly && examDateOnly <= endDateOnly;
    });

    console.log(`Fortnight results in date range (${startDate.toISOString()} to ${endDate.toISOString()}): ${fortnightResults.length}`);
    
    // If no results in date range, show all results (for debugging/development)
    if (fortnightResults.length === 0 && allFortnightResults.length > 0) {
      console.log('No results in date range, showing all results instead');
      fortnightResults = allFortnightResults;
    }

    // Get total trainee count (only active users)
    const totalTraineeCount = await User.countDocuments({ isActive: true });
    
    // Get number of terminated candidates (inactive users)
    const terminatedCount = await User.countDocuments({ isActive: false });
    
    // Get number of eligible candidates (active users) - same as total trainee count
    const eligibleCount = totalTraineeCount;

    console.log(`Total trainees: ${totalTraineeCount}, Eligible: ${eligibleCount}, Terminated: ${terminatedCount}`);

    // Calculate overall average
    let totalScore = 0;
    let totalAttempts = 0;
    
    fortnightResults.forEach(result => {
      const percentage = parseFloat(result.percentage) || 0;
      if (percentage > 0) {
        totalScore += percentage;
        totalAttempts++;
      }
    });

    const overallAverage = totalAttempts > 0 ? (totalScore / totalAttempts) : 0;

    // Group results by exam_date and extract fortnight details
    const detailedReports = {};
    
    if (fortnightResults.length === 0) {
      console.log('No fortnight results found in the specified date range');
    }
    
    fortnightResults.forEach(result => {
      if (!result.exam_date) {
        console.log('Result missing exam_date:', result._id);
        return;
      }
      
      const examDate = new Date(result.exam_date);
      if (isNaN(examDate.getTime())) {
        console.log('Invalid exam_date:', result.exam_date, 'for result:', result._id);
        return;
      }
      
      const dateKey = examDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Extract fortnight number from exam_type (e.g., "fortnight1" -> 1, "fortnight2" -> 2)
      const examType = result.exam_type || '';
      const fortnightMatch = examType.match(/fortnight(\d+)/i);
      const fortnightNumber = fortnightMatch ? parseInt(fortnightMatch[1]) : null;
      
      if (!detailedReports[dateKey]) {
        detailedReports[dateKey] = {
          date: dateKey,
          examDate: examDate,
          month: examDate.toLocaleString('default', { month: 'long' }),
          year: examDate.getFullYear(),
          fortnightNumber: fortnightNumber,
          uniqueAttempts: new Set(),
          percentages: [],
          totalScore: 0,
          attemptCount: 0
        };
      }
      
      // Track unique attempts by author_id
      if (result.author_id) {
        detailedReports[dateKey].uniqueAttempts.add(result.author_id);
      }
      const percentage = parseFloat(result.percentage) || 0;
      detailedReports[dateKey].percentages.push(percentage);
      detailedReports[dateKey].totalScore += percentage;
      detailedReports[dateKey].attemptCount++;
      
      // Update fortnight number if not set or if this one is more specific
      if (fortnightNumber && (!detailedReports[dateKey].fortnightNumber || detailedReports[dateKey].fortnightNumber < fortnightNumber)) {
        detailedReports[dateKey].fortnightNumber = fortnightNumber;
      }
    });
    
    console.log(`Grouped into ${Object.keys(detailedReports).length} unique dates`);

    // Convert to array and calculate metrics for each date
    const detailedReportArray = Object.values(detailedReports).map(report => {
      const attemptedCount = report.uniqueAttempts.size;
      const absenteesCount = eligibleCount - attemptedCount;
      const averagePercentage = report.percentages.length > 0 
        ? (report.totalScore / report.percentages.length) 
        : 0;

      // Format date as "DD-MMM-YYYY" (e.g., "8-Nov-2025")
      const day = report.examDate.getDate();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthAbbr = monthNames[report.examDate.getMonth()];
      const year = report.examDate.getFullYear();
      const formattedDate = `${day}-${monthAbbr}-${year}`;
      
      // Format month and year as "{Month} - {Year}" (e.g., "November - 2025")
      const monthYear = `${report.month} - ${report.year}`;

      return {
        month: report.month,
        year: report.year,
        monthYear: monthYear,
        date: report.date,
        formattedDate: formattedDate,
        fortnightNumber: report.fortnightNumber || 'N/A',
        totalTraineeCount: totalTraineeCount,
        eligibleCount: eligibleCount,
        attemptedCount: attemptedCount,
        absenteesCount: absenteesCount > 0 ? absenteesCount : 0,
        terminatedCount: terminatedCount,
        averagePercentage: parseFloat(averagePercentage.toFixed(2))
      };
    }).sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date descending

    console.log(`Final detailed reports array length: ${detailedReportArray.length}`);

    // If month and year are provided, calculate aggregated monthly report
    let monthlyReport = null;
    if (month && year) {
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      
      // Filter results for the specific month/year
      const monthlyResults = allFortnightResults.filter(result => {
        if (!result.exam_date) return false;
        const examDate = new Date(result.exam_date);
        if (isNaN(examDate.getTime())) return false;
        return examDate.getFullYear() === yearNum && examDate.getMonth() === (monthNum - 1);
      });
      
      // Aggregate data for the month
      const uniqueAttempts = new Set();
      const percentages = [];
      let totalScore = 0;
      let maxFortnightNumber = null;
      
      monthlyResults.forEach(result => {
        if (result.author_id) {
          uniqueAttempts.add(result.author_id);
        }
        const percentage = parseFloat(result.percentage) || 0;
        percentages.push(percentage);
        totalScore += percentage;
        
        // Extract fortnight number
        const examType = result.exam_type || '';
        const fortnightMatch = examType.match(/fortnight(\d+)/i);
        if (fortnightMatch) {
          const fortnightNum = parseInt(fortnightMatch[1]);
          if (maxFortnightNumber === null || fortnightNum > maxFortnightNumber) {
            maxFortnightNumber = fortnightNum;
          }
        }
      });
      
      const attemptedCount = uniqueAttempts.size;
      const absenteesCount = eligibleCount - attemptedCount;
      const averagePercentage = percentages.length > 0 
        ? (totalScore / percentages.length) 
        : 0;
      
      monthlyReport = {
        fortnightNumber: maxFortnightNumber || 'N/A',
        totalTraineeCount: totalTraineeCount,
        eligibleCount: eligibleCount,
        attemptedCount: attemptedCount,
        absenteesCount: absenteesCount > 0 ? absenteesCount : 0,
        terminatedCount: terminatedCount,
        averagePercentage: parseFloat(averagePercentage.toFixed(2))
      };
    }

    // Calculate course-wise averages
    const courseWiseData = {};
    
    fortnightResults.forEach(result => {
      // Extract course name from exam_type (e.g., "fortnight1 Static" -> "Static")
      const examType = result.exam_type || 'Unknown';
      let courseName = examType;
      
      // Try to extract course name if exam_type contains course name
      // Common patterns: "fortnight1 Static", "Fortnight Static", etc.
      const courseMatch = examType.match(/(?:fortnight\d*\s*)?(.+)/i);
      if (courseMatch && courseMatch[1]) {
        courseName = courseMatch[1].trim();
      }
      
      // If still contains "fortnight", try to remove it
      courseName = courseName.replace(/fortnight\d*/gi, '').trim();
      if (!courseName || courseName === '') {
        courseName = examType; // Fallback to original
      }
      
      const percentage = parseFloat(result.percentage) || 0;
      
      if (!courseWiseData[courseName]) {
        courseWiseData[courseName] = {
          totalScore: 0,
          totalAttempts: 0
        };
      }
      
      if (percentage > 0) {
        courseWiseData[courseName].totalScore += percentage;
        courseWiseData[courseName].totalAttempts++;
      }
    });

    const courseWise = Object.keys(courseWiseData)
      .filter(courseName => courseWiseData[courseName].totalAttempts > 0) // Only include courses with attempts
      .map(courseName => ({
        courseName: courseName,
        averageRating: courseWiseData[courseName].totalAttempts > 0 
          ? (courseWiseData[courseName].totalScore / courseWiseData[courseName].totalAttempts)
          : 0,
        totalAttempts: courseWiseData[courseName].totalAttempts
      }))
      .sort((a, b) => b.averageRating - a.averageRating); // Sort by average rating descending

    res.json({
      success: true,
      data: {
        overallAverage: overallAverage,
        courseWise: courseWise,
        detailedReports: detailedReportArray,
        monthlyReport: monthlyReport
      }
    });

  } catch (error) {
    console.error('Error fetching fortnight report:', error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

module.exports = {
  generateAttendanceReport,
  generateDayPlanComplianceReport,
  generateObservationReport,
  generateAssignmentReport,
  generateAuditLog,
  getDemosReport,
  getAttendanceGroomingReport,
  getFortnightReport
};