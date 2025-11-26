const googleSheetsSync = require('../services/googleSheetsSyncService');
const User = require('../models/User');
const UserNew = require('../models/UserNew');
const Joiner = require('../models/Joiner');
const LearningReport = require('../models/LearningReport');
const AttendanceReport = require('../models/AttendanceReport');
const GroomingReport = require('../models/GroomingReport');
const InteractionsReport = require('../models/InteractionsReport');

/**
 * @route   POST /api/sync/users
 * @desc    Sync users data to Google Sheets
 * @access  Private (Admin)
 */
const syncUsers = async (req, res) => {
  try {
    // Use spreadsheet_id from request body, or fall back to environment variable
    const spreadsheet_id = req.body.spreadsheet_id || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const sheet_name = req.body.sheet_name || 'Users';

    if (!spreadsheet_id) {
      return res.status(400).json({
        success: false,
        message: 'Spreadsheet ID is required. Please set GOOGLE_SHEETS_SPREADSHEET_ID in your .env file or provide it in the request.',
      });
    }

    // Fetch all users from both collections (ensure fresh data)
    const users = await User.find({}).lean().exec();
    const usersNew = await UserNew.find({}).lean().exec();

    // Fetch all joiners to get proper employee IDs (NW format)
    const joiners = await Joiner.find({}).lean().exec();
    
    // Create a map of joiners by author_id and email for quick lookup
    const joinerMap = new Map();
    joiners.forEach(joiner => {
      if (joiner.author_id) {
        joinerMap.set(joiner.author_id.toLowerCase(), joiner);
      }
      if (joiner.email) {
        joinerMap.set(joiner.email.toLowerCase(), joiner);
      }
    });

    // Combine and deduplicate by email
    const allUsers = [...users, ...usersNew];
    const uniqueUsers = [];
    const seenEmails = new Set();

    allUsers.forEach(user => {
      const email = user.email?.toLowerCase();
      if (email && !seenEmails.has(email)) {
        seenEmails.add(email);
        uniqueUsers.push(user);
      }
    });

    // Prepare headers
    const headers = [
      'Name',
      'Email',
      'Employee ID',
      'Author ID',
      'Role',
      'Department',
      'Phone',
      'Status',
      'Is Active',
      'Account Status',
      'Joining Date',
      'Created At',
      'Updated At',
    ];

    // Prepare data rows with proper employee ID lookup
    const data = uniqueUsers.map(user => {
      // Get employee ID - prioritize joiner's employeeId (NW format)
      let employeeId = '';
      
      // Try to find joiner by author_id first
      if (user.author_id) {
        const joiner = joinerMap.get(user.author_id.toLowerCase());
        if (joiner && joiner.employeeId) {
          employeeId = String(joiner.employeeId).trim();
        }
      }
      
      // If not found by author_id, try by email
      if (!employeeId && user.email) {
        const joiner = joinerMap.get(user.email.toLowerCase());
        if (joiner && joiner.employeeId) {
          employeeId = String(joiner.employeeId).trim();
        }
      }
      
      // Fallback to user's employeeId if no joiner found
      if (!employeeId && user.employeeId) {
        employeeId = String(user.employeeId).trim();
      }

      return [
        user.name || '',
        user.email || '',
        employeeId,
        user.author_id || '',
        user.role || '',
        user.department || '',
        user.phone || user.phone_number || '',
        user.status || '',
        user.isActive ? 'Yes' : 'No',
        user.accountStatus || '',
        user.joiningDate ? new Date(user.joiningDate).toISOString().split('T')[0] : '',
        user.createdAt ? new Date(user.createdAt).toISOString().split('T')[0] : '',
        user.updatedAt ? new Date(user.updatedAt).toISOString().split('T')[0] : '',
      ];
    });

    // Write to Google Sheets
    const result = await googleSheetsSync.writeToSheet(
      spreadsheet_id,
      sheet_name,
      headers,
      data,
      true // clear first
    );

    // Format headers
    await googleSheetsSync.formatHeaders(spreadsheet_id, sheet_name);

    res.json({
      success: true,
      message: `Successfully synced ${uniqueUsers.length} users to Google Sheets`,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error syncing users to Google Sheets',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/sync/joiners
 * @desc    Sync joiners data to Google Sheets
 * @access  Private (Admin/BOA)
 */
const syncJoiners = async (req, res) => {
  try {
    // Use spreadsheet_id from request body, or fall back to environment variable
    const spreadsheet_id = req.body.spreadsheet_id || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const sheet_name = req.body.sheet_name || 'Joiners';

    if (!spreadsheet_id) {
      return res.status(400).json({
        success: false,
        message: 'Spreadsheet ID is required. Please set GOOGLE_SHEETS_SPREADSHEET_ID in your .env file or provide it in the request.',
      });
    }

    // Fetch all joiners (ensure fresh data)
    const joiners = await Joiner.find({}).lean().exec();

    const headers = [
      'Name',
      'Email',
      'Phone',
      'Employee ID',
      'Author ID',
      'Department',
      'Role',
      'Role Assign',
      'Joining Date',
      'Status',
      'Account Created',
      'Genre',
      'Qualification',
      'Created At',
      'Updated At',
    ];

    const data = joiners.map(joiner => [
      joiner.name || '',
      joiner.email || '',
      joiner.phone || joiner.phone_number || '',
      joiner.employeeId || '',
      joiner.author_id || '',
      joiner.department || '',
      joiner.role || '',
      joiner.role_assign || '',
      joiner.joiningDate ? new Date(joiner.joiningDate).toISOString().split('T')[0] : '',
      joiner.status || '',
      joiner.accountCreated ? 'Yes' : 'No',
      joiner.genre || '',
      joiner.qualification || '',
      joiner.createdAt ? new Date(joiner.createdAt).toISOString().split('T')[0] : '',
      joiner.updatedAt ? new Date(joiner.updatedAt).toISOString().split('T')[0] : '',
    ]);

    const result = await googleSheetsSync.writeToSheet(
      spreadsheet_id,
      sheet_name,
      headers,
      data,
      true
    );

    await googleSheetsSync.formatHeaders(spreadsheet_id, sheet_name);

    res.json({
      success: true,
      message: `Successfully synced ${joiners.length} joiners to Google Sheets`,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error syncing joiners to Google Sheets',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/sync/candidate-reports
 * @desc    Sync candidate reports to Google Sheets
 * @access  Private (Admin/BOA)
 */
const syncCandidateReports = async (req, res) => {
  try {
    // Use spreadsheet_id from request body, or fall back to environment variable
    const spreadsheet_id = req.body.spreadsheet_id || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const report_type = req.body.report_type || 'all'; // 'all', 'learning', 'attendance', 'grooming', 'interactions'

    if (!spreadsheet_id) {
      return res.status(400).json({
        success: false,
        message: 'Spreadsheet ID is required. Please set GOOGLE_SHEETS_SPREADSHEET_ID in your .env file or provide it in the request.',
      });
    }

    const results = {};

    // Sync Learning Reports
    if (report_type === 'all' || report_type === 'learning') {
      const learningReports = await LearningReport.find({}).populate('user', 'name email author_id').lean();
      
      const headers = ['Author ID', 'Name', 'Email', 'Report Data', 'Uploaded At', 'Last Updated At'];
      const data = learningReports.map(report => [
        report.author_id || '',
        report.user?.name || '',
        report.user?.email || '',
        JSON.stringify(report.reportData || {}),
        report.uploadedAt ? new Date(report.uploadedAt).toISOString() : '',
        report.lastUpdatedAt ? new Date(report.lastUpdatedAt).toISOString() : '',
      ]);

      const result = await googleSheetsSync.writeToSheet(
        spreadsheet_id,
        'Learning Reports',
        headers,
        data,
        true
      );
      await googleSheetsSync.formatHeaders(spreadsheet_id, 'Learning Reports');
      results.learning = result;
    }

    // Sync Attendance Reports
    if (report_type === 'all' || report_type === 'attendance') {
      const attendanceReports = await AttendanceReport.find({}).populate('user', 'name email author_id').lean();
      
      const headers = ['Author ID', 'Name', 'Email', 'Report Data', 'Uploaded At', 'Last Updated At'];
      const data = attendanceReports.map(report => [
        report.author_id || '',
        report.user?.name || '',
        report.user?.email || '',
        JSON.stringify(report.reportData || {}),
        report.uploadedAt ? new Date(report.uploadedAt).toISOString() : '',
        report.lastUpdatedAt ? new Date(report.lastUpdatedAt).toISOString() : '',
      ]);

      const result = await googleSheetsSync.writeToSheet(
        spreadsheet_id,
        'Attendance Reports',
        headers,
        data,
        true
      );
      await googleSheetsSync.formatHeaders(spreadsheet_id, 'Attendance Reports');
      results.attendance = result;
    }

    // Sync Grooming Reports
    if (report_type === 'all' || report_type === 'grooming') {
      const groomingReports = await GroomingReport.find({}).populate('user', 'name email author_id').lean();
      
      const headers = ['Author ID', 'Name', 'Email', 'Report Data', 'Uploaded At', 'Last Updated At'];
      const data = groomingReports.map(report => [
        report.author_id || '',
        report.user?.name || '',
        report.user?.email || '',
        JSON.stringify(report.reportData || {}),
        report.uploadedAt ? new Date(report.uploadedAt).toISOString() : '',
        report.lastUpdatedAt ? new Date(report.lastUpdatedAt).toISOString() : '',
      ]);

      const result = await googleSheetsSync.writeToSheet(
        spreadsheet_id,
        'Grooming Reports',
        headers,
        data,
        true
      );
      await googleSheetsSync.formatHeaders(spreadsheet_id, 'Grooming Reports');
      results.grooming = result;
    }

    // Sync Interactions Reports
    if (report_type === 'all' || report_type === 'interactions') {
      const interactionsReports = await InteractionsReport.find({}).populate('user', 'name email author_id').lean();
      
      const headers = ['Author ID', 'Name', 'Email', 'Report Data', 'Uploaded At', 'Last Updated At'];
      const data = interactionsReports.map(report => [
        report.author_id || '',
        report.user?.name || '',
        report.user?.email || '',
        JSON.stringify(report.reportData || {}),
        report.uploadedAt ? new Date(report.uploadedAt).toISOString() : '',
        report.lastUpdatedAt ? new Date(report.lastUpdatedAt).toISOString() : '',
      ]);

      const result = await googleSheetsSync.writeToSheet(
        spreadsheet_id,
        'Interactions Reports',
        headers,
        data,
        true
      );
      await googleSheetsSync.formatHeaders(spreadsheet_id, 'Interactions Reports');
      results.interactions = result;
    }

    res.json({
      success: true,
      message: 'Successfully synced candidate reports to Google Sheets',
      results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error syncing candidate reports to Google Sheets',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/sync/all
 * @desc    Sync all data to Google Sheets
 * @access  Private (Admin)
 */
const syncAll = async (req, res) => {
  try {
    // Use spreadsheet_id from request body, or fall back to environment variable
    const spreadsheet_id = req.body.spreadsheet_id || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    if (!spreadsheet_id) {
      return res.status(400).json({
        success: false,
        message: 'Spreadsheet ID is required. Please set GOOGLE_SHEETS_SPREADSHEET_ID in your .env file or provide it in the request.',
      });
    }

    const results = {};

    // Sync users
    try {
      await syncUsers({ body: { spreadsheet_id, sheet_name: 'Users' } }, {
        json: (data) => { results.users = data; },
        status: () => ({ json: () => {} }),
      });
    } catch (error) {
      results.users = { success: false, error: error.message };
    }

    // Sync joiners
    try {
      await syncJoiners({ body: { spreadsheet_id, sheet_name: 'Joiners' } }, {
        json: (data) => { results.joiners = data; },
        status: () => ({ json: () => {} }),
      });
    } catch (error) {
      results.joiners = { success: false, error: error.message };
    }

    // Sync candidate reports
    try {
      await syncCandidateReports({ body: { spreadsheet_id, report_type: 'all' } }, {
        json: (data) => { results.reports = data; },
        status: () => ({ json: () => {} }),
      });
    } catch (error) {
      results.reports = { success: false, error: error.message };
    }

    res.json({
      success: true,
      message: 'Sync completed',
      results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error syncing all data to Google Sheets',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/sync/config
 * @desc    Get Google Sheets sync configuration status
 * @access  Private (Admin)
 */
const getSyncConfig = async (req, res) => {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    res.json({
      success: true,
      configured: !!spreadsheetId,
      spreadsheetId: spreadsheetId || null,
      message: spreadsheetId 
        ? 'Google Sheets sync is configured' 
        : 'Google Sheets sync is not configured. Please set GOOGLE_SHEETS_SPREADSHEET_ID in your .env file.',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error getting sync configuration',
      error: error.message,
    });
  }
};

module.exports = {
  syncUsers,
  syncJoiners,
  syncCandidateReports,
  syncAll,
  getSyncConfig,
};

