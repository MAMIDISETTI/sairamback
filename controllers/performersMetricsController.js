const LearningReport = require('../models/LearningReport');
const AttendanceReport = require('../models/AttendanceReport');
const GroomingReport = require('../models/GroomingReport');
const User = require('../models/User');
const UserNew = require('../models/UserNew');

/**
 * Get all candidates with their performance metrics
 */
const getAllCandidatesPerformance = async (req, res) => {
  try {
    // Get all learning reports and filter by active users only
    const learningReports = await LearningReport.find({})
      .populate({
        path: 'user',
        select: 'name email author_id employeeId isActive',
        match: { isActive: true }
      })
      .lean();
    
    // Get all attendance reports and filter by active users only
    const attendanceReports = await AttendanceReport.find({})
      .populate({
        path: 'user',
        select: 'name email author_id employeeId isActive',
        match: { isActive: true }
      })
      .lean();
    
    // Get all grooming reports and filter by active users only
    const groomingReports = await GroomingReport.find({})
      .populate({
        path: 'user',
        select: 'name email author_id employeeId isActive',
        match: { isActive: true }
      })
      .lean();

    // Combine all reports by author_id
    const candidatesMap = new Map();

    // Process learning reports (only for active users)
    learningReports.forEach(report => {
      // Skip if user is null (filtered out by populate match) or inactive
      if (!report.user || report.user.isActive === false) {
        return;
      }
      
      const authorId = report.author_id;
      if (!candidatesMap.has(authorId)) {
        candidatesMap.set(authorId, {
          author_id: authorId,
          name: report.user?.name || 'N/A',
          email: report.user?.email || 'N/A',
          employeeId: report.user?.employeeId || 'N/A',
          learningReport: report.reportData || {},
          attendanceReport: {},
          groomingReport: {},
          examAverages: {},
          courseCompletion: {},
          learningPhase: null
        });
      } else {
        candidatesMap.get(authorId).learningReport = report.reportData || {};
      }
    });

    // Process attendance reports (only for active users)
    attendanceReports.forEach(report => {
      // Skip if user is null (filtered out by populate match) or inactive
      if (!report.user || report.user.isActive === false) {
        return;
      }
      
      const authorId = report.author_id;
      if (!candidatesMap.has(authorId)) {
        candidatesMap.set(authorId, {
          author_id: authorId,
          name: report.user?.name || 'N/A',
          email: report.user?.email || 'N/A',
          employeeId: report.user?.employeeId || 'N/A',
          learningReport: {},
          attendanceReport: report.reportData || {},
          groomingReport: {},
          examAverages: {},
          courseCompletion: {},
          learningPhase: null
        });
      } else {
        candidatesMap.get(authorId).attendanceReport = report.reportData || {};
      }
    });

    // Process grooming reports (only for active users)
    groomingReports.forEach(report => {
      // Skip if user is null (filtered out by populate match) or inactive
      if (!report.user || report.user.isActive === false) {
        return;
      }
      
      const authorId = report.author_id;
      if (!candidatesMap.has(authorId)) {
        candidatesMap.set(authorId, {
          author_id: authorId,
          name: report.user?.name || 'N/A',
          email: report.user?.email || 'N/A',
          employeeId: report.user?.employeeId || 'N/A',
          learningReport: {},
          attendanceReport: {},
          groomingReport: report.reportData || {},
          examAverages: {},
          courseCompletion: {},
          learningPhase: null
        });
      } else {
        candidatesMap.get(authorId).groomingReport = report.reportData || {};
      }
    });

    // Calculate metrics for each candidate
    const candidates = Array.from(candidatesMap.values()).map(candidate => {
      // Calculate exam averages
      const examAverages = calculateExamAverages(candidate.learningReport);
      
      // Extract demo averages
      const demoAverages = calculateDemoAverages(candidate.learningReport);
      
      // Extract course completion data
      const courseCompletion = extractCourseCompletion(candidate.learningReport);
      
      // Determine learning phase
      const learningPhase = determineLearningPhase(courseCompletion);

      return {
        ...candidate,
        examAverages,
        demoAverages,
        courseCompletion,
        learningPhase,
        overallScore: calculateOverallScore(examAverages, candidate.attendanceReport, candidate.groomingReport)
      };
    });

    res.json({
      success: true,
      data: candidates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching candidates performance',
      error: error.message
    });
  }
};

