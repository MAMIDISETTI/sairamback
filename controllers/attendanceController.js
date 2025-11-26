const Attendance = require("../models/Attendance");
const AttendanceReport = require("../models/AttendanceReport");
const User = require("../models/User");
const Notification = require("../models/Notification");

// @desc    Clock in user
// @route   POST /api/attendance/clock-in
// @access  Private (Trainer, Trainee)
const clockIn = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already clocked in today
    const existingAttendance = await Attendance.findOne({
      user: userId,
      date: today
    });

    if (existingAttendance && existingAttendance.clockIn.time) {
      return res.status(400).json({ 
        message: "Already clocked in today",
        clockInTime: existingAttendance.clockIn.time
      });
    }

    const clockInTime = new Date();
    const clockInData = {
      time: clockInTime,
      location: req.body.location || null,
      ipAddress: req.ip || req.connection.remoteAddress
    };

    if (existingAttendance) {
      // Update existing record
      existingAttendance.clockIn = clockInData;
      await existingAttendance.save();
    } else {
      // Create new attendance record
      await Attendance.create({
        user: userId,
        date: today,
        clockIn: clockInData
      });
    }

    // Update user's last clock in time
    await User.findByIdAndUpdate(userId, { lastClockIn: clockInTime });

    res.json({
      message: `Clocked in at ${clockInTime.toLocaleTimeString()}`,
      clockInTime: clockInTime,
      success: true
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Clock out user
// @route   POST /api/attendance/clock-out
// @access  Private (Trainer, Trainee)
const clockOut = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      user: userId,
      date: today
    });

    if (!attendance || !attendance.clockIn.time) {
      return res.status(400).json({ message: "Must clock in first" });
    }

    if (attendance.clockOut.time) {
      return res.status(400).json({ 
        message: "Already clocked out today",
        clockOutTime: attendance.clockOut.time
      });
    }

    const clockOutTime = new Date();
    const clockInTime = attendance.clockIn.time;
    
    // Calculate total hours
    const totalHours = (clockOutTime - clockInTime) / (1000 * 60 * 60);
    const isFullDay = totalHours >= 8;

    // Determine status
    let status = "present";
    if (totalHours < 4) {
      status = "half_day";
    } else if (totalHours > 10) {
      status = "overtime";
    }

    attendance.clockOut = {
      time: clockOutTime,
      location: req.body.location || null,
      ipAddress: req.ip || req.connection.remoteAddress
    };
    attendance.totalHours = totalHours;
    attendance.isFullDay = isFullDay;
    attendance.status = status;
    attendance.notes = req.body.notes || "";

    await attendance.save();

    // Update user's last clock out time
    await User.findByIdAndUpdate(userId, { lastClockOut: clockOutTime });

    res.json({
      message: `Clocked out at ${clockOutTime.toLocaleTimeString()}`,
      clockOutTime: clockOutTime,
      totalHours: totalHours.toFixed(2),
      isFullDay: isFullDay,
      status: status,
      success: true
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get today's attendance status
// @route   GET /api/attendance/today
// @access  Private (Trainer, Trainee)
const getTodayAttendance = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      user: userId,
      date: today
    });

    if (!attendance) {
      return res.json({
        clockedIn: false,
        clockedOut: false,
        clockInTime: null,
        clockOutTime: null,
        totalHours: 0,
        status: "absent"
      });
    }

    res.json({
      clockedIn: !!attendance.clockIn.time,
      clockedOut: !!attendance.clockOut.time,
      clockInTime: attendance.clockIn.time,
      clockOutTime: attendance.clockOut.time,
      totalHours: attendance.totalHours || 0,
      status: attendance.status,
      isFullDay: attendance.isFullDay
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get attendance history
// @route   GET /api/attendance/history
// @access  Private (Trainer, Trainee)
const getAttendanceHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, page = 1, limit = 30 } = req.query;

    let query = { user: userId };
    
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const attendances = await Attendance.find(query)
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('user', 'name email role');

    const total = await Attendance.countDocuments(query);

    res.json({
      attendances,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get trainee attendance (for trainers)
// @route   GET /api/attendance/trainees
// @access  Private (Trainer)
const getTraineeAttendance = async (req, res) => {
  try {
    const trainerId = req.user.id;
    const { date, traineeId } = req.query;

    // Get trainer's assigned trainees
    const trainer = await User.findById(trainerId).populate('assignedTrainees');
    if (!trainer) {
      return res.status(404).json({ message: "Trainer not found" });
    }

    let query = { 
      user: { $in: trainer.assignedTrainees.map(t => t._id) }
    };

    if (traineeId) {
      query.user = traineeId;
    }

    if (date) {
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
      query.date = targetDate;
    }

    const attendances = await Attendance.find(query)
      .populate('user', 'name email employeeId department')
      .sort({ date: -1 });

    res.json(attendances);

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Validate attendance (for trainers)
// @route   PUT /api/attendance/validate/:id
// @access  Private (Trainer)
const validateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const trainerId = req.user.id;
    const { isValid, notes } = req.body;

    const attendance = await Attendance.findById(id);
    if (!attendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    // Check if trainer has access to this trainee
    const trainer = await User.findById(trainerId);
    const hasAccess = trainer.assignedTrainees.includes(attendance.user);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    attendance.isValidated = isValid;
    attendance.validatedBy = trainerId;
    attendance.validatedAt = new Date();
    if (notes) {
      attendance.notes = notes;
    }

    await attendance.save();

    res.json({
      message: `Attendance ${isValid ? 'validated' : 'rejected'} successfully`,
      attendance
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Mark attendance for trainee (by trainer)
// @route   POST /api/attendance/mark
// @access  Private (Trainer)
const markTraineeAttendance = async (req, res) => {
  try {
    const trainerId = req.user.id;
    const { traineeId, date, status } = req.body;

    if (!traineeId || !date || !status) {
      return res.status(400).json({ message: "Trainee ID, date, and status are required" });
    }

    // Verify trainer has access to this trainee
    const trainer = await User.findById(trainerId);
    if (!trainer) {
      return res.status(404).json({ message: "Trainer not found" });
    }

    const trainee = await User.findById(traineeId);
    if (!trainee) {
      return res.status(404).json({ message: "Trainee not found" });
    }

    const hasAccess = trainer.assignedTrainees.some(
      id => id.toString() === traineeId
    );

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied. Trainee not assigned to you." });
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    let attendance = await Attendance.findOne({
      user: traineeId,
      date: targetDate
    });

    if (status === 'present') {
      const clockInTime = new Date();
      if (attendance) {
        attendance.clockIn = {
          time: clockInTime,
          location: req.body.location || null,
          ipAddress: req.ip || req.connection.remoteAddress
        };
        attendance.status = 'present';
        await attendance.save();
      } else {
        attendance = await Attendance.create({
          user: traineeId,
          date: targetDate,
          clockIn: {
            time: clockInTime,
            location: req.body.location || null,
            ipAddress: req.ip || req.connection.remoteAddress
          },
          status: 'present'
        });
      }
    } else if (status === 'absent') {
      if (attendance) {
        attendance.status = 'absent';
        attendance.notes = req.body.notes || 'Marked as absent by trainer';
        await attendance.save();
      } else {
        attendance = await Attendance.create({
          user: traineeId,
          date: targetDate,
          status: 'absent',
          notes: req.body.notes || 'Marked as absent by trainer'
        });
      }
    }

    // Also update AttendanceReport for admin dashboard
    try {
      const authorId = trainee.author_id || trainee._id.toString();
      let attendanceReport = await AttendanceReport.findOne({
        author_id: authorId
      });

      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      const monthNum = (month + 1).toString(); // Month number (1-12)
      
      // Format month key as "NOV'25" format
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JULY', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const monthAbbr = monthNames[month];
      const yearShort = year.toString().slice(-2);
      const monthKey = `${monthAbbr}'${yearShort}`;

      // Get or initialize reportData
      const reportData = attendanceReport?.reportData || {};
      
      // Initialize fields if they don't exist
      if (!reportData['Total Working Days']) {
        reportData['Total Working Days'] = {};
      }
      if (!reportData['No of days attended']) {
        reportData['No of days attended'] = {};
      }
      if (!reportData['No of leaves taken']) {
        reportData['No of leaves taken'] = {};
      }
      if (!reportData['Monthly Percentage']) {
        reportData['Monthly Percentage'] = {};
      }

      // Migrate any existing "November Month" format to "NOV'25" format to avoid duplicates
      const monthNameToFormatted = {
        "January Month": "JAN'25", "February Month": "FEB'25", "March Month": "MAR'25", "April Month": "APR'25",
        "May Month": "MAY'25", "June Month": "JUN'25", "July Month": "JULY'25", "August Month": "AUG'25",
        "September Month": "SEP'25", "October Month": "OCT'25", "November Month": "NOV'25", "December Month": "DEC'25"
      };
      
      const fieldsToMigrate = ['Total Working Days', 'No of days attended', 'No of leaves taken', 'Monthly Percentage'];
      fieldsToMigrate.forEach(field => {
        if (reportData[field] && typeof reportData[field] === 'object') {
          Object.keys(reportData[field]).forEach(key => {
            if (monthNameToFormatted[key]) {
              // Migrate "November Month" to "NOV'25" format
              const formattedKey = monthNameToFormatted[key];
              if (!reportData[field][formattedKey]) {
                reportData[field][formattedKey] = reportData[field][key];
              }
              // Remove old "November Month" key to avoid duplicates
              delete reportData[field][key];
            }
          });
        }
      });

      // Calculate working days for the month (excluding weekends)
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      let workingDays = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Exclude Sunday (0) and Saturday (6)
          workingDays++;
        }
      }

      // Count attended days for this month from Attendance model
      const monthStart = new Date(year, month, 1);
      monthStart.setHours(0, 0, 0, 0);
      const monthEnd = new Date(year, month + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);
      
      const monthAttendance = await Attendance.find({
        user: traineeId,
        date: { $gte: monthStart, $lte: monthEnd },
        status: 'present'
      });
      
      const attendedCount = monthAttendance.length;
      const leavesCount = Math.max(0, workingDays - attendedCount);
      const attendancePercentage = workingDays > 0 ? Math.round((attendedCount / workingDays) * 100) : 0;
      
      // Remove old numeric key if it exists to avoid duplicates
      if (reportData['Total Working Days'][monthNum]) {
        delete reportData['Total Working Days'][monthNum];
      }
      if (reportData['No of days attended'][monthNum]) {
        delete reportData['No of days attended'][monthNum];
      }
      if (reportData['No of leaves taken'][monthNum]) {
        delete reportData['No of leaves taken'][monthNum];
      }
      if (reportData['Monthly Percentage'][monthNum]) {
        delete reportData['Monthly Percentage'][monthNum];
      }
      
      // Use only formatted key (NOV'25 format) to avoid duplicates
      reportData['Total Working Days'][monthKey] = workingDays;
      reportData['No of days attended'][monthKey] = attendedCount;
      reportData['No of leaves taken'][monthKey] = leavesCount;
      reportData['Monthly Percentage'][monthKey] = attendancePercentage;

      if (!attendanceReport) {
        // Create new attendance report
        attendanceReport = await AttendanceReport.create({
          author_id: authorId,
          user: traineeId,
          reportData: reportData,
          uploadedBy: trainerId,
          uploadedAt: new Date(),
          lastUpdatedAt: new Date()
        });
      } else {
        // Update existing attendance report
        attendanceReport.reportData = reportData;
        attendanceReport.markModified('reportData');
        attendanceReport.lastUpdatedAt = new Date();
        await attendanceReport.save();
      }
    } catch (error) {
      console.error('Error updating AttendanceReport:', error);
      // Don't fail the request if AttendanceReport update fails
    }

    res.json({
      success: true,
      message: `Attendance marked as ${status}`,
      attendance
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  clockIn,
  clockOut,
  getTodayAttendance,
  getAttendanceHistory,
  getTraineeAttendance,
  validateAttendance,
  markTraineeAttendance
};
