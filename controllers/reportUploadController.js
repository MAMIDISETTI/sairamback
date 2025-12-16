const FortnightReport = require('../models/FortnightReport');
const WorkshopReport = require('../models/WorkshopReport');
const AttendanceReportCSV = require('../models/AttendanceReportCSV');
const DemosReport = require('../models/DemosReport');

// Helper function to parse CSV from buffer - handles quoted fields and commas within quotes
const parseCSV = (buffer) => {
  const text = buffer.toString('utf-8');
  const lines = text.split('\n').filter(line => line.trim() !== '');
  
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Function to parse CSV line properly handling quoted fields
  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add last field
    result.push(current.trim());
    return result;
  };

  // Parse headers
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
  
  if (headers.length === 0) {
    throw new Error('CSV file has no headers');
  }
  
  // Parse data rows
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, ''));
    if (values.length > 0 && values.some(v => v !== '')) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      data.push(row);
    }
  }

  return { headers, data };
};

// @desc    Upload Fortnight Report CSV
// @route   POST /api/reports/upload/fortnight
// @access  Private (BOA)
const uploadFortnightReport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is required'
      });
    }

    const { headers, data } = await parseCSV(req.file.buffer);

    if (data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'CSV file contains no data rows'
      });
    }

    // Save to database
    const report = await FortnightReport.create({
      csvData: {
        headers,
        rows: data
      },
      uploadedBy: req.user.id,
      fileName: req.file.originalname,
      rowCount: data.length
    });

    res.status(201).json({
      success: true,
      message: `Successfully uploaded ${data.length} rows from CSV`,
      data: {
        reportId: report._id,
        rowCount: data.length,
        fileName: req.file.originalname
      }
    });
  } catch (error) {
    console.error('Error uploading fortnight report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload fortnight report',
      error: error.message
    });
  }
};

// @desc    Upload Workshop Report CSV
// @route   POST /api/reports/upload/workshop
// @access  Private (BOA)
const uploadWorkshopReport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is required'
      });
    }

    const { headers, data } = await parseCSV(req.file.buffer);

    if (data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'CSV file contains no data rows'
      });
    }

    // Save to database
    const report = await WorkshopReport.create({
      csvData: {
        headers,
        rows: data
      },
      uploadedBy: req.user.id,
      fileName: req.file.originalname,
      rowCount: data.length
    });

    res.status(201).json({
      success: true,
      message: `Successfully uploaded ${data.length} rows from CSV`,
      data: {
        reportId: report._id,
        rowCount: data.length,
        fileName: req.file.originalname
      }
    });
  } catch (error) {
    console.error('Error uploading workshop report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload workshop report',
      error: error.message
    });
  }
};

// @desc    Upload Attendance Report CSV
// @route   POST /api/reports/upload/attendance
// @access  Private (BOA)
const uploadAttendanceReport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is required'
      });
    }

    const { headers, data } = await parseCSV(req.file.buffer);

    if (data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'CSV file contains no data rows'
      });
    }

    // Save to database
    const report = await AttendanceReportCSV.create({
      csvData: {
        headers,
        rows: data
      },
      uploadedBy: req.user.id,
      fileName: req.file.originalname,
      rowCount: data.length
    });

    res.status(201).json({
      success: true,
      message: `Successfully uploaded ${data.length} rows from CSV`,
      data: {
        reportId: report._id,
        rowCount: data.length,
        fileName: req.file.originalname
      }
    });
  } catch (error) {
    console.error('Error uploading attendance report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload attendance report',
      error: error.message
    });
  }
};

// @desc    Upload Demos Report CSV
// @route   POST /api/reports/upload/demos
// @access  Private (BOA)
const uploadDemosReport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is required'
      });
    }

    const { headers, data } = await parseCSV(req.file.buffer);

    if (data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'CSV file contains no data rows'
      });
    }

    // Save to database
    const report = await DemosReport.create({
      csvData: {
        headers,
        rows: data
      },
      uploadedBy: req.user.id,
      fileName: req.file.originalname,
      rowCount: data.length
    });

    res.status(201).json({
      success: true,
      message: `Successfully uploaded ${data.length} rows from CSV`,
      data: {
        reportId: report._id,
        rowCount: data.length,
        fileName: req.file.originalname
      }
    });
  } catch (error) {
    console.error('Error uploading demos report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload demos report',
      error: error.message
    });
  }
};

module.exports = {
  uploadFortnightReport,
  uploadWorkshopReport,
  uploadAttendanceReport,
  uploadDemosReport
};