/**
 * Calculate exam averages from learning report
 */
const calculateExamAverages = (learningReport) => {
  const averages = {
    dailyQuiz: 0,
    fortnightExam: 0,
    courseExam: 0,
    overall: 0
  };

  if (!learningReport || typeof learningReport !== 'object') {
    return averages;
  }

  // Extract daily quiz scores
  const dailyQuizScores = learningReport['Daily Quiz scores'] || learningReport['Daily Quiz Scores'] || {};
  const dailyQuizValues = Object.values(dailyQuizScores).filter(v => {
    const num = parseFloat(v);
    return !isNaN(num) && num > 0;
  });
  if (dailyQuizValues.length > 0) {
    averages.dailyQuiz = dailyQuizValues.reduce((a, b) => a + parseFloat(b), 0) / dailyQuizValues.length;
  }

  // Extract fortnight exam scores
  const fortnightScores = learningReport['Fort night exam score Average (In Percentage)'] || 
                          learningReport['Fortnight Exam Score Average'] ||
                          learningReport['Fort night exam score Average'] || {};
  
  let fortnightValues = [];
  if (typeof fortnightScores === 'object') {
    fortnightValues = Object.values(fortnightScores).filter(v => {
      const num = parseFloat(v);
      return !isNaN(num) && num > 0;
    });
  } else {
    const num = parseFloat(fortnightScores);
    if (!isNaN(num) && num > 0) {
      fortnightValues = [num];
    }
  }
  if (fortnightValues.length > 0) {
    averages.fortnightExam = fortnightValues.reduce((a, b) => a + parseFloat(b), 0) / fortnightValues.length;
  }

  // Extract course exam scores
  const courseExamScores = learningReport['Course exam score'] || learningReport['Course Exam Score'] || {};
  const courseExamValues = Object.values(courseExamScores).filter(v => {
    const num = parseFloat(v);
    return !isNaN(num) && num > 0;
  });
  if (courseExamValues.length > 0) {
    averages.courseExam = courseExamValues.reduce((a, b) => a + parseFloat(b), 0) / courseExamValues.length;
  }

  // Calculate overall average
  const validAverages = [averages.dailyQuiz, averages.fortnightExam, averages.courseExam].filter(v => v > 0);
  if (validAverages.length > 0) {
    averages.overall = validAverages.reduce((a, b) => a + b, 0) / validAverages.length;
  }

  return averages;
};

/**
 * Calculate demo averages from learning report
 */
