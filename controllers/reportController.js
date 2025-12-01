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
      endDate = now;
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    // Fetch attendance data
    const attendanceRecords = await Attendance.find({
      date: { $gte: startDate, $lte: endDate }
    }).lean();

    let presentCount = 0;
    let leaveCount = 0;
    let absentCount = 0;

    attendanceRecords.forEach(record => {
      if (record.status === 'present') {
        presentCount++;
      } else if (record.status === 'leave' || record.status === 'half_day') {
        leaveCount++;
      } else if (record.status === 'absent') {
        absentCount++;
      }
    });

    // Fetch grooming data from GroomingReport
    const groomingReports = await GroomingReport.find({
      lastUpdatedAt: { $gte: startDate, $lte: endDate }
    })
    .populate('user', 'name email author_id')
    .lean();

    let dressCodeCount = 0;
    let hairCount = 0;
    let beardCount = 0;

    groomingReports.forEach(report => {
      const reportData = report.reportData || {};
      
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
            }
            
            // For hair and beard, check if there are specific fields
            // If not available, use dress code count as fallback
            if (dayData && typeof dayData === 'object') {
              // Check for hair-specific fields (if they exist in the future)
              if (dayData.hair === 'notFollowed' || dayData.hairStatus === 'notFollowed') {
                hairCount++;
              }
              // Check for beard-specific fields (if they exist in the future)
              if (dayData.beard === 'notFollowed' || dayData.beardStatus === 'notFollowed') {
                beardCount++;
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
            // Use same count for hair and beard if not already counted
            if (hairCount === 0) hairCount += missed;
            if (beardCount === 0) beardCount += missed;
          }
        }
      });
    });

    res.json({
      success: true,
      data: {
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
    const { period = 'weekly' } = req.query;
    
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

    // Fetch Results for fortnight exams
    const fortnightResults = await Result.find({
      exam_type: { $regex: /fortnight/i },
      exam_date: { $gte: startDate, $lte: endDate }
    }).lean();

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
        courseWise: courseWise
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