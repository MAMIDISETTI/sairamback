const User = require('../models/User');
const MCQDeployment = require('../models/MCQDeployment');

// @desc    Get trainees assigned to the trainer
// @route   GET /api/trainer/assigned-trainees
// @access  Private (Trainer)
const getAssignedTrainees = async (req, res) => {
  try {
    const trainerId = req.user.id;

    // Find the trainer and populate assigned trainees
    const trainer = await User.findById(trainerId)
      .populate('assignedTrainees', 'name email employeeId department author_id')
      .select('name email assignedTrainees');

    if (!trainer) {
      return res.status(404).json({ message: 'Trainer not found' });
    }

    // If no assigned trainees in the trainer's field, check trainees assigned to this trainer
    let assignedTrainees = trainer.assignedTrainees || [];
    
    // Filter out deactivated trainees from assignedTrainees
    if (assignedTrainees.length > 0) {
      const activeAssignedTrainees = [];
      for (const traineeId of assignedTrainees) {
        const trainee = await User.findById(traineeId).select('isActive name email employeeId department author_id');
        if (trainee && trainee.isActive !== false) {
          activeAssignedTrainees.push(trainee);
        }
      }
      assignedTrainees = activeAssignedTrainees;
      
      // Update the trainer's assignedTrainees field to remove deactivated trainees
      const activeTraineeIds = activeAssignedTrainees.map(t => t._id);
      if (activeTraineeIds.length !== trainer.assignedTrainees.length) {
        await User.findByIdAndUpdate(trainerId, { 
          $set: { assignedTrainees: activeTraineeIds } 
        });
      }
    }
    
    if (assignedTrainees.length === 0) {
      // Find trainees assigned to this trainer
      const traineesAssignedToThisTrainer = await User.find({ 
        role: 'trainee', 
        assignedTrainer: trainerId,
        isActive: true
      }).select('name email employeeId department author_id');
      
      if (traineesAssignedToThisTrainer.length > 0) {
        // Update the trainer's assignedTrainees field
        const traineeIds = traineesAssignedToThisTrainer.map(t => t._id);
        await User.findByIdAndUpdate(trainerId, { 
          $set: { assignedTrainees: traineeIds } 
        });
        assignedTrainees = traineesAssignedToThisTrainer;
      }
    }

    res.json({
      success: true,
      trainees: assignedTrainees,
      totalTrainees: assignedTrainees.length
    });

  } catch (error) {
    console.error('Error fetching assigned trainees:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
};

// @desc    Get results of trainees assigned to the trainer
// @route   GET /api/trainer/trainee-results
// @access  Private (Trainer)
const getTraineeResults = async (req, res) => {
  try {
    const trainerId = req.user.id;

    // First get the trainer's assigned trainees
    const trainer = await User.findById(trainerId)
      .populate('assignedTrainees', 'name email employeeId department author_id')
      .select('assignedTrainees');

    if (!trainer) {
      return res.status(404).json({ message: 'Trainer not found' });
    }

    let assignedTrainees = trainer.assignedTrainees || [];
    
    // If no assigned trainees in the trainer's field, check trainees assigned to this trainer
    if (assignedTrainees.length === 0) {
      const traineesAssignedToThisTrainer = await User.find({ 
        role: 'trainee', 
        assignedTrainer: trainerId,
        isActive: true
      }).select('name email employeeId department author_id');
      
      if (traineesAssignedToThisTrainer.length > 0) {
        const traineeIds = traineesAssignedToThisTrainer.map(t => t._id);
        await User.findByIdAndUpdate(trainerId, { 
          $set: { assignedTrainees: traineeIds } 
        });
        assignedTrainees = traineesAssignedToThisTrainer;
      }
    }

    if (assignedTrainees.length === 0) {
      return res.json({
        success: true,
        results: [],
        message: 'No trainees assigned to this trainer'
      });
    }

    // Get trainee author_ids (used in MCQ deployments)
    const traineeAuthorIds = assignedTrainees.map(trainee => trainee.author_id).filter(Boolean);

    if (traineeAuthorIds.length === 0) {
      return res.json({
        success: true,
        results: [],
        message: 'No trainees with author_id found'
      });
    }

    // Fetch MCQ deployments that have results for these trainees
    const deployments = await MCQDeployment.find({
      'results.traineeId': { $in: traineeAuthorIds }
    }).select('name apiUrl scheduledDateTime duration results questions');

    // Extract and format results
    const allResults = [];
    
    deployments.forEach(deployment => {
      deployment.results.forEach(result => {
        if (traineeAuthorIds.includes(result.traineeId)) {
          // Find the trainee details
          const trainee = assignedTrainees.find(t => t.author_id === result.traineeId);
          
          if (trainee) {
            // Format questions with full details
            const formattedQuestions = (result.answers || []).map(answer => {
              const question = deployment.questions[answer.questionIndex];
              return {
                questionIndex: answer.questionIndex,
                question: question ? question.question : `Question ${answer.questionIndex + 1}`,
                selectedAnswer: answer.selectedAnswer,
                correctAnswer: question ? question.correctAnswer : 'N/A',
                isCorrect: answer.isCorrect,
                timeSpent: answer.timeSpent || 0,
                options: question ? question.options : [],
                questionId: question ? question.id : `q${answer.questionIndex + 1}`
              };
            });

            allResults.push({
              _id: `${deployment._id}_${result.traineeId}`,
              traineeId: trainee._id,
              traineeName: trainee.name,
              traineeEmail: trainee.email,
              assignmentName: deployment.name,
              assignmentUrl: deployment.apiUrl,
              score: result.totalScore,
              totalQuestions: result.maxScore,
              status: result.status,
              completedAt: result.completedAt,
              duration: result.timeSpent ? Math.round(result.timeSpent / 60) : 0, // Convert seconds to minutes
              questions: formattedQuestions
            });
          }
        }
      });
    });

    // Sort by completion date (newest first)
    allResults.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    res.json({
      success: true,
      results: allResults,
      totalResults: allResults.length
    });

  } catch (error) {
    console.error('Error fetching trainee results:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
};

module.exports = {
  getAssignedTrainees,
  getTraineeResults
};
