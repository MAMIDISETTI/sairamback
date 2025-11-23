const Task = require("../models/Task");
const User = require("../models/User");
const UserNew = require("../models/UserNew");
const bcrypt = require("bcryptjs");

// @desc    Get all users (Admin only)
// @route   GET /api/users/
// @access  Private (Admin)
const getUsers = async (req, res) => {
  try {
    const { role, unassigned, email } = req.query;
    
    // Build query object - default to active users only
    let query = { isActive: true };
    if (role) {
      query.role = role;
    }
    // If no role specified, return all active users (for BOA dashboard)
    
    // Add email filter if provided
    if (email) {
      query.email = email;
    }
    
    // Add unassigned filter for trainees
    if (unassigned === 'true' && role === 'trainee') {
      query.$or = [
        { assignedTrainer: { $exists: false } },
        { assignedTrainer: null }
      ];
      }

    // Search in both User and UserNew models
    let users = [];
    try {
      // Search in UserNew model first (newer users)
      let userNewResults = [];
      userNewResults = await UserNew.find(query)
        .populate('assignedTrainer', 'name email author_id')
        .select("-password");
      
      // Search in User model (older users)
      let userResults = [];
      userResults = await User.find(query)
        .populate('assignedTrainer', 'name email author_id')
        .select("-password");
      
      // Combine results
      users = [...userNewResults, ...userResults];
      
      // Debug: Check what we found
      if (users.length > 0) {
        users.slice(0, 3).forEach((user, index) => {
          });
      }
    } catch (queryError) {
      console.error('Database query error:', queryError);
      throw queryError;
    }

    // Log trainees with assigned trainers (only when not looking for unassigned)
    if (!(unassigned === 'true' && role === 'trainee')) {
      const traineesWithTrainers = users.filter(user => user.role === 'trainee' && user.assignedTrainer);
      traineesWithTrainers.forEach(trainee => {
        });
      
      // Debug: Check what assignedTrainer looks like
      users.slice(0, 3).forEach((user, index) => {
        if (user.role === 'trainee') {
          }
      });
    }

    // Convert to plain objects for consistency
    const usersWithPopulatedTrainers = users.map(user => user.toObject());

    // Deduplicate across User and UserNew (prefer UserNew when duplicate by email/author_id)
    const uniqueUsersMap = new Map();
    for (const u of usersWithPopulatedTrainers) {
      const key = (u.email || u.author_id || u._id?.toString() || '').toLowerCase();
      // Prefer newer model document if both exist (UserNew has author_id by schema)
      if (!uniqueUsersMap.has(key)) {
        uniqueUsersMap.set(key, u);
      } else {
        const existing = uniqueUsersMap.get(key);
        const preferNew = (u.author_id && !existing.author_id);
        uniqueUsersMap.set(key, preferNew ? u : existing);
      }
    }
    let uniqueUsers = Array.from(uniqueUsersMap.values());

    // Ensure assignedTrainer is fully populated even when stored from either model
    uniqueUsers = await Promise.all(uniqueUsers.map(async (u) => {
      if (u.role === 'trainee' && u.assignedTrainer) {
        const isPopulatedObject = typeof u.assignedTrainer === 'object' && u.assignedTrainer._id;
        if (!isPopulatedObject) {
          const trainerId = u.assignedTrainer.toString();
          // Try in User, then UserNew
          let trainerDoc = await User.findById(trainerId).select('name email author_id isActive');
          if (!trainerDoc) {
            trainerDoc = await UserNew.findById(trainerId).select('name email author_id isActive');
          }
          if (trainerDoc) {
            u.assignedTrainer = trainerDoc.toObject();
          }
        }
        
        // Check if the assigned trainer is still active
        if (u.assignedTrainer && u.assignedTrainer._id) {
          const trainerId = u.assignedTrainer._id;
          const activeTrainer = await User.findOne({ _id: trainerId, isActive: true });
          
          if (!activeTrainer) {
            // Trainer is deactivated, clear the assignment and update status
            u.assignedTrainer = null;
            u.status = 'pending_assignment';
            
            // Update in database
            await User.findByIdAndUpdate(u._id, { 
              assignedTrainer: null, 
              status: 'pending_assignment' 
            });
          }
        }
      }
      return u;
    }));

    // Add task counts to each user (only for members)
    let usersWithTaskCounts;
    if (role === 'member') {
      usersWithTaskCounts = await Promise.all(
        usersWithPopulatedTrainers.map(async (user) => {
          const pendingTasks = await Task.countDocuments({
            assignedTo: user._id,
            status: "Pending",
          });
          const inProgressTasks = await Task.countDocuments({
            assignedTo: user._id,
            status: "In Progress",
          });
          const completedTasks = await Task.countDocuments({
            assignedTo: user._id,
            status: "Completed",
          });

          return {
            ...user._doc, // Include all existing user data
            pendingTasks,
            inProgressTasks,
            completedTasks,
          };
        })
      );
    } else {
      // For trainers, trainees, and BOA dashboard, return users as-is
      usersWithTaskCounts = uniqueUsers;
    }

    res.json({ users: usersWithTaskCounts });
  } catch (error) {
    console.error('=== GET USERS ERROR ===');
    console.error('Error details:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private
const getUserById = async (req, res) => {
  try {
    // Try User model first
    let user = await User.findById(req.params.id).select("-password");
    
    // If not found, try UserNew model
    if (!user) {
      user = await UserNew.findById(req.params.id).select("-password");
    }
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Ensure author_id is included (use _id as fallback if author_id doesn't exist)
    const userObj = user.toObject ? user.toObject() : user;
    if (!userObj.author_id && userObj._id) {
      userObj.author_id = userObj._id.toString();
    }
    
    res.json(userObj);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Create a new user
// @route   POST /api/users
// @access  Private (Admin/BOA)
const createUser = async (req, res) => {
  try {
    const { 
      name, email, password, role, phone, department, employeeId, genre, joiningDate, qualification,
      // Fields from joiners table
      date_of_joining, candidate_name, phone_number, candidate_personal_mail_id,
      top_department_name_as_per_darwinbox, department_name_as_per_darwinbox,
      joining_status, role_type, role_assign, status, accountCreated, accountCreatedAt,
      createdBy, onboardingChecklist, company_allocated_details, dayPlanTasks,
      fortnightExams, dailyQuizzes, courseLevelExams,
      // Password management
      tempPassword, passwordChanged,
      // author_id from joiner
      author_id
    } = req.body;

    // // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user with all fields
    const userData = {
      name,
      email,
      password: hashedPassword,
      role: role || 'trainee',
      phone: phone || null,
      department: department || null,
      genre: genre || null,
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
      isActive: true,
      lastClockIn: null,
      lastClockOut: null,
      
      // Fields from joiners table
      date_of_joining: date_of_joining ? new Date(date_of_joining) : null,
      candidate_name: candidate_name || null,
      phone_number: phone_number || null,
      candidate_personal_mail_id: candidate_personal_mail_id || null,
      top_department_name_as_per_darwinbox: top_department_name_as_per_darwinbox || null,
      department_name_as_per_darwinbox: department_name_as_per_darwinbox || null,
      joining_status: joining_status || null,
      role_type: role_type || null,
      role_assign: role_assign || null,
      qualification: qualification || null,
      status: status || 'active',
      accountCreated: accountCreated !== undefined ? accountCreated : false,
      accountCreatedAt: accountCreatedAt ? new Date(accountCreatedAt) : new Date(),
      createdBy: createdBy || null,
      
      // Password management
      tempPassword: tempPassword || null,
      passwordChanged: passwordChanged || false,
      
      // Array fields
      onboardingChecklist: onboardingChecklist || [{
        welcomeEmailSent: false,
        credentialsGenerated: false,
        accountActivated: false,
        trainingAssigned: false,
        documentsSubmitted: false
      }],
      company_allocated_details: company_allocated_details || [],
      dayPlanTasks: dayPlanTasks || [],
      fortnightExams: fortnightExams || [],
      dailyQuizzes: dailyQuizzes || [],
      courseLevelExams: courseLevelExams || []
    };

    // Only add employeeId if it's not null or undefined
    if (employeeId && employeeId !== null && employeeId !== 'null') {
      userData.employeeId = employeeId;
    }

    // Use author_id from joiner if provided, otherwise User model will generate one
    if (author_id && author_id.trim() !== '') {
      userData.author_id = author_id.trim();
    }

    const user = await User.create(userData);
    // Return user data without password
    res.status(201).json({
      message: "User created successfully",
      user: {
        _id: user._id,
        author_id: user.author_id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        department: user.department,
        employeeId: user.employeeId,
        genre: user.genre,
        joiningDate: user.joiningDate,
        isActive: user.isActive,
        createdAt: user.createdAt,
        
        // Fields from joiners table
        date_of_joining: user.date_of_joining,
        candidate_name: user.candidate_name,
        phone_number: user.phone_number,
        candidate_personal_mail_id: user.candidate_personal_mail_id,
        top_department_name_as_per_darwinbox: user.top_department_name_as_per_darwinbox,
        department_name_as_per_darwinbox: user.department_name_as_per_darwinbox,
        joining_status: user.joining_status,
        role_type: user.role_type,
        role_assign: user.role_assign,
        qualification: user.qualification,
        status: user.status,
        accountCreated: user.accountCreated,
        accountCreatedAt: user.accountCreatedAt,
        createdBy: user.createdBy,
        
        // Array fields
        onboardingChecklist: user.onboardingChecklist,
        company_allocated_details: user.company_allocated_details,
        dayPlanTasks: user.dayPlanTasks,
        fortnightExams: user.fortnightExams,
        dailyQuizzes: user.dailyQuizzes,
        courseLevelExams: user.courseLevelExams
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    
    // Log the specific validation errors if it's a Mongoose validation error
    if (error.name === 'ValidationError') {
      console.error('Validation errors:', error.errors);
    }
    
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Update user by author_id
// @route   PUT /api/users/by-author/:authorId
// @access  Private (Admin)
const updateUserByAuthorId = async (req, res) => {
  try {
    const { authorId } = req.params;
    const updateData = req.body;

    if (!authorId) {
      return res.status(400).json({ message: 'Author ID is required' });
    }

    // Find user in UserNew first, then User
    let user = await UserNew.findOne({ author_id: authorId });
    let userModel = 'UserNew';
    
    if (!user) {
      user = await User.findOne({ author_id: authorId });
      userModel = 'User';
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prepare update data (only include allowed fields)
    const allowedFields = [
      'name', 'email', 'phone', 'department', 'state', 
      'qualification', 'specialization', 'yearOfPassing', 'yearOfPassout',
      'joiningDate', 'dateOfJoining', 'isActive'
    ];
    
    const filteredUpdateData = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        filteredUpdateData[field] = updateData[field];
      }
    });

    // Handle date fields
    if (filteredUpdateData.joiningDate) {
      filteredUpdateData.joiningDate = new Date(filteredUpdateData.joiningDate);
    }
    if (filteredUpdateData.dateOfJoining) {
      filteredUpdateData.dateOfJoining = new Date(filteredUpdateData.dateOfJoining);
    }

    // Update user
    let updatedUser;
    if (userModel === 'UserNew') {
      updatedUser = await UserNew.findByIdAndUpdate(
        user._id,
        filteredUpdateData,
        { new: true, runValidators: false }
      ).select('-password');
    } else {
      updatedUser = await User.findByIdAndUpdate(
        user._id,
        filteredUpdateData,
        { new: true, runValidators: false }
      ).select('-password');
    }

    if (!updatedUser) {
      return res.status(500).json({ message: 'Failed to update user' });
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
};

module.exports = { getUsers, getUserById, createUser, updateUserByAuthorId };
