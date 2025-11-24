/**
 * Test script to verify Google Sheets Auto-Sync configuration
 * Run: node scripts/testAutoSync.js
 */

require('dotenv').config();
const { autoSyncToGoogleSheets } = require('../utils/autoSyncGoogleSheets');

console.log('=== Google Sheets Auto-Sync Configuration Test ===\n');

// Check environment variable
const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

if (!spreadsheetId) {
  console.log('❌ GOOGLE_SHEETS_SPREADSHEET_ID is NOT set in .env file');
  console.log('\nTo enable auto-sync:');
  console.log('1. Add this line to your .env file:');
  console.log('   GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id-here');
  console.log('\n2. Get your Spreadsheet ID from the Google Sheets URL:');
  console.log('   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit');
  console.log('\n3. Restart your server after adding the variable');
} else {
  console.log('✅ GOOGLE_SHEETS_SPREADSHEET_ID is set:', spreadsheetId);
  console.log('\nAuto-sync is configured and will run automatically when:');
  console.log('- A new joiner is created');
  console.log('- A new user is registered');
  console.log('- An admin creates a trainee account');
  console.log('\nNote: Auto-sync runs in the background and logs to console.');
  console.log('Check your server logs for [Auto-Sync] messages.');
}

console.log('\n=== Test Complete ===');

