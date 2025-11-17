const User = require('../models/User');
const UserNew = require('../models/UserNew');
const LearningReport = require('../models/LearningReport');
const AttendanceReport = require('../models/AttendanceReport');
const GroomingReport = require('../models/GroomingReport');
const InteractionsReport = require('../models/InteractionsReport');
const Joiner = require('../models/Joiner');
const axios = require('axios');

// @desc    Validate author_id exists in users collection
// @route   POST /api/candidate-reports/validate-author
// @access  Private (BOA)
const validateAuthorId = async (req, res) => {
  try {
    const { author_id } = req.body;

    if (!author_id) {
      return res.status(400).json({
        success: false,
        message: 'Author ID is required'
      });
    }

    // Check if author_id exists in User model
    let user = await User.findOne({ author_id: author_id.trim() });
    
    if (!user) {
      // Try UserNew model as well
      user = await UserNew.findOne({ author_id: author_id.trim() });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User with author_id "${author_id}" not found in users collection`
      });
    }

    res.status(200).json({
      success: true,
      message: 'Author ID validated successfully',
      user: {
        author_id: user.author_id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Bulk upload candidate reports to separate collections
// @route   POST /api/candidate-reports/bulk-upload
// @access  Private (BOA)
const bulkUploadCandidateReports = async (req, res) => {
  try {
    const { 
      spread_sheet_name, 
      data_sets_to_be_loaded, 
      google_sheet_url,
      candidate_reports_data 
    } = req.body;

    if (!spread_sheet_name || !data_sets_to_be_loaded) {
      return res.status(400).json({
        success: false,
        message: 'spread_sheet_name and data_sets_to_be_loaded are required'
      });
    }

    let reportsData = [];

    // If Google Sheet URL is provided, fetch data from Google Sheets
    if (google_sheet_url && google_sheet_url.trim()) {
      try {
        const response = await axios.get(google_sheet_url);
        
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
          return res.status(400).json({
            success: false,
            message: 'Google Sheets URL returned HTML instead of JSON. Please check your Apps Script deployment.',
            received: 'HTML'
          });
        }

        const sheetData = response.data;

        if (typeof sheetData !== 'object' || sheetData === null) {
          return res.status(400).json({
            success: false,
            message: 'Invalid response from Google Sheets. Expected JSON object.',
            received: typeof sheetData
          });
        }

        // Extract reports data from Apps Script response
        if (sheetData.success && sheetData.data && Array.isArray(sheetData.data)) {
          reportsData = sheetData.data;
        } else if (Array.isArray(sheetData)) {
          reportsData = sheetData;
        } else if (sheetData.data && Array.isArray(sheetData.data)) {
          reportsData = sheetData.data;
        } else {
          return res.status(400).json({
            success: false,
            message: 'Invalid data structure from Google Sheets. Expected array of candidate reports.'
          });
        }

      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Failed to fetch data from Google Sheets',
          error: error.message,
          details: error.response?.data
        });
      }
    } else if (candidate_reports_data && Array.isArray(candidate_reports_data)) {
      // Use provided data if no Google Sheet URL
      reportsData = candidate_reports_data;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either google_sheet_url or candidate_reports_data must be provided'
      });
    }

    if (!reportsData || reportsData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No candidate reports data found'
      });
    }

    // Process each candidate report
    const processedReports = [];
    const errors = [];
    let createdCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < reportsData.length; i++) {
      try {
        const reportData = reportsData[i];
        
        if (!reportData.author_id) {
          errors.push(`Row ${i + 1}: author_id is required`);
          continue;
        }

        // Validate author_id exists in users collection
        let user = await User.findOne({ author_id: reportData.author_id.trim() });
        if (!user) {
          user = await UserNew.findOne({ author_id: reportData.author_id.trim() });
        }

        if (!user) {
          errors.push(`Row ${i + 1}: User not found with author_id ${reportData.author_id}`);
          continue;
        }

        // Extract reports
        const learningReport = reportData.learningReport || null;
        const attendanceReport = reportData.attendanceReport || null;
        const groomingReport = reportData.groomingReport || null;
        const interactionsReport = reportData.interactionsReport || null;

        // Save Learning Report
        if (learningReport && Object.keys(learningReport).length > 0) {
          let learningReportDoc = await LearningReport.findOne({ author_id: reportData.author_id });
          if (learningReportDoc) {
            learningReportDoc.reportData = learningReport;
            learningReportDoc.uploadedBy = req.user.id;
            learningReportDoc.uploadedAt = new Date();
            learningReportDoc.lastUpdatedAt = new Date();
            await learningReportDoc.save();
            updatedCount++;
          } else {
            await LearningReport.create({
              author_id: reportData.author_id,
              user: user._id,
              reportData: learningReport,
              uploadedBy: req.user.id
            });
            createdCount++;
          }
        }

        // Save Attendance Report
        if (attendanceReport && Object.keys(attendanceReport).length > 0) {
          let attendanceReportDoc = await AttendanceReport.findOne({ author_id: reportData.author_id });
          if (attendanceReportDoc) {
            attendanceReportDoc.reportData = attendanceReport;
            attendanceReportDoc.uploadedBy = req.user.id;
            attendanceReportDoc.uploadedAt = new Date();
            attendanceReportDoc.lastUpdatedAt = new Date();
            await attendanceReportDoc.save();
            updatedCount++;
          } else {
            await AttendanceReport.create({
              author_id: reportData.author_id,
              user: user._id,
              reportData: attendanceReport,
              uploadedBy: req.user.id
            });
            createdCount++;
          }
        }

        // Save Grooming Report
        if (groomingReport && Object.keys(groomingReport).length > 0) {
          let groomingReportDoc = await GroomingReport.findOne({ author_id: reportData.author_id });
          if (groomingReportDoc) {
            groomingReportDoc.reportData = groomingReport;
            groomingReportDoc.uploadedBy = req.user.id;
            groomingReportDoc.uploadedAt = new Date();
            groomingReportDoc.lastUpdatedAt = new Date();
            await groomingReportDoc.save();
            updatedCount++;
          } else {
            await GroomingReport.create({
              author_id: reportData.author_id,
              user: user._id,
              reportData: groomingReport,
              uploadedBy: req.user.id
            });
            createdCount++;
          }
        }

        // Save Interactions Report
        if (interactionsReport && (Array.isArray(interactionsReport) ? interactionsReport.length > 0 : Object.keys(interactionsReport).length > 0)) {
          let interactionsReportDoc = await InteractionsReport.findOne({ author_id: reportData.author_id });
          if (interactionsReportDoc) {
            interactionsReportDoc.reportData = interactionsReport;
            interactionsReportDoc.uploadedBy = req.user.id;
            interactionsReportDoc.uploadedAt = new Date();
            interactionsReportDoc.lastUpdatedAt = new Date();
            await interactionsReportDoc.save();
            updatedCount++;
          } else {
            await InteractionsReport.create({
              author_id: reportData.author_id,
              user: user._id,
              reportData: interactionsReport,
              uploadedBy: req.user.id
            });
            createdCount++;
          }
        }

        processedReports.push({
          author_id: reportData.author_id,
          name: user.name,
          email: user.email
        });

      } catch (error) {
        errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    res.status(200).json({
      success: true,
      message: `Successfully processed ${processedReports.length} candidate reports`,
      createdCount,
      updatedCount,
      totalProcessed: processedReports.length,
      errors: errors.length > 0 ? errors : undefined,
      processedReports
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get candidate performance data (all reports)
// @route   GET /api/candidate-reports/performance/:authorId
// @access  Private (Admin)
const getCandidatePerformance = async (req, res) => {
  try {
    const { authorId } = req.params;

    if (!authorId) {
      return res.status(400).json({
        success: false,
        message: 'Author ID is required'
      });
    }

    // Fetch Personal Details from users collection
    let user = await User.findOne({ author_id: authorId })
      .select('-password -tempPassword')
      .lean();
    
    let userModel = 'User';
    
    if (!user) {
      // Try UserNew model as well
      user = await UserNew.findOne({ author_id: authorId })
        .select('-password -tempPassword')
        .lean();
      userModel = 'UserNew';
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this author_id'
      });
    }

    // Get employee ID - check joiner collection for NW format
    let finalEmployeeId = null;
    let joiner = null;
    
    try {
      // Try to find joiner by author_id first
      joiner = await Joiner.findOne({ author_id: authorId }).lean();
      
      // If not found by author_id, try by email
      if (!joiner && user.email) {
        joiner = await Joiner.findOne({
          $or: [
            { email: user.email.toLowerCase() },
            { candidate_personal_mail_id: user.email.toLowerCase() }
          ]
        }).lean();
      }
      
      // If joiner found, use joiner's employeeId (NW format)
      if (joiner && joiner.employeeId) {
        finalEmployeeId = String(joiner.employeeId).trim();
      }
    } catch (err) {
      // Error fetching joiner - continue with user's employeeId
    }
    
    // If no joiner employeeId found, use user's employeeId (even if EMP_ format)
    if (!finalEmployeeId && user.employeeId) {
      finalEmployeeId = String(user.employeeId).trim();
    }

    // Prepare Personal Details from users collection
    const personalDetails = {
      uid: user.author_id,
      name: user.name,
      email: user.email,
      phone: user.phone || user.phone_number || null,
      phoneNumber: user.phone || user.phone_number || null,
      employeeId: finalEmployeeId || null,
      dateOfJoining: user.joiningDate || user.date_of_joining || user.createdAt || null,
      joiningDate: user.joiningDate || user.date_of_joining || user.createdAt || null,
      state: user.state || null,
      qualification: user.qualification || null,
      highestQualification: user.qualification || null,
      specialization: user.specialization || null,
      haveMTechPC: user.haveMTechPC || null,
      haveMTechOD: user.haveMTechOD || null,
      yearOfPassout: user.yearOfPassout || user.yearOfPassing || null,
      yearOfPassing: user.yearOfPassout || user.yearOfPassing || null,
      department: user.department || null,
      role: user.role || null
    };

    // Fetch all reports for the candidate (get the latest one if multiple exist)
    const learningReportDoc = await LearningReport.find({ author_id: authorId })
      .populate('uploadedBy', 'name email')
      .sort({ uploadedAt: -1 })
      .limit(1)
      .lean();
    const learningReport = learningReportDoc && learningReportDoc.length > 0 ? learningReportDoc[0] : null;

    const attendanceReportDoc = await AttendanceReport.find({ author_id: authorId })
      .populate('uploadedBy', 'name email')
      .sort({ uploadedAt: -1 })
      .limit(1)
      .lean();
    const attendanceReport = attendanceReportDoc && attendanceReportDoc.length > 0 ? attendanceReportDoc[0] : null;

    const groomingReportDoc = await GroomingReport.find({ author_id: authorId })
      .populate('uploadedBy', 'name email')
      .sort({ uploadedAt: -1 })
      .limit(1)
      .lean();
    const groomingReport = groomingReportDoc && groomingReportDoc.length > 0 ? groomingReportDoc[0] : null;

    const interactionsReportDoc = await InteractionsReport.find({ author_id: authorId })
      .populate('uploadedBy', 'name email')
      .sort({ uploadedAt: -1 })
      .limit(1)
      .lean();
    const interactionsReport = interactionsReportDoc && interactionsReportDoc.length > 0 ? interactionsReportDoc[0] : null;

    res.status(200).json({
      success: true,
      data: {
        personalDetails,
        learningReport: learningReport ? {
          reportData: learningReport.reportData,
          uploadedAt: learningReport.uploadedAt,
          uploadedBy: learningReport.uploadedBy
        } : null,
        attendanceReport: attendanceReport ? {
          reportData: attendanceReport.reportData,
          uploadedAt: attendanceReport.uploadedAt,
          uploadedBy: attendanceReport.uploadedBy
        } : null,
        groomingReport: groomingReport ? {
          reportData: groomingReport.reportData,
          uploadedAt: groomingReport.uploadedAt,
          uploadedBy: groomingReport.uploadedBy
        } : null,
        interactionsReport: interactionsReport ? {
          reportData: interactionsReport.reportData,
          uploadedAt: interactionsReport.uploadedAt,
          uploadedBy: interactionsReport.uploadedBy
        } : null
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = {
  validateAuthorId,
  bulkUploadCandidateReports,
  getCandidatePerformance
};

