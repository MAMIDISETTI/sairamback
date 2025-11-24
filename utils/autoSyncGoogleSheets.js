const googleSheetsSync = require('../services/googleSheetsSyncService');
const User = require('../models/User');
const UserNew = require('../models/UserNew');
const Joiner = require('../models/Joiner');

/**
 * Automatically sync data to Google Sheets when changes occur
 * This runs asynchronously and doesn't block the main operation
 */
const autoSyncToGoogleSheets = async (syncType = 'joiners', spreadsheetId = null) => {
  // Get spreadsheet ID from environment variable if not provided
  const targetSpreadsheetId = spreadsheetId || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  
  // If no spreadsheet ID is configured, skip auto-sync
  if (!targetSpreadsheetId) {
    console.log('[Auto-Sync] Skipped: No GOOGLE_SHEETS_SPREADSHEET_ID configured in environment variables');
    return;
  }

  // Run sync asynchronously without blocking
  setImmediate(async () => {
    try {
      console.log(`[Auto-Sync] Starting ${syncType} sync to Google Sheets...`);
      
      if (syncType === 'joiners') {
        await syncJoinersToSheet(targetSpreadsheetId);
      } else if (syncType === 'users') {
        await syncUsersToSheet(targetSpreadsheetId);
      }
      
      console.log(`[Auto-Sync] ${syncType} sync completed successfully`);
    } catch (error) {
      // Log error but don't throw - auto-sync failures shouldn't break the main operation
      console.error(`[Auto-Sync] ${syncType} sync error:`, error.message);
      console.error(`[Auto-Sync] Error stack:`, error.stack);
    }
  });
};

/**
 * Sync joiners to Google Sheets
 */
const syncJoinersToSheet = async (spreadsheetId) => {
  const sheetName = 'Joiners';
  
  const joiners = await Joiner.find({}).lean();

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

  await googleSheetsSync.writeToSheet(
    spreadsheetId,
    sheetName,
    headers,
    data,
    true
  );

  await googleSheetsSync.formatHeaders(spreadsheetId, sheetName);
  
  console.log(`[Auto-Sync] Successfully synced ${joiners.length} joiners to Google Sheets`);
};

/**
 * Sync users to Google Sheets
 */
const syncUsersToSheet = async (spreadsheetId) => {
  const sheetName = 'Users';
  
  // Fetch all users from both collections
  const users = await User.find({}).lean();
  const usersNew = await UserNew.find({}).lean();

  // Fetch all joiners to get proper employee IDs (NW format)
  const joiners = await Joiner.find({}).lean();
  
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

  await googleSheetsSync.writeToSheet(
    spreadsheetId,
    sheetName,
    headers,
    data,
    true
  );

  await googleSheetsSync.formatHeaders(spreadsheetId, sheetName);
  
  console.log(`[Auto-Sync] Successfully synced ${uniqueUsers.length} users to Google Sheets`);
};

module.exports = {
  autoSyncToGoogleSheets
};

