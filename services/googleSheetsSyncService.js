const { google } = require('googleapis');
const path = require('path');

class GoogleSheetsSyncService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.initialized = false;
  }

  /**
   * Initialize Google Sheets API with service account
   */
  async initialize() {
    if (this.initialized && this.sheets) {
      return;
    }

    try {
      // Option 1: Use service account key file path
      if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
        this.auth = new google.auth.GoogleAuth({
          keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
      }
      // Option 2: Use service account JSON as environment variable
      else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        try {
          // Handle both string JSON and already parsed JSON
          let credentials;
          if (typeof process.env.GOOGLE_SERVICE_ACCOUNT_JSON === 'string') {
            credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
          } else {
            credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
          }
          
          this.auth = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          });
        } catch (parseError) {
          throw new Error(`Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON: ${parseError.message}. Make sure the JSON is valid and properly escaped.`);
        }
      }
      // Option 3: Use OAuth2 (for user-based access)
      else if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );
        
        if (process.env.GOOGLE_REFRESH_TOKEN) {
          oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
          });
        }
        
        this.auth = oauth2Client;
      }
      else {
        throw new Error('Google Sheets authentication not configured. Please set GOOGLE_SERVICE_ACCOUNT_KEY_PATH, GOOGLE_SERVICE_ACCOUNT_JSON, or OAuth2 credentials.');
      }

      const authClient = await this.auth.getClient();
      this.sheets = google.sheets({ version: 'v4', auth: authClient });
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Google Sheets API: ${error.message}`);
    }
  }

  /**
   * Clear all data in a sheet
   */
  async clearSheet(spreadsheetId, sheetName) {
    if (!this.sheets) await this.initialize();

    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!A:Z`,
      });
    } catch (error) {
      // If sheet doesn't exist, try to create it
      if (error.code === 400) {
        await this.createSheet(spreadsheetId, sheetName);
      } else {
        throw error;
      }
    }
  }

  /**
   * Create a new sheet if it doesn't exist
   */
  async createSheet(spreadsheetId, sheetName) {
    if (!this.sheets) await this.initialize();

    try {
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId,
      });

      const sheetExists = spreadsheet.data.sheets.some(
        sheet => sheet.properties.title === sheetName
      );

      if (!sheetExists) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: spreadsheetId,
          requestBody: {
            requests: [{
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            }],
          },
        });
      }
    } catch (error) {
      throw new Error(`Failed to create sheet: ${error.message}`);
    }
  }

  /**
   * Write data to a sheet
   * @param {string} spreadsheetId - Google Sheets ID
   * @param {string} sheetName - Name of the sheet
   * @param {Array} headers - Array of header names
   * @param {Array} data - Array of data rows (each row is an array of values)
   * @param {boolean} clearFirst - Whether to clear the sheet before writing
   */
  async writeToSheet(spreadsheetId, sheetName, headers, data, clearFirst = true) {
    if (!this.sheets) await this.initialize();

    try {
      // Ensure sheet exists
      await this.createSheet(spreadsheetId, sheetName);

      // Clear sheet if requested
      if (clearFirst) {
        await this.clearSheet(spreadsheetId, sheetName);
      }

      // Prepare data with headers
      const allData = [headers, ...data];

      // Write data to sheet
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: allData,
        },
      });

      return {
        success: true,
        message: `Successfully synced ${data.length} rows to ${sheetName}`,
        rowsWritten: data.length,
      };
    } catch (error) {
      throw new Error(`Failed to write to sheet: ${error.message}`);
    }
  }

  /**
   * Append data to a sheet (without clearing)
   */
  async appendToSheet(spreadsheetId, sheetName, data) {
    if (!this.sheets) await this.initialize();

    try {
      await this.createSheet(spreadsheetId, sheetName);

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: data,
        },
      });

      return {
        success: true,
        message: `Successfully appended ${data.length} rows to ${sheetName}`,
        rowsAppended: data.length,
      };
    } catch (error) {
      throw new Error(`Failed to append to sheet: ${error.message}`);
    }
  }

  /**
   * Update a specific cell or range
   */
  async updateCell(spreadsheetId, sheetName, cell, value) {
    if (!this.sheets) await this.initialize();

    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!${cell}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[value]],
        },
      });
    } catch (error) {
      throw new Error(`Failed to update cell: ${error.message}`);
    }
  }

  /**
   * Format headers (bold, freeze first row)
   */
  async formatHeaders(spreadsheetId, sheetName) {
    if (!this.sheets) await this.initialize();

    try {
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId,
      });

      const sheet = spreadsheet.data.sheets.find(
        s => s.properties.title === sheetName
      );

      if (!sheet) {
        throw new Error(`Sheet ${sheetName} not found`);
      }

      const sheetId = sheet.properties.sheetId;

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheetId,
        requestBody: {
          requests: [
            // Freeze first row
            {
              updateSheetProperties: {
                properties: {
                  sheetId: sheetId,
                  gridProperties: {
                    frozenRowCount: 1,
                  },
                },
                fields: 'gridProperties.frozenRowCount',
              },
            },
            // Format header row (bold)
            {
              repeatCell: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    textFormat: {
                      bold: true,
                    },
                    backgroundColor: {
                      red: 0.9,
                      green: 0.9,
                      blue: 0.9,
                    },
                  },
                },
                fields: 'userEnteredFormat(textFormat,backgroundColor)',
              },
            },
          ],
        },
      });
    } catch (error) {
      // Non-critical error, just log it
      console.warn(`Failed to format headers: ${error.message}`);
    }
  }
}

module.exports = new GoogleSheetsSyncService();