const calculateDemoAverages = (learningReport) => {
  const averages = {
    onlineDemo: 0,
    offlineDemo: 0
  };

  if (!learningReport || typeof learningReport !== 'object') {
    return averages;
  }

  // Extract online demo counts to verify there are actual attempts
  const onlineDemoCounts = learningReport['Online demo counts'] || 
                           learningReport['Online Demo counts'] ||
                           learningReport['Online Demo Counts'] || {};
  
  // Extract online demo ratings
  const onlineDemoRatings = learningReport['Online demo ratings Average'] || 
                           learningReport['Online Demo ratings Average'] ||
                           learningReport['Online Demo Ratings Average'] || {};
  
  // First check if there are any demo attempts (counts > 0)
  let totalOnlineCount = 0;
  if (typeof onlineDemoCounts === 'object') {
    totalOnlineCount = Object.values(onlineDemoCounts).reduce((sum, v) => {
      const num = parseFloat(v);
      return sum + (!isNaN(num) && num > 0 ? num : 0);
    }, 0);
  } else {
    const num = parseFloat(onlineDemoCounts);
    if (!isNaN(num) && num > 0) {
      totalOnlineCount = num;
    }
  }
  
  // Only calculate average if there are actual attempts (count > 0)
  // AND only include ratings from courses that have attempts (count > 0)
  if (totalOnlineCount > 0) {
    let onlineValues = [];
    if (typeof onlineDemoRatings === 'object' && typeof onlineDemoCounts === 'object') {
      // Match ratings with counts by course key - only include ratings where count > 0
      // Handle case-insensitive matching and key variations
      Object.keys(onlineDemoRatings).forEach(courseKey => {
        const rating = onlineDemoRatings[courseKey];
        const ratingNum = parseFloat(rating);
        
        // Try to find matching count (case-insensitive)
        let countNum = 0;
        const courseKeyLower = courseKey.toLowerCase().trim();
        
        // First try exact match
        if (onlineDemoCounts[courseKey] !== undefined) {
          countNum = parseFloat(onlineDemoCounts[courseKey]);
        } else {
          // Try case-insensitive match
          const matchingKey = Object.keys(onlineDemoCounts).find(k => 
            k.toLowerCase().trim() === courseKeyLower
          );
          if (matchingKey) {
            countNum = parseFloat(onlineDemoCounts[matchingKey]);
          }
        }
        
        // Only include rating if it's a valid number > 0 AND the corresponding count > 0
        if (!isNaN(ratingNum) && ratingNum > 0 && !isNaN(countNum) && countNum > 0) {
          onlineValues.push(ratingNum);
        }
      });
    } else if (typeof onlineDemoRatings === 'object') {
      // If counts is not an object, check if total count > 0, then include all valid ratings
      onlineValues = Object.values(onlineDemoRatings).filter(v => {
        const num = parseFloat(v);
        return !isNaN(num) && num > 0;
      });
    } else {
      const num = parseFloat(onlineDemoRatings);
      if (!isNaN(num) && num > 0) {
        onlineValues = [num];
      }
    }
    if (onlineValues.length > 0) {
      averages.onlineDemo = onlineValues.reduce((a, b) => a + parseFloat(b), 0) / onlineValues.length;
    }
  }

  // Extract offline demo counts to verify there are actual attempts
  const offlineDemoCounts = learningReport['Offline demo counts'] || 
                            learningReport['Offline Demo counts'] ||
                            learningReport['Offline Demo Counts'] || {};
  
  // Extract offline demo ratings
  const offlineDemoRatings = learningReport['Offline demo ratings Average'] || 
                            learningReport['Offline Demo ratings Average'] ||
                            learningReport['Offline Demo Ratings Average'] || {};
  
  // First check if there are any demo attempts (counts > 0)
  let totalOfflineCount = 0;
  if (typeof offlineDemoCounts === 'object') {
    totalOfflineCount = Object.values(offlineDemoCounts).reduce((sum, v) => {
      const num = parseFloat(v);
      return sum + (!isNaN(num) && num > 0 ? num : 0);
    }, 0);
  } else {
    const num = parseFloat(offlineDemoCounts);
    if (!isNaN(num) && num > 0) {
      totalOfflineCount = num;
    }
  }
  
  // Only calculate average if there are actual attempts (count > 0)
  // AND only include ratings from courses that have attempts (count > 0)
  if (totalOfflineCount > 0) {
    let offlineValues = [];
    if (typeof offlineDemoRatings === 'object' && typeof offlineDemoCounts === 'object') {
      // Match ratings with counts by course key - only include ratings where count > 0
      // Handle case-insensitive matching and key variations
      Object.keys(offlineDemoRatings).forEach(courseKey => {
        const rating = offlineDemoRatings[courseKey];
        const ratingNum = parseFloat(rating);
        
        // Try to find matching count (case-insensitive)
        let countNum = 0;
        const courseKeyLower = courseKey.toLowerCase().trim();
        
        // First try exact match
        if (offlineDemoCounts[courseKey] !== undefined) {
          countNum = parseFloat(offlineDemoCounts[courseKey]);
        } else {
          // Try case-insensitive match
          const matchingKey = Object.keys(offlineDemoCounts).find(k => 
            k.toLowerCase().trim() === courseKeyLower
          );
          if (matchingKey) {
            countNum = parseFloat(offlineDemoCounts[matchingKey]);
          }
        }
        
        // Only include rating if it's a valid number > 0 AND the corresponding count > 0
        if (!isNaN(ratingNum) && ratingNum > 0 && !isNaN(countNum) && countNum > 0) {
          offlineValues.push(ratingNum);
        }
      });
    } else if (typeof offlineDemoRatings === 'object') {
      // If counts is not an object, check if total count > 0, then include all valid ratings
      offlineValues = Object.values(offlineDemoRatings).filter(v => {
        const num = parseFloat(v);
        return !isNaN(num) && num > 0;
      });
    } else {
      const num = parseFloat(offlineDemoRatings);
      if (!isNaN(num) && num > 0) {
        offlineValues = [num];
      }
    }
    if (offlineValues.length > 0) {
      averages.offlineDemo = offlineValues.reduce((a, b) => a + parseFloat(b), 0) / offlineValues.length;
    }
  }

  return averages;
};

