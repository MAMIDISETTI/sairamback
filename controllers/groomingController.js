const GroomingReport = require('../models/GroomingReport');
const User = require('../models/User');

// @desc    Mark grooming for trainee (by trainer)
// @route   POST /api/grooming/mark
// @access  Private (Trainer)
const markTraineeGrooming = async (req, res) => {
  try {
    const trainerId = req.user.id;
    const { traineeId, date, grooming } = req.body;

    if (!traineeId || !date || !grooming) {
      return res.status(400).json({ message: "Trainee ID, date, and grooming data are required" });
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

    // Find or create grooming report
    // Try to find by both user ID and author_id to handle all cases
    let groomingReport = await GroomingReport.findOne({
      $or: [
        { user: traineeId },
        { author_id: trainee.author_id || trainee._id.toString() }
      ]
    });

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0); // Normalize to start of day
    const dateKey = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD format

    console.log('Saving grooming data:', {
      traineeId,
      date,
      dateKey,
      grooming,
      author_id: trainee.author_id || trainee._id.toString()
    });

    if (!groomingReport) {
      // Create new grooming report
      const reportData = {
        [dateKey]: grooming
      };

      // Also initialize month-based structure for admin dashboard
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JULY', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const monthAbbr = monthNames[month];
      const yearShort = year.toString().slice(-2);
      const monthKey = `${monthAbbr}'${yearShort}`;

      // Initialize month-based structure
      reportData['How many times missed grooming check list'] = {};
      
      // Set initial value based on grooming status
      if (grooming.grooming === 'Dresscode NotFollowed' || 
          grooming.status === 'Dresscode NotFollowed' ||
          grooming.dresscodeStatus === 'notFollowed' ||
          grooming === 'Dresscode NotFollowed') {
        reportData['How many times missed grooming check list'][monthKey] = '1';
      } else {
        reportData['How many times missed grooming check list'][monthKey] = 'Dresscode Followed';
      }

      groomingReport = await GroomingReport.create({
        author_id: trainee.author_id || trainee._id.toString(),
        user: traineeId,
        reportData: reportData,
        uploadedBy: trainerId,
        uploadedAt: new Date(),
        lastUpdatedAt: new Date()
      });
      
      console.log('Created new grooming report:', groomingReport._id);
    } else {
      // Update existing grooming report
      // Ensure user and author_id are set correctly
      if (!groomingReport.user || groomingReport.user.toString() !== traineeId.toString()) {
        groomingReport.user = traineeId;
      }
      if (!groomingReport.author_id) {
        groomingReport.author_id = trainee.author_id || trainee._id.toString();
      }
      
      // Get existing reportData and ensure it's an object
      let reportData = groomingReport.reportData;
      if (!reportData || typeof reportData !== 'object') {
        reportData = {};
      }
      
      // Update the specific date entry
      reportData[dateKey] = {
        ...(reportData[dateKey] || {}),
        ...grooming
      };

      // Also aggregate by month for admin dashboard (similar to attendance)
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JULY', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const monthAbbr = monthNames[month];
      const yearShort = year.toString().slice(-2);
      const monthKey = `${monthAbbr}'${yearShort}`;

      // Initialize month-based structure if it doesn't exist
      if (!reportData['How many times missed grooming check list']) {
        reportData['How many times missed grooming check list'] = {};
      }

      // Count "Dresscode NotFollowed" occurrences for the month
      const monthStart = new Date(year, month, 1);
      monthStart.setHours(0, 0, 0, 0);
      const monthEnd = new Date(year, month + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);

      // Count all dates in this month with "Dresscode NotFollowed" or "notFollowed"
      let notFollowedCount = 0;
      Object.keys(reportData).forEach(key => {
        // Check if key is a date (YYYY-MM-DD format)
        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
          // Parse date correctly (YYYY-MM-DD format)
          const [yearStr, monthStr, dayStr] = key.split('-');
          const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr));
          date.setHours(0, 0, 0, 0);
          
          if (date >= monthStart && date <= monthEnd) {
            const dayData = reportData[key];
            // Check if grooming status is "Dresscode NotFollowed" or "notFollowed"
            if (dayData && (
                dayData.grooming === 'Dresscode NotFollowed' || 
                dayData.status === 'Dresscode NotFollowed' ||
                dayData.dresscodeStatus === 'notFollowed' ||
                dayData === 'Dresscode NotFollowed')) {
              notFollowedCount++;
            }
          }
        }
      });

      // Update month-based data
      if (notFollowedCount === 0) {
        reportData['How many times missed grooming check list'][monthKey] = 'Dresscode Followed';
      } else {
        reportData['How many times missed grooming check list'][monthKey] = notFollowedCount.toString();
      }

      // Mark reportData as modified to ensure Mongoose saves it
      groomingReport.reportData = reportData;
      groomingReport.markModified('reportData');
      groomingReport.lastUpdatedAt = new Date();
      
      const saved = await groomingReport.save();
      console.log('Updated grooming report:', saved._id, 'Date key:', dateKey, 'Data:', saved.reportData[dateKey]);
    }

    res.json({
      success: true,
      message: "Grooming marked successfully",
      grooming: groomingReport.reportData[dateKey]
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get grooming data for trainees
// @route   GET /api/grooming/trainees
// @access  Private (Trainer)
const getTraineeGrooming = async (req, res) => {
  try {
    const trainerId = req.user.id;
    const { date } = req.query;

    // Get trainer's assigned trainees
    const trainer = await User.findById(trainerId).populate('assignedTrainees');
    if (!trainer) {
      return res.status(404).json({ message: "Trainer not found" });
    }

    const traineeIds = trainer.assignedTrainees.map(t => t._id);
    const authorIds = trainer.assignedTrainees.map(t => t.author_id || t._id.toString());

    // Find grooming reports for assigned trainees
    const groomingReports = await GroomingReport.find({
      $or: [
        { user: { $in: traineeIds } },
        { author_id: { $in: authorIds } }
      ]
    }).populate('user', 'name email author_id');

    // Normalize date to YYYY-MM-DD format
    let dateKey;
    if (date) {
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
      dateKey = targetDate.toISOString().split('T')[0];
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dateKey = today.toISOString().split('T')[0];
    }


    const groomingData = {};
    groomingReports.forEach(report => {
      // Try to get user ID from populated user or direct reference
      let userId = null;
      if (report.user) {
        if (typeof report.user === 'object' && report.user._id) {
          userId = report.user._id.toString();
        } else {
          userId = report.user.toString();
        }
      }
      
      // If no user ID from user field, try to match by author_id
      if (!userId) {
        // Find matching trainee by author_id
        const matchingTrainee = trainer.assignedTrainees.find(
          t => (t.author_id || t._id.toString()) === report.author_id
        );
        if (matchingTrainee) {
          userId = matchingTrainee._id.toString();
        }
      }
      
      if (userId && report.reportData && report.reportData[dateKey]) {
        groomingData[userId] = report.reportData[dateKey];
      }
    });
    res.json(groomingData);

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  markTraineeGrooming,
  getTraineeGrooming
};

