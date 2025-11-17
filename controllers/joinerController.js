const Joiner = require('../models/Joiner');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Create a new joiner
const createJoiner = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      department,
      role = 'trainee',
      employeeId,
      genre,
      joiningDate,
      qualification,
      notes = ''
    } = req.body;

    // Check if joiner already exists
    const existingJoiner = await Joiner.findOne({ email });
    if (existingJoiner) {
      return res.status(400).json({
        message: 'Joiner with this email already exists'
      });
    }

    // Create joiner record
    const joiner = await Joiner.create({
      name,
      email,
      phone,
      department,
      role,
      employeeId: employeeId || null,
      genre: genre || null,
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
      qualification: qualification || null,
      notes,
      createdBy: req.user.id
    });

    res.status(201).json({
      message: 'Joiner added successfully',
      joiner: {
        _id: joiner._id,
        name: joiner.name,
        email: joiner.email,
        phone: joiner.phone,
        department: joiner.department,
        role: joiner.role,
        employeeId: joiner.employeeId,
        genre: joiner.genre,
        joiningDate: joiner.joiningDate,
        qualification: joiner.qualification,
        status: joiner.status,
        accountCreated: joiner.accountCreated,
        createdAt: joiner.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Get all joiners with filtering and pagination
const getJoiners = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      department,
      status,
      role,
      search,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};
    
    if (department) {
      query.department = department;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (role) {
      query.role = role;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (startDate && endDate) {
      query.joiningDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const joiners = await Joiner.find(query)
      .populate('createdBy', 'name email')
      .populate('userId', 'name email role')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Get total count for pagination
    const total = await Joiner.countDocuments(query);

    res.json({
      joiners,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Get joiner by ID
const getJoinerById = async (req, res) => {
  try {
    // Check if the ID is a valid MongoDB ObjectId (24 hex characters)
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    
    let joiner;
    if (isValidObjectId) {
      // Try to find by _id first if it's a valid ObjectId
      joiner = await Joiner.findById(req.params.id)
        .populate('createdBy', 'name email')
        .populate('userId', 'name email role');
    }
    
    if (!joiner) {
      // Try to find by author_id (UUID)
      joiner = await Joiner.findOne({ author_id: req.params.id })
        .populate('createdBy', 'name email')
        .populate('userId', 'name email role');
    }

    if (!joiner) {
      return res.status(404).json({
        message: 'Joiner not found'
      });
    }

    res.json(joiner);
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Update joiner
const updateJoiner = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      department,
      role,
      employeeId,
      genre,
      joiningDate,
      qualification,
      status,
      notes,
      notJoinedReason
    } = req.body;

    // Check if the ID is a valid MongoDB ObjectId (24 hex characters)
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    let joiner;
    if (isValidObjectId) {
      // Try to find by _id first if it's a valid ObjectId
      joiner = await Joiner.findById(req.params.id);
      }
    
    if (!joiner) {
      // Try to find by author_id (UUID)
      joiner = await Joiner.findOne({ author_id: req.params.id });
      }
    
    if (!joiner) {
      return res.status(404).json({
        message: 'Joiner not found'
      });
    }
    
    // Check if email is being changed and if it already exists
    if (email && email !== joiner.email) {
      const existingJoiner = await Joiner.findOne({ email, _id: { $ne: joiner._id } });
      if (existingJoiner) {
        return res.status(400).json({
          message: 'Email already exists'
        });
      }
    }

    // Update joiner
    const updatedJoiner = await Joiner.findByIdAndUpdate(
      joiner._id,
      {
        name: name || joiner.name,
        email: email || joiner.email,
        phone: phone || joiner.phone,
        department: department || joiner.department,
        role: role || joiner.role,
        employeeId: employeeId !== undefined ? employeeId : joiner.employeeId,
        genre: genre !== undefined ? genre : joiner.genre,
        joiningDate: joiningDate ? new Date(joiningDate) : joiner.joiningDate,
        qualification: qualification !== undefined ? qualification : joiner.qualification,
        status: status || joiner.status,
        notes: notes !== undefined ? notes : joiner.notes,
        notJoinedReason: notJoinedReason !== undefined ? notJoinedReason : joiner.notJoinedReason
      },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email')
     .populate('userId', 'name email role');

    res.json({
      message: 'Joiner updated successfully',
      joiner: updatedJoiner
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Delete joiner
const deleteJoiner = async (req, res) => {
  try {
    // Check if the ID is a valid MongoDB ObjectId (24 hex characters)
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    
    let joiner;
    if (isValidObjectId) {
      // Try to find by _id first if it's a valid ObjectId
      joiner = await Joiner.findById(req.params.id);
    }
    
    if (!joiner) {
      // Try to find by author_id (UUID)
      joiner = await Joiner.findOne({ author_id: req.params.id });
    }

    if (!joiner) {
      return res.status(404).json({
        message: 'Joiner not found'
      });
    }

    // If account is created, also delete the user account
    if (joiner.accountCreated && joiner.userId) {
      await User.findByIdAndDelete(joiner.userId);
    }

    await Joiner.findByIdAndDelete(joiner._id);

    res.json({
      message: 'Joiner deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Create user account for joiner
const createUserAccount = async (req, res) => {
  try {
    const joiner = await Joiner.findById(req.params.id);
    if (!joiner) {
      return res.status(404).json({
        message: 'Joiner not found'
      });
    }

    if (joiner.accountCreated) {
      return res.status(400).json({
        message: 'User account already created for this joiner'
      });
    }

    // Check if user with this email already exists
    const existingUser = await User.findOne({ email: joiner.email });
    if (existingUser) {
      return res.status(400).json({
        message: 'User with this email already exists'
      });
    }

    // Generate random password
    const password = Math.random().toString(36).slice(-8);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user account
    const user = await User.create({
      name: joiner.name,
      email: joiner.email,
      password: hashedPassword,
      role: joiner.role,
      phone: joiner.phone,
      department: joiner.department,
      employeeId: joiner.employeeId,
      genre: joiner.genre,
      joiningDate: joiner.joiningDate,
      isActive: true
    });

    // Update joiner record
    joiner.accountCreated = true;
    joiner.accountCreatedAt = new Date();
    joiner.userId = user._id;
    joiner.status = 'active';
    await joiner.save();

    res.json({
      message: 'User account created successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        password: password // Return plain password for display
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Get joiner statistics
const getJoinerStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = {};
    if (startDate && endDate) {
      query.joiningDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const stats = await Joiner.aggregate([
      { 
        $match: { 
          ...query,
          status: { $ne: 'inactive' } // Exclude inactive joiners from main stats
        } 
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          inactive: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          accountCreated: { $sum: { $cond: ['$accountCreated', 1, 0] } }
        }
      }
    ]);

    // Get department breakdown
    const departmentStats = await Joiner.aggregate([
      { 
        $match: { 
          ...query,
          status: { $ne: 'inactive' } // Exclude inactive joiners
        } 
      },
      {
        $group: {
          _id: '$department',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get daily joiners for calendar - only show active joiners
    const dailyJoiners = await Joiner.aggregate([
      { 
        $match: { 
          ...query,
          status: { $ne: 'inactive' } // Exclude inactive joiners
        } 
      },
      {
        $group: {
          _id: {
            year: { $year: '$joiningDate' },
            month: { $month: '$joiningDate' },
            day: { $dayOfMonth: '$joiningDate' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          year: '$_id.year',
          month: '$_id.month',
          day: '$_id.day',
          count: 1,
          _id: 0
        }
      }
    ]);

    // Debug: Log joiner status distribution
    const joinerStatusCounts = await Joiner.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Convert to simple YYYY-MM-DD format directly from year/month/day
    const processedDailyJoiners = dailyJoiners.map(item => {
      const year = item.year;
      const month = String(item.month).padStart(2, '0');
      const day = String(item.day).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      return {
        date: dateString,
        count: item.count
      };
    });

    // Debug: Log some sample joiners to see their actual dates
    const sampleJoiners = await Joiner.find({}).limit(5).select('candidate_name joiningDate date_of_joining joining_date');
    // // Debug: Test manual date creation for September 25, 26, 27
    const testDates = [
      { year: 2025, month: 9, day: 25 },
      { year: 2025, month: 9, day: 26 },
      { year: 2025, month: 9, day: 27 }
    ];
    
    testDates.forEach(testDate => {
      const dateString = `${testDate.year}-${String(testDate.month).padStart(2, '0')}-${String(testDate.day).padStart(2, '0')}`;
    });

    // Debug: Log the daily joiners data
    res.json({
      overview: stats[0] || {
        total: 0,
        pending: 0,
        active: 0,
        inactive: 0,
        completed: 0,
        accountCreated: 0
      },
      departmentStats,
      dailyJoiners: processedDailyJoiners
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get candidate details by author_id (Personal Details from DB, Reports from DB if available)
// @route   GET /api/joiners/candidate-details/:authorId
// @access  Private (BOA)
const getCandidateDetailsByAuthorId = async (req, res) => {
  try {
    const { authorId } = req.params;

    if (!authorId) {
      return res.status(400).json({
        message: 'Author ID is required'
      });
    }

    // Fetch Personal Details from database
    let user = await User.findOne({ author_id: authorId }).select('-password -tempPassword');
    
    if (!user) {
      // Try UserNew model as well
      const UserNew = require('../models/UserNew');
      user = await UserNew.findOne({ author_id: authorId }).select('-password -tempPassword');
    }

    if (!user) {
      return res.status(404).json({
        message: 'Candidate not found with this Author ID'
      });
    }

    // Fetch reports from database if available
    const CandidateReport = require('../models/CandidateReport');
    const existingReport = await CandidateReport.findOne({ author_id: authorId })
      .sort({ uploadedAt: -1 })
      .populate('uploadedBy', 'name email');

    // Prepare Personal Details
    const personalDetails = {
      uid: user.author_id,
      name: user.name,
      phoneNumber: user.phone || user.phoneNumber || null,
      emailId: user.email,
      employeeId: user.employeeId || null,
      doj: user.joiningDate || user.createdAt || null,
      state: user.state || null,
      highestQualification: user.qualification || null,
      specialization: user.specialization || null,
      haveMTechPC: user.haveMTechPC || null,
      haveMTechOD: user.haveMTechOD || null,
      yearOfPassing: user.yearOfPassing || null
    };

    // Prepare response
    const responseData = {
      personalDetails,
      learningReport: existingReport?.learningReport || null,
      attendanceReport: existingReport?.attendanceReport || null,
      groomingReport: existingReport?.groomingReport || null,
      interactionsReport: existingReport?.interactionsReport || null,
      reportsUploaded: !!existingReport,
      lastUploadedAt: existingReport?.uploadedAt || null,
      uploadedBy: existingReport?.uploadedBy ? {
        name: existingReport.uploadedBy.name,
        email: existingReport.uploadedBy.email
      } : null
    };

    res.status(200).json({
      success: true,
      message: 'Candidate details fetched successfully',
      data: responseData
    });

  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Upload candidate reports from Google Sheets
// @route   POST /api/joiners/candidate-details/:authorId/upload-reports
// @access  Private (BOA)
const uploadCandidateReports = async (req, res) => {
  try {
    const { authorId } = req.params;
    const { googleSheetUrl } = req.body;

    if (!authorId) {
      return res.status(400).json({
        message: 'Author ID is required'
      });
    }

    if (!googleSheetUrl) {
      return res.status(400).json({
        message: 'Google Sheet URL is required'
      });
    }

    // Verify user exists
    let user = await User.findOne({ author_id: authorId });
    if (!user) {
      const UserNew = require('../models/UserNew');
      user = await UserNew.findOne({ author_id: authorId });
    }

    if (!user) {
      return res.status(404).json({
        message: 'Candidate not found with this Author ID'
      });
    }

    const axios = require('axios');
    const CandidateReport = require('../models/CandidateReport');
    
    try {
      // Fetch data from Google Sheets with author_id parameter
      const urlWithParams = `${googleSheetUrl}${googleSheetUrl.includes('?') ? '&' : '?'}author_id=${authorId}`;
      const response = await axios.get(urlWithParams);
      
      // Check if response is HTML (error page)
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        return res.status(400).json({
          message: 'Google Sheets URL returned HTML instead of JSON. Please check your Apps Script deployment.',
          received: 'HTML'
        });
      }

      const sheetData = response.data;

      // Check if response is valid JSON object
      if (typeof sheetData !== 'object' || sheetData === null) {
        return res.status(400).json({
          message: 'Invalid response from Google Sheets. Expected JSON object.',
          received: typeof sheetData
        });
      }

      // Extract reports from sheet data
      const learningReport = sheetData.learningReport || sheetData['Learning Report'] || null;
      const attendanceReport = sheetData.attendanceReport || sheetData['Attendance Report'] || null;
      const groomingReport = sheetData.groomingReport || sheetData['Grooming Report'] || null;
      const interactionsReport = sheetData.interactionsReport || sheetData['Interactions Report'] || null;

      // Check if at least one report is available
      if (!learningReport && !attendanceReport && !groomingReport && !interactionsReport) {
        return res.status(400).json({
          message: 'No report data found in Google Sheets for this candidate'
        });
      }

      // Find existing report or create new one
      let candidateReport = await CandidateReport.findOne({ author_id: authorId });

      if (candidateReport) {
        // Update existing report
        candidateReport.learningReport = learningReport || candidateReport.learningReport;
        candidateReport.attendanceReport = attendanceReport || candidateReport.attendanceReport;
        candidateReport.groomingReport = groomingReport || candidateReport.groomingReport;
        candidateReport.interactionsReport = interactionsReport || candidateReport.interactionsReport;
        candidateReport.googleSheetUrl = googleSheetUrl;
        candidateReport.uploadedBy = req.user.id;
        candidateReport.uploadedAt = new Date();
        candidateReport.lastUpdatedAt = new Date();
        await candidateReport.save();
      } else {
        // Create new report
        candidateReport = await CandidateReport.create({
          author_id: authorId,
          user: user._id,
          learningReport,
          attendanceReport,
          groomingReport,
          interactionsReport,
          uploadedBy: req.user.id,
          googleSheetUrl
        });
      }

      res.status(200).json({
        success: true,
        message: 'Candidate reports uploaded successfully',
        data: {
          learningReport: candidateReport.learningReport,
          attendanceReport: candidateReport.attendanceReport,
          groomingReport: candidateReport.groomingReport,
          interactionsReport: candidateReport.interactionsReport,
          uploadedAt: candidateReport.uploadedAt,
          lastUpdatedAt: candidateReport.lastUpdatedAt
        }
      });

    } catch (error) {
      return res.status(400).json({
        message: 'Failed to fetch data from Google Sheets',
        error: error.message,
        details: error.response?.data
      });
    }

  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Validate Google Sheets for candidate reports
// @route   POST /api/joiners/candidate-reports/validate-sheets
// @access  Private (BOA)
const validateCandidateReportsSheets = async (req, res) => {
  try {
    const axios = require('axios');
    const { spread_sheet_name, data_sets_to_be_loaded, google_sheet_url } = req.body;

    if (!spread_sheet_name || !data_sets_to_be_loaded) {
      return res.status(400).json({ 
        message: 'Missing required fields: spread_sheet_name, data_sets_to_be_loaded' 
      });
    }

    let reportsData = [];

    // If Google Sheet URL is provided, try to fetch data
    if (google_sheet_url && google_sheet_url.trim()) {
      try {
        const response = await axios.get(google_sheet_url);
        
        // Check if response is HTML (error page)
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
          return res.status(400).json({
            message: 'Google Sheets URL returned HTML instead of JSON. Please check your Apps Script deployment.',
            received: 'HTML',
            suggestion: 'Make sure your Google Apps Script is properly deployed and returns JSON data'
          });
        }

        const sheetData = response.data;

        // Check if response is valid JSON object
        if (typeof sheetData !== 'object' || sheetData === null) {
          return res.status(400).json({
            message: 'Invalid response from Google Sheets. Expected JSON object.',
            received: typeof sheetData
          });
        }

        // Extract reports data from Apps Script response
        // Apps Script returns: { success: true, data: [{ author_id, learningReport, ... }] }
        if (sheetData.success && sheetData.data && Array.isArray(sheetData.data)) {
          reportsData = sheetData.data;
        } else if (Array.isArray(sheetData)) {
          reportsData = sheetData;
        } else if (sheetData.data && Array.isArray(sheetData.data)) {
          reportsData = sheetData.data;
        } else {
          // If no data array found, return empty array (manual entry mode)
          reportsData = [];
        }

      } catch (error) {
        return res.status(400).json({
          message: 'Failed to fetch data from Google Sheets',
          error: error.message,
          details: error.response?.data
        });
      }
    }

    res.status(200).json({
      message: 'Configuration validated successfully!',
      spread_sheet_name: spread_sheet_name,
      data_sets_to_be_loaded: data_sets_to_be_loaded,
      data: {
        spread_sheet_name: spread_sheet_name,
        data_sets_to_be_loaded: data_sets_to_be_loaded,
        data: reportsData
      }
    });

  } catch (error) {
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// @desc    Bulk upload candidate reports from Google Sheets
// @route   POST /api/joiners/candidate-reports/bulk-upload
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
        message: 'spread_sheet_name and data_sets_to_be_loaded are required'
      });
    }

    const axios = require('axios');
    const CandidateReport = require('../models/CandidateReport');
    const User = require('../models/User');
    const UserNew = require('../models/UserNew');

    let reportsData = [];

    // If Google Sheet URL is provided, fetch data from Google Sheets
    if (google_sheet_url && google_sheet_url.trim()) {
      try {
        const response = await axios.get(google_sheet_url);
        
        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
          return res.status(400).json({
            message: 'Google Sheets URL returned HTML instead of JSON. Please check your Apps Script deployment.',
            received: 'HTML'
          });
        }

        const sheetData = response.data;

        if (typeof sheetData !== 'object' || sheetData === null) {
          return res.status(400).json({
            message: 'Invalid response from Google Sheets. Expected JSON object.',
            received: typeof sheetData
          });
        }

        // Extract reports data from sheetData
        // Expected structure: { data: [{ author_id, learningReport, attendanceReport, ... }, ...] }
        if (sheetData.data && Array.isArray(sheetData.data)) {
          reportsData = sheetData.data;
        } else if (Array.isArray(sheetData)) {
          reportsData = sheetData;
        } else {
          return res.status(400).json({
            message: 'Invalid data structure from Google Sheets. Expected array of candidate reports.'
          });
        }

      } catch (error) {
        console.error('Google Sheets API error:', error);
        return res.status(400).json({
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
        message: 'Either google_sheet_url or candidate_reports_data must be provided'
      });
    }

    if (!reportsData || reportsData.length === 0) {
      return res.status(400).json({
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

        // Find user by author_id
        let user = await User.findOne({ author_id: reportData.author_id });
        if (!user) {
          user = await UserNew.findOne({ author_id: reportData.author_id });
        }

        if (!user) {
          errors.push(`Row ${i + 1}: User not found with author_id ${reportData.author_id}`);
          continue;
        }

        // Extract reports
        const learningReport = reportData.learningReport || reportData['Learning Report'] || null;
        const attendanceReport = reportData.attendanceReport || reportData['Attendance Report'] || null;
        const groomingReport = reportData.groomingReport || reportData['Grooming Report'] || null;
        const interactionsReport = reportData.interactionsReport || reportData['Interactions Report'] || null;

        // Check if at least one report is available
        if (!learningReport && !attendanceReport && !groomingReport && !interactionsReport) {
          errors.push(`Row ${i + 1}: No report data found for author_id ${reportData.author_id}`);
          continue;
        }

        // Find existing report or create new one
        let candidateReport = await CandidateReport.findOne({ author_id: reportData.author_id });

        if (candidateReport) {
          // Update existing report
          candidateReport.learningReport = learningReport || candidateReport.learningReport;
          candidateReport.attendanceReport = attendanceReport || candidateReport.attendanceReport;
          candidateReport.groomingReport = groomingReport || candidateReport.groomingReport;
          candidateReport.interactionsReport = interactionsReport || candidateReport.interactionsReport;
          candidateReport.googleSheetUrl = google_sheet_url || candidateReport.googleSheetUrl;
          candidateReport.uploadedBy = req.user.id;
          candidateReport.uploadedAt = new Date();
          candidateReport.lastUpdatedAt = new Date();
          await candidateReport.save();
          updatedCount++;
        } else {
          // Create new report
          candidateReport = await CandidateReport.create({
            author_id: reportData.author_id,
            user: user._id,
            learningReport,
            attendanceReport,
            groomingReport,
            interactionsReport,
            uploadedBy: req.user.id,
            googleSheetUrl: google_sheet_url
          });
          createdCount++;
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
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = {
  createJoiner,
  getJoiners,
  getJoinerById,
  updateJoiner,
  deleteJoiner,
  createUserAccount,
  getJoinerStats,
  getCandidateDetailsByAuthorId,
  uploadCandidateReports,
  validateCandidateReportsSheets,
  bulkUploadCandidateReports
};