/**
 * Extract course completion data
 */
const extractCourseCompletion = (learningReport) => {
  const completion = {};

  if (!learningReport || typeof learningReport !== 'object') {
    return completion;
  }

  const courseCompletion = learningReport.CourseCompletion || {};
  
  Object.keys(courseCompletion).forEach(course => {
    const courseData = courseCompletion[course];
    if (courseData && typeof courseData === 'object') {
      const weeksExpected = parseFloat(courseData.weeksExpected || courseData['No. of weeks expected complete the course'] || 0);
      const weeksTaken = parseFloat(courseData.weeksTaken || 0);
      const status = (courseData.status || courseData.Status || '').toLowerCase().trim();
      
      if (weeksExpected > 0 && weeksTaken > 0 && (status === 'completed' || status === 'done' || status === 'finished')) {
        completion[course] = {
          weeksExpected,
          weeksTaken,
          status,
          efficiency: weeksExpected / weeksTaken // Higher is better (completed faster)
        };
      }
    }
  });

  return completion;
};

/**
 * Determine learning phase based on course completion
 */
const determineLearningPhase = (courseCompletion) => {
  if (!courseCompletion || Object.keys(courseCompletion).length === 0) {
    return 'unknown';
  }

  const efficiencies = Object.values(courseCompletion)
    .map(c => c.efficiency)
    .filter(e => e > 0);

  if (efficiencies.length === 0) {
    return 'unknown';
  }

  const avgEfficiency = efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length;

  // Fast learner: efficiency > 1.2 (completes 20% faster than expected)
  // Average learner: efficiency between 0.8 and 1.2
  // Slow learner: efficiency < 0.8 (takes longer than expected)
  
  if (avgEfficiency >= 1.2) {
    return 'fast';
  } else if (avgEfficiency >= 0.8) {
    return 'average';
  } else {
    return 'slow';
  }
};

/**
 * Calculate overall performance score
 */
const calculateOverallScore = (examAverages, attendanceReport, groomingReport) => {
  let score = 0;
  let weight = 0;

  // Exam performance (60% weight)
  if (examAverages.overall > 0) {
    score += examAverages.overall * 0.6;
    weight += 0.6;
  }

  // Attendance (30% weight)
  if (attendanceReport && attendanceReport['Montly Percentage']) {
    const percentages = Object.values(attendanceReport['Montly Percentage'] || {})
      .map(v => parseFloat(v))
      .filter(v => !isNaN(v) && v > 0);
    if (percentages.length > 0) {
      const avgAttendance = percentages.reduce((a, b) => a + b, 0) / percentages.length;
      score += avgAttendance * 0.3;
      weight += 0.3;
    }
  }

  // Grooming (10% weight)
  if (groomingReport && groomingReport['How many times missed grooming check list']) {
    const missed = Object.values(groomingReport['How many times missed grooming check list'] || {})
      .map(v => parseFloat(v) || 0)
      .reduce((a, b) => a + b, 0);
    const totalMonths = Object.keys(groomingReport['How many times missed grooming check list'] || {}).length;
    if (totalMonths > 0) {
      const groomingScore = Math.max(0, 100 - (missed / totalMonths) * 10); // Deduct 10 points per miss per month
      score += groomingScore * 0.1;
      weight += 0.1;
    }
  }

  return weight > 0 ? Math.round(score / weight) : 0;
};

/**
 * Get top and low performers
 */
const getPerformersByCategory = async (req, res) => {
  try {
    const { category, limit = 10 } = req.query; // category: 'top' or 'low'

    const candidates = await getAllCandidatesPerformanceData();
    
    // Sort by overall score
    candidates.sort((a, b) => b.overallScore - a.overallScore);

    let result = [];
    if (category === 'top') {
      result = candidates.slice(0, parseInt(limit));
    } else if (category === 'low') {
      result = candidates.slice(-parseInt(limit)).reverse();
    } else {
      result = candidates;
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching performers',
      error: error.message
    });
  }
};

/**
 * Get candidates by exam average threshold
 */
const getCandidatesByExamThreshold = async (req, res) => {
  try {
    const { threshold, examType = 'overall' } = req.query; // examType: 'dailyQuiz', 'fortnightExam', 'courseExam', 'overall'

    if (!threshold) {
      return res.status(400).json({
        success: false,
        message: 'Threshold value is required'
      });
    }

    const thresholdValue = parseFloat(threshold);
    if (isNaN(thresholdValue)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid threshold value'
      });
    }

    const candidates = await getAllCandidatesPerformanceData();
    
    const filtered = candidates.filter(candidate => {
      const examAvg = candidate.examAverages[examType] || 0;
      return examAvg >= thresholdValue;
    });

    // Sort by the selected exam type
    filtered.sort((a, b) => {
      const aScore = a.examAverages[examType] || 0;
      const bScore = b.examAverages[examType] || 0;
      return bScore - aScore;
    });

    res.json({
      success: true,
      data: filtered,
      count: filtered.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching candidates by threshold',
      error: error.message
    });
  }
};

/**
 * Get candidates by learning phase
 */
const getCandidatesByLearningPhase = async (req, res) => {
  try {
    const { phase } = req.query; // phase: 'fast', 'average', 'slow'

    if (!phase || !['fast', 'average', 'slow'].includes(phase)) {
      return res.status(400).json({
        success: false,
        message: 'Valid phase is required (fast, average, or slow)'
      });
    }

    const candidates = await getAllCandidatesPerformanceData();
    
    const filtered = candidates.filter(candidate => candidate.learningPhase === phase);

    // Sort by overall score
    filtered.sort((a, b) => b.overallScore - a.overallScore);

    res.json({
      success: true,
      data: filtered,
      count: filtered.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching candidates by learning phase',
      error: error.message
    });
  }
};

/**
 * Helper function to get all candidates performance data
 */
const getAllCandidatesPerformanceData = async () => {
  // Get all reports and filter by active users only
  const learningReports = await LearningReport.find({})
    .populate({
      path: 'user',
      select: 'name email author_id employeeId isActive',
      match: { isActive: true }
    })
    .lean();
  const attendanceReports = await AttendanceReport.find({})
    .populate({
      path: 'user',
      select: 'name email author_id employeeId isActive',
      match: { isActive: true }
    })
    .lean();
  const groomingReports = await GroomingReport.find({})
    .populate({
      path: 'user',
      select: 'name email author_id employeeId isActive',
      match: { isActive: true }
    })
    .lean();

  const candidatesMap = new Map();

  // Process all reports (only for active users)
  learningReports.forEach(report => {
    // Skip if user is null (filtered out by populate match) or inactive
    if (!report.user || report.user.isActive === false) {
      return;
    }
    
    const authorId = report.author_id;
    if (!candidatesMap.has(authorId)) {
      candidatesMap.set(authorId, {
        author_id: authorId,
        name: report.user?.name || 'N/A',
        email: report.user?.email || 'N/A',
        employeeId: report.user?.employeeId || 'N/A',
        learningReport: report.reportData || {},
        attendanceReport: {},
        groomingReport: {},
        examAverages: {},
        courseCompletion: {},
        learningPhase: null
      });
    } else {
      candidatesMap.get(authorId).learningReport = report.reportData || {};
    }
  });

  attendanceReports.forEach(report => {
    // Skip if user is null (filtered out by populate match) or inactive
    if (!report.user || report.user.isActive === false) {
      return;
    }
    
    const authorId = report.author_id;
    if (candidatesMap.has(authorId)) {
      candidatesMap.get(authorId).attendanceReport = report.reportData || {};
    }
  });

  groomingReports.forEach(report => {
    // Skip if user is null (filtered out by populate match) or inactive
    if (!report.user || report.user.isActive === false) {
      return;
    }
    
    const authorId = report.author_id;
    if (candidatesMap.has(authorId)) {
      candidatesMap.get(authorId).groomingReport = report.reportData || {};
    }
  });

  // Calculate metrics
  return Array.from(candidatesMap.values()).map(candidate => {
    const examAverages = calculateExamAverages(candidate.learningReport);
    const demoAverages = calculateDemoAverages(candidate.learningReport);
    const courseCompletion = extractCourseCompletion(candidate.learningReport);
    const learningPhase = determineLearningPhase(courseCompletion);

    return {
      ...candidate,
      examAverages,
      demoAverages,
      courseCompletion,
      learningPhase,
      overallScore: calculateOverallScore(examAverages, candidate.attendanceReport, candidate.groomingReport)
    };
  });
};

module.exports = {
  getAllCandidatesPerformance,
  getPerformersByCategory,
  getCandidatesByExamThreshold,
  getCandidatesByLearningPhase
};

