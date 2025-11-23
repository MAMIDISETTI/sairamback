const UserNew = require('../models/UserNew');
const Joiner = require('../models/Joiner');
const DeactivatedUser = require('../models/DeactivatedUser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Create admin account with invite token
const createAdmin = async (req, res) => {
  try {
    const { inviteToken, name, email, password } = req.body;

    // Verify admin invite token
    if (inviteToken !== process.env.ADMIN_INVITE_TOKEN) {
      return res.status(400).json({
        message: 'Invalid admin invite token'
      });
    }

    // Check if admin already exists
    const existingAdmin = await UserNew.findOne({ 
      $or: [{ email }, { role: 'admin' }] 
    });
    
    if (existingAdmin) {
      return res.status(400).json({
        message: 'Admin account already exists or email already in use'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create admin user
    const admin = await UserNew.create({
      name,
      email,
      password: hashedPassword,
      role: 'admin',
      accountStatus: 'active',
      isActive: true,
      accountCreated: true,
      accountCreatedAt: new Date(),
      passwordChanged: true
    });

    // Generate JWT token
    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Admin account created successfully',
      token,
      user: {
        id: admin._id,
        author_id: admin.author_id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        accountStatus: admin.accountStatus
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Promote user to different role
const promoteUser = async (req, res) => {
  try {
    // console.log('=== PROMOTE USER REQUEST ===');
    // console.log('Request body:', req.body);
    // console.log('Request user:', req.user);
    // console.log('Request headers:', req.headers);
    
    const { userId, newRole, reason } = req.body;
    const { id: adminId } = req.user;
    
    //console.log('Extracted data:', { userId, newRole, reason, adminId });

    // Find user to promote - check both UserNew and User models
   // console.log('Looking for user with ID:', userId);
    let user = await UserNew.findById(userId);
   // console.log('Found in UserNew:', user ? { id: user._id, name: user.name, role: user.role } : 'Not found');
    
    // If not found in UserNew, try the old User model
    if (!user) {
      const User = require('../models/User');
      user = await User.findById(userId);
     // console.log('Found in User:', user ? { id: user._id, name: user.name, role: user.role } : 'Not found');
    }
    
    if (!user) {
     // console.log('User not found in either model, returning 404');
      return res.status(404).json({
        message: 'User not found'
      });
    }

    // Validate new role
    const validRoles = ['trainee', 'trainer', 'master_trainer', 'boa', 'admin'];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({
        message: 'Invalid role. Valid roles: trainee, trainer, master_trainer, boa, admin'
      });
    }

    // Allow any role transition (admin can change any user to any role)
    // Only restriction: admin cannot be demoted to prevent lockout
    if (user.role === 'admin' && newRole !== 'admin') {
      return res.status(400).json({
        message: 'Admin role cannot be changed to prevent system lockout'
      });
    }

    // Check if user is already in the target role
    if (user.role === newRole) {
      return res.status(400).json({
        message: 'User is already in the specified role'
      });
    }

    // Store original role before updating
    const originalRole = user.role;
    
    // Handle trainee unassignment if promoting from trainer to master_trainer
    if (originalRole === 'trainer' && newRole === 'master_trainer') {
      console.log('Promoting trainer to master trainer - unassigning trainees');
      
      try {
        const Assignment = require('../models/Assignment');
        const User = require('../models/User');
        
        // Find all active assignments for this trainer
        const activeAssignments = await Assignment.find({
          trainer: user.author_id,
          status: 'active'
        });
        
  //      console.log(`Found ${activeAssignments.length} active assignments for trainer`);
        
        // Get all trainee IDs from active assignments
        const allTraineeIds = [];
        activeAssignments.forEach(assignment => {
          allTraineeIds.push(...assignment.trainees);
        });
        
        if (allTraineeIds.length > 0) {
         // console.log(`Unassigning ${allTraineeIds.length} trainees`);
          
          // Find trainee ObjectIds by their author_ids
          const traineeObjects = await User.find({ author_id: { $in: allTraineeIds } }).select('_id');
          const traineeObjectIds = traineeObjects.map(t => t._id);
          
          // Update trainees in both User and UserNew models using ObjectIds
          await User.updateMany(
            { _id: { $in: traineeObjectIds } },
            { 
              assignedTrainer: null,
              status: 'pending_assignment'
            }
          );
          
          await UserNew.updateMany(
            { _id: { $in: traineeObjectIds } },
            { 
              assignedTrainer: null,
              status: 'pending_assignment'
            }
          );
          
          // Also directly find and unassign trainees by assignedTrainer field (like deactivation does)
          const directlyAssignedTrainees = await User.find({ 
            assignedTrainer: user._id,
            role: 'trainee' 
          });
          
          if (directlyAssignedTrainees.length > 0) {
            console.log(`Also unassigning ${directlyAssignedTrainees.length} directly assigned trainees`);
            await User.updateMany(
              { assignedTrainer: user._id, role: 'trainee' },
              { 
                assignedTrainer: null, 
                status: 'pending_assignment' 
              }
            );
          }
          
          // Deactivate all assignments for this trainer
          await Assignment.updateMany(
            { trainer: user.author_id, status: 'active' },
            { 
              status: 'cancelled',
              endDate: new Date(),
              modifiedBy: adminId,
              modifiedAt: new Date()
            }
          );
          
          console.log('Successfully unassigned all trainees and deactivated assignments');
        }
      } catch (assignmentError) {
        console.error('Error handling trainee unassignment:', assignmentError);
        // Continue with role update even if assignment handling fails
      }
    }
    
    // Update user role
    console.log('Updating user role from', user.role, 'to', newRole);
    user.role = newRole;
    await user.save();
    console.log('User role updated successfully');
    
    // Clear assignedTrainees if promoting from trainer to any other role
    if (originalRole === 'trainer' && newRole !== 'trainer') {
      console.log('Clearing assignedTrainees for promoted trainer');
      user.assignedTrainees = [];
      await user.save();
    }
    
    // If user was from old User model, also update in UserNew model for consistency
    if (user.constructor.modelName === 'User') {
      console.log('User was from old User model, updating UserNew model for consistency');
      try {
        const existingUserNew = await UserNew.findOne({ email: user.email });
        if (existingUserNew) {
          existingUserNew.role = newRole;
          if (newRole !== 'trainer') {
            existingUserNew.assignedTrainees = [];
          }
          await existingUserNew.save();
          console.log('UserNew model also updated for consistency');
        } else {
          console.log('No corresponding UserNew record found, skipping consistency update');
        }
      } catch (consistencyError) {
        console.log('Warning: Could not update UserNew model for consistency:', consistencyError.message);
      }
    }

    res.json({
      message: `User successfully promoted to ${newRole}`,
      user: {
        id: user._id,
        author_id: user.author_id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error promoting user:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Deactivate user account (remove access)
const deactivateUser = async (req, res) => {
  try {
    
    const { userId, reason } = req.body;
    const { id: adminId } = req.user;
    
    // console.log('Extracted data:', { userId, reason, adminId });

    // // Find user to deactivate - check both UserNew and User models
    // console.log('Looking for user with ID:', userId);
    
    // First check if user exists in UserNew model (without validation)
    let userExists = await UserNew.findById(userId).select('_id name role isActive').lean();
    let userModel = 'UserNew';
    
    if (!userExists) {
      // If not found in UserNew, try User model
      const User = require('../models/User');
      userExists = await User.findById(userId).select('_id name role isActive').lean();
      userModel = 'User';
    }
    
    if (!userExists) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    // Check if user is already deactivated
    if (!userExists.isActive) {
      return res.status(400).json({
        message: 'User account is already deactivated'
      });
    }

    // Prepare update data
    const updateData = {
      isActive: false,
      accountStatus: 'deactivated',
      deactivatedAt: new Date(),
      deactivatedBy: adminId,
      deactivationReason: reason || 'Account deactivated by admin',
      profileImageUrl: null,
      joinerId: null,
      roleHistory: [],
      invitedBy: null,
      inviteToken: null,
      inviteExpiresAt: null,
      createdBy: null, // Clear createdBy to avoid validation error
      company_allocated_details: null
    };

    // Use findByIdAndUpdate to bypass validation
    let updateResult;
    if (userModel === 'UserNew') {
      updateResult = await UserNew.findByIdAndUpdate(userId, updateData, { 
        runValidators: false,
        new: true 
      });
    } else {
      const User = require('../models/User');
      updateResult = await User.findByIdAndUpdate(userId, updateData, { 
        runValidators: false,
        new: true 
      });
    }
    
    if (!updateResult) {
      return res.status(500).json({
        message: 'Failed to deactivate user'
      });
    }

    // Also update the other model to keep them in sync
    const User = require('../models/User');
    if (userModel === 'UserNew') {
      // User was found in UserNew, also update User model
      const crossUpdateResult = await User.findOneAndUpdate(
        { email: updateResult.email },
        { 
          isActive: false,
          accountStatus: 'deactivated',
          deactivatedAt: updateResult.deactivatedAt,
          deactivatedBy: updateResult.deactivatedBy,
          deactivationReason: updateResult.deactivationReason
        },
        { runValidators: false }
      );
      console.log('Updated User model for:', updateResult.email, 'Result:', crossUpdateResult ? 'Success' : 'Not found');
    } else {
      // User was found in User, also update UserNew model
      const crossUpdateResult = await UserNew.findOneAndUpdate(
        { email: updateResult.email },
        { 
          isActive: false,
          accountStatus: 'deactivated',
          deactivatedAt: updateResult.deactivatedAt,
          deactivatedBy: updateResult.deactivatedBy,
          deactivationReason: updateResult.deactivationReason
        },
        { runValidators: false }
      );
      console.log('Updated UserNew model for:', updateResult.email, 'Result:', crossUpdateResult ? 'Success' : 'Not found');
    }

    // If deactivating a trainer, unassign all their trainees
    if (userExists.role === 'trainer') {
      // Find all trainees assigned to this trainer
      const assignedTrainees = await User.find({ 
        assignedTrainer: userId,
        role: 'trainee' 
      });
      
      if (assignedTrainees.length > 0) {
        // Unassign all trainees from this trainer
        await User.updateMany(
          { assignedTrainer: userId, role: 'trainee' },
          { 
            assignedTrainer: null, 
            status: 'pending_assignment' 
          }
        );
        
      }
      
      // Clear the trainer's assignedTrainees array
      await User.findByIdAndUpdate(userId, { 
        assignedTrainees: [] 
      });
    }

    // Create deactivated user record
    try {
       // Get admin user info
      const adminUser = await UserNew.findById(adminId).select('name email');
      const adminName = adminUser ? adminUser.name : 'Unknown Admin';
      const adminEmail = adminUser ? adminUser.email : 'unknown@admin.com';
      
      // Get assignment information
      let assignedTrainerInfo = null;
      let assignedTraineesInfo = [];
      
      if (userExists.role === 'trainee' && updateResult.assignedTrainer) {
        const trainer = await User.findById(updateResult.assignedTrainer).select('name email');
        if (trainer) {
          assignedTrainerInfo = {
            id: trainer._id,
            name: trainer.name,
            email: trainer.email
          };
        }
      }
      
      if (userExists.role === 'trainer' && updateResult.assignedTrainees) {
        const trainees = await User.find({ 
          _id: { $in: updateResult.assignedTrainees } 
        }).select('name email');
        assignedTraineesInfo = trainees.map(t => ({
          id: t._id,
          name: t.name,
          email: t.email
        }));
      }
      
      // Create deactivated user record
      const deactivatedUserRecord = await DeactivatedUser.create({
        originalUserId: userModel === 'User' ? updateResult._id : null,
        originalUserNewId: userModel === 'UserNew' ? updateResult._id : null,
        
        userInfo: {
          author_id: updateResult.author_id || updateResult._id.toString(),
          name: updateResult.name,
          email: updateResult.email,
          role: updateResult.role,
          department: updateResult.department || null,
          phone: updateResult.phone || null,
          joiningDate: updateResult.joiningDate || null,
          employeeId: updateResult.employeeId || null
        },
        
        deactivationDetails: {
          deactivatedAt: updateResult.deactivatedAt,
          deactivatedBy: adminId,
          deactivatedByName: adminName,
          deactivatedByEmail: adminEmail,
          reason: reason || updateResult.deactivationReason || 'Account deactivated by admin',
          remarks: reason || updateResult.deactivationReason || 'Account deactivated by admin',
          category: 'other', // Default category, can be enhanced later
          severity: 'low' // Default severity, can be enhanced later
        },
        
        assignmentInfo: {
          assignedTrainer: assignedTrainerInfo ? assignedTrainerInfo.id : null,
          assignedTrainerName: assignedTrainerInfo ? assignedTrainerInfo.name : null,
          assignedTrainees: assignedTraineesInfo.map(t => t.id),
          assignedTraineeNames: assignedTraineesInfo.map(t => t.name),
          status: 'inactive'
        },
        
        systemInfo: {
          lastLoginAt: updateResult.lastLoginAt || null,
          accountCreatedAt: updateResult.accountCreatedAt || null,
          totalLoginDays: updateResult.totalLoginDays || 0,
          lastActivityAt: updateResult.lastActivityAt || null
        },
        
        status: 'deactivated'
      });
      
      // console.log(' Deactivated user record created:', deactivatedUserRecord._id);
      // console.log('=== END CREATING DEACTIVATED USER RECORD ===');
      
    } catch (deactivatedUserError) {
      console.error('Error creating deactivated user record:', deactivatedUserError);
      // Don't fail the deactivation if record creation fails
    }

    // Update corresponding joiner record status
    const Joiner = require('../models/Joiner');
    try {
       // Try to find joiner by email first
      let existingJoiner = await Joiner.findOne({ email: updateResult.email });
        
      // If not found by email, try by name
      if (!existingJoiner) {
        existingJoiner = await Joiner.findOne({ 
          $or: [
            { name: updateResult.name },
            { candidate_name: updateResult.name }
          ]
        });
      }

      if (existingJoiner) {
        const joinerUpdateResult = await Joiner.findOneAndUpdate(
          { _id: existingJoiner._id },
          { 
            status: 'inactive',
            accountCreated: false
          },
          { runValidators: false, new: true }
        );
        
      } 
    } catch (joinerError) {
      console.error('Error updating joiner status:', joinerError);
      // Don't fail the deactivation if joiner update fails
    }

    // TODO: Add cleanup for related data (tasks, observations, etc.)
    // This would require additional cleanup functions for:
    // - Tasks assigned to this user
    // - Observations made by this user
    // - Day plans created by this user
    // - Any other content they created

    res.json({
      message: 'User account deactivated and all access removed successfully',
      user: {
        id: updateResult._id,
        author_id: updateResult.author_id,
        name: updateResult.name,
        email: updateResult.email,
        role: updateResult.role,
        isActive: updateResult.isActive,
        deactivatedAt: updateResult.deactivatedAt,
        deactivationReason: updateResult.deactivationReason
      }
    });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Reactivate user account
const reactivateUser = async (req, res) => {
  try {
    const { userId } = req.body;
    const { id: adminId } = req.user;

    // Find user to reactivate - check both UserNew and User models
  //  console.log('Looking for user with ID:', userId);
    let user = await UserNew.findById(userId);
  //  console.log('Found in UserNew:', user ? { id: user._id, name: user.name, role: user.role } : 'Not found');
    
    // If not found in UserNew, try the old User model
    if (!user) {
      const User = require('../models/User');
      user = await User.findById(userId);
      console.log('Found in User:', user ? { id: user._id, name: user.name, role: user.role } : 'Not found');
    }
    
    if (!user) {
      console.log('User not found in either model, returning 404');
      return res.status(404).json({
        message: 'User not found'
      });
    }

    // Check if user is already active
    if (user.isActive) {
      return res.status(400).json({
        message: 'User account is already active'
      });
    }

    // Reactivate user
    user.isActive = true;
    user.deactivatedAt = null;
    user.deactivatedBy = null;
    user.deactivationReason = null;
    await user.save();

    res.json({
      message: 'User account reactivated successfully',
      user: {
        id: user._id,
        author_id: user.author_id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus
      }
    });
  } catch (error) {
    console.error('Error reactivating user:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Get all users with role management
const getAllUsers = async (req, res) => {
  try {
    const { role, status, page = 1, limit = 10 } = req.query;
    // console.log('=== GET ALL USERS DEBUG ===');
    // console.log('Query params:', { role, status, page, limit });
    
    // Build query - default to active users only
    const query = {};
    if (role) query.role = role;
    if (status) {
      if (status === 'active') {
        query.isActive = true;
      } else if (status === 'inactive') {
        query.isActive = false;
      } else if (status === 'all') {
        // Don't filter by isActive - return all users
      }
      // If status is something else, don't filter by isActive
    } else {
      // Default to active users if no status filter is provided
      query.isActive = true;
    }
    
    //console.log('Final query:', query);

    // Get users from both UserNew and User models
    const User = require('../models/User');
    
    // Get users from UserNew model
    const newUsers = await UserNew.find(query)
      .select('-password -tempPassword')
      .sort({ createdAt: -1 });
    // Get users from old User model and convert to UserNew format
    const oldUsers = await User.find(query)
      .select('-password -tempPassword')
      .sort({ createdAt: -1 });
    // Convert old users to new format
    const convertedOldUsers = oldUsers.map(user => ({
      _id: user._id,
      author_id: user.author_id || user._id.toString(),
      name: user.name,
      email: user.email,
      profileImageUrl: user.profileImageUrl,
      role: user.role,
      isActive: user.isActive !== undefined ? user.isActive : true,
      deactivatedAt: user.deactivatedAt,
      deactivatedBy: user.deactivatedBy,
      deactivationReason: user.deactivationReason,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));

    // Combine users and remove duplicates based on email
    const allUsers = [...newUsers, ...convertedOldUsers];
    const uniqueUsers = allUsers.filter((user, index, self) => 
      index === self.findIndex(u => u.email === user.email)
    );
    
    // Debug: Log users being returned
    // console.log('=== GET ALL USERS DEBUG ===');
    // console.log('Query used:', query);
    // console.log('Users found:', uniqueUsers.map(u => ({ name: u.name, email: u.email, role: u.role, isActive: u.isActive })));
    // console.log('=== END GET ALL USERS DEBUG ===');
    
    // console.log('New users found:', newUsers.length);
    // console.log('Old users found:', oldUsers.length);
    // console.log('Total unique users:', uniqueUsers.length);
    // console.log('Users with isActive false:', uniqueUsers.filter(u => u.isActive === false).length);
    
    // Apply pagination
    // If limit is very high (>= 1000), return all users without pagination for statistics
    const startIndex = (page - 1) * limit;
    const endIndex = limit >= 1000 ? uniqueUsers.length : startIndex + limit;
    const users = uniqueUsers.slice(startIndex, endIndex);

    // Get total count
    const total = uniqueUsers.length;
    
    // console.log('Returning users:', users.length);
    // console.log('=== END GET ALL USERS DEBUG ===');

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Get user role history
const getUserRoleHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await UserNew.findById(userId)
      .select('name email role roleHistory')
      .populate('roleHistory.assignedBy', 'name email');

    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    res.json({
      user: {
        id: user._id,
        author_id: user.author_id,
        name: user.name,
        email: user.email,
        currentRole: user.role,
        roleHistory: user.roleHistory
      }
    });
  } catch (error) {
    console.error('Error fetching user role history:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Get system statistics
const getSystemStats = async (req, res) => {
  try {
    const totalUsers = await UserNew.countDocuments();
    const activeUsers = await UserNew.countDocuments({ accountStatus: 'active' });
    const deactivatedUsers = await UserNew.countDocuments({ accountStatus: 'deactivated' });
    
    // Debug: Check if there are users in the old User model
    const User = require('../models/User');
    const oldModelUsers = await User.countDocuments();
    // Get users from both models for accurate stats
    const allNewUsers = await UserNew.find({});
    const allOldUsers = await User.find({});
    
    // Convert old users to new format
    const convertedOldUsers = allOldUsers.map(user => ({
      _id: user._id,
      author_id: user.author_id || user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus || 'active',
      isActive: user.isActive
    }));
    
    // Combine all users
    const allUsers = [...allNewUsers, ...convertedOldUsers];
    const uniqueUsers = allUsers.filter((user, index, self) => 
      index === self.findIndex(u => u.email === user.email)
    );
    
    // Calculate stats from combined users
    const actualTotalUsers = uniqueUsers.filter(u => u.isActive === true).length; // Only count active users
    const actualActiveUsers = uniqueUsers.filter(u => u.isActive === true).length;
    const actualDeactivatedUsers = uniqueUsers.filter(u => u.isActive === false).length;
    
    // Debug logging
    // console.log('=== SYSTEM STATS DEBUG ===');
    // console.log('Total users:', actualTotalUsers);
    // console.log('Active users:', actualActiveUsers);
    // console.log('Deactivated users:', actualDeactivatedUsers);
    // console.log('Users with isActive false:', uniqueUsers.filter(u => u.isActive === false).length);
    // console.log('Users by accountStatus:', uniqueUsers.reduce((acc, u) => {
    //   const status = u.accountStatus || 'undefined';
    //   acc[status] = (acc[status] || 0) + 1;
    //   return acc;
    // }, {}));
    // console.log('Users by isActive:', uniqueUsers.reduce((acc, u) => {
    //   const active = u.isActive;
    //   acc[active] = (acc[active] || 0) + 1;
    //   return acc;
    // }, {}));
    
    // Calculate role stats (only for active users)
    const activeUsersForRoles = uniqueUsers.filter(user => user.isActive === true);
    
    // Debug: Log all users and their roles/status
    // console.log('=== ROLE STATS DEBUG ===');
    // console.log('All users:', uniqueUsers.map(u => ({ name: u.name, email: u.email, role: u.role, isActive: u.isActive })));
    // console.log('Active users for roles:', activeUsersForRoles.map(u => ({ name: u.name, email: u.email, role: u.role, isActive: u.isActive })));
    
    const roleStats = activeUsersForRoles.reduce((acc, user) => {
      const role = user.role;
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});
    
    // console.log('Role stats:', roleStats);
    // console.log('=== END ROLE STATS DEBUG ===');
    
    const roleStatsArray = Object.entries(roleStats).map(([role, count]) => ({
      _id: role,
      count
    }));
    
    // Calculate status stats (only for active users)
    const statusStats = uniqueUsers.filter(user => user.isActive === true).reduce((acc, user) => {
      const status = user.accountStatus || 'active';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    
    const statusStatsArray = Object.entries(statusStats).map(([status, count]) => ({
      _id: status,
      count
    }));

    res.json({
      totalUsers: actualTotalUsers,
      activeUsers: actualActiveUsers,
      deactivatedUsers: actualDeactivatedUsers,
      roleStats: roleStatsArray,
      statusStats: statusStatsArray
    });
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Create trainee account by admin
const createTraineeAccount = async (req, res) => {
  try {
    const { 
      author_id, 
      date_of_joining, 
      candidate_name, 
      phone_number, 
      candidate_personal_mail_id, 
      joining_status, 
      genre, 
      role_type, 
      role_assign, 
      qualification, 
      password,
      department = 'OTHERS',
      top_department_name_as_per_darwinbox,
      department_name_as_per_darwinbox
    } = req.body;

    // Validate required fields
    if (!author_id || !candidate_name || !candidate_personal_mail_id) {
      return res.status(400).json({
        message: 'Author ID, candidate name, and email are required'
      });
    }

    // Check if joiner with this email already exists
    const existingJoiner = await Joiner.findOne({ 
      $or: [
        { email: candidate_personal_mail_id },
        { candidate_personal_mail_id: candidate_personal_mail_id }
      ]
    });
    if (existingJoiner) {
      return res.status(400).json({
        message: 'Joiner with this email already exists'
      });
    }

    // Check if joiner with this author_id already exists
    const existingAuthorId = await Joiner.findOne({ author_id });
    if (existingAuthorId) {
      return res.status(400).json({
        message: 'Joiner with this Author ID already exists'
      });
    }

    // Create new joiner record
    const newJoiner = new Joiner({
      author_id,
      name: candidate_name,
      candidate_name: candidate_name,
      email: candidate_personal_mail_id,
      candidate_personal_mail_id: candidate_personal_mail_id,
      phone: phone_number,
      phone_number: phone_number,
      department: department,
      top_department_name_as_per_darwinbox: top_department_name_as_per_darwinbox,
      role: role_type || 'trainee',
      role_assign: role_assign || 'OTHER',
      qualification: qualification,
      genre: genre,
      joiningDate: date_of_joining ? new Date(date_of_joining) : new Date(),
      date_of_joining: date_of_joining ? new Date(date_of_joining) : new Date(),
      joining_status: joining_status || 'confirmed',
      status: 'active',
      accountCreated: true,
      accountCreatedAt: new Date(),
      createdBy: req.user?._id || null, // Admin who created this, or null if not available
      onboardingChecklist: {
        welcomeEmailSent: false,
        credentialsGenerated: false,
        accountActivated: true,
        trainingAssigned: false,
        documentsSubmitted: false
      }
    });

    await newJoiner.save();

    res.status(201).json({
      message: 'Joiner account created successfully',
      joiner: {
        id: newJoiner._id,
        author_id: newJoiner.author_id,
        name: newJoiner.name,
        candidate_name: newJoiner.candidate_name,
        email: newJoiner.email,
        candidate_personal_mail_id: newJoiner.candidate_personal_mail_id,
        phone: newJoiner.phone,
        phone_number: newJoiner.phone_number,
        department: newJoiner.department,
        role: newJoiner.role,
        role_assign: newJoiner.role_assign,
        qualification: newJoiner.qualification,
        genre: newJoiner.genre,
        joiningDate: newJoiner.joiningDate,
        date_of_joining: newJoiner.date_of_joining,
        joining_status: newJoiner.joining_status,
        status: newJoiner.status,
        accountCreated: newJoiner.accountCreated,
        accountCreatedAt: newJoiner.accountCreatedAt
      }
    });

  } catch (error) {
    console.error('Error creating joiner account:', error);
    console.error('Error details:', error);
    
    // Check if it's a database connection error
    if (error.name === 'MongooseError' && error.message.includes('buffering timed out')) {
      return res.status(500).json({
        message: 'Database connection timeout. Please check your database connection.',
        error: 'Database connection failed'
      });
    }
    
    // Check if it's a validation error
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Validation error',
        error: error.message,
        details: error.errors
      });
    }
    
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// Get pending users (placeholder function)
const getPendingUsers = async (req, res) => {
  try {
    // For now, return empty array since we're not using pending users
    // This can be implemented later if needed
    res.status(200).json({
      users: []
    });
  } catch (error) {
    console.error('Error fetching pending users:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Fix joiner statuses for deactivated users
// @route   POST /api/admin/fix-joiner-statuses
// @access  Private (Admin)
const fixJoinerStatuses = async (req, res) => {
  try {
    const Joiner = require('../models/Joiner');
    const User = require('../models/User');
    const UserNew = require('../models/UserNew');
    
    console.log('Starting joiner status fix...');
    
    // Find all deactivated users
    const deactivatedUsers = await User.find({ isActive: false });
    const deactivatedUsersNew = await UserNew.find({ isActive: false });
    
    const allDeactivatedUsers = [...deactivatedUsers, ...deactivatedUsersNew];
    
    console.log(`Found ${allDeactivatedUsers.length} deactivated users`);
    
    let fixedCount = 0;
    const results = [];
    
    for (const user of allDeactivatedUsers) {
      console.log(`Processing user: ${user.name} (${user.email})`);
      
      // Find corresponding joiner by email first
      let joiner = await Joiner.findOne({ email: user.email });
      
      // If not found by email, try by name
      if (!joiner) {
        joiner = await Joiner.findOne({ 
          $or: [
            { name: user.name },
            { candidate_name: user.name }
          ]
        });
      }
      
      if (joiner) {
        console.log(`Found joiner for ${user.email}, current status: ${joiner.status}`);
        
        // Update joiner status to inactive
        const updatedJoiner = await Joiner.findOneAndUpdate(
          { _id: joiner._id },
          { 
            status: 'inactive',
            accountCreated: false
          },
          { new: true, runValidators: false }
        );
        
        console.log(`Updated joiner status to: ${updatedJoiner.status}`);
        fixedCount++;
        results.push({
          user: { name: user.name, email: user.email },
          joiner: { name: joiner.name, email: joiner.email, status: updatedJoiner.status }
        });
      } else {
        console.log(`No joiner found for ${user.email}`);
        results.push({
          user: { name: user.name, email: user.email },
          joiner: null,
          error: 'No joiner found'
        });
      }
    }
    
    // Show final joiner status distribution
    const statusCounts = await Joiner.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    console.log('Final joiner status distribution:', statusCounts);
    
    res.json({
      message: `Fixed ${fixedCount} joiner statuses`,
      totalDeactivatedUsers: allDeactivatedUsers.length,
      fixedCount,
      results,
      finalStatusDistribution: statusCounts
    });
    
  } catch (error) {
    console.error('Error fixing joiner statuses:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get deactivated users from separate table
// @route   GET /api/admin/deactivated-users
// @access  Private (Admin)
const getDeactivatedUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, severity, search } = req.query;
    
    // Build query
    const query = { status: 'deactivated' };
    
    if (category) {
      query['deactivationDetails.category'] = category;
    }
    
    if (severity) {
      query['deactivationDetails.severity'] = severity;
    }
    
    if (search) {
      query.$or = [
        { 'userInfo.name': { $regex: search, $options: 'i' } },
        { 'userInfo.email': { $regex: search, $options: 'i' } },
        { 'userInfo.author_id': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get deactivated users with pagination
    const deactivatedUsers = await DeactivatedUser.find(query)
      .sort({ 'deactivationDetails.deactivatedAt': -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('deactivationDetails.deactivatedBy', 'name email')
      .populate('reinstatementInfo.reinstatedBy', 'name email');
    
    // Get total count
    const total = await DeactivatedUser.countDocuments(query);
    
    // Get statistics
    const stats = await DeactivatedUser.aggregate([
      { $match: { status: 'deactivated' } },
      {
        $group: {
          _id: null,
          totalDeactivated: { $sum: 1 },
          byCategory: {
            $push: '$deactivationDetails.category'
          },
          bySeverity: {
            $push: '$deactivationDetails.severity'
          },
          byRole: {
            $push: '$userInfo.role'
          }
        }
      }
    ]);
    
    // Process statistics
    const categoryStats = stats[0]?.byCategory.reduce((acc, cat) => {
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {}) || {};
    
    const severityStats = stats[0]?.bySeverity.reduce((acc, sev) => {
      acc[sev] = (acc[sev] || 0) + 1;
      return acc;
    }, {}) || {};
    
    const roleStats = stats[0]?.byRole.reduce((acc, role) => {
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {}) || {};
    
    res.json({
      deactivatedUsers,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
      statistics: {
        totalDeactivated: stats[0]?.totalDeactivated || 0,
        byCategory: categoryStats,
        bySeverity: severityStats,
        byRole: roleStats
      }
    });
  } catch (error) {
    console.error('Error fetching deactivated users:', error);
    res.status(500).json({ error: error.message });
  }
};

// @desc    Get deactivated user details
// @route   GET /api/admin/deactivated-users/:id
// @access  Private (Admin)
const getDeactivatedUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    const deactivatedUser = await DeactivatedUser.findById(id)
      .populate('deactivationDetails.deactivatedBy', 'name email')
      .populate('reinstatementInfo.reinstatedBy', 'name email');
    
    if (!deactivatedUser) {
      return res.status(404).json({ message: 'Deactivated user not found' });
    }
    
    res.json({ deactivatedUser });
  } catch (error) {
    console.error('Error fetching deactivated user details:', error);
    res.status(500).json({ error: error.message });
  }
};

// @desc    Reinstatement deactivated user
// @route   PUT /api/admin/deactivated-users/:id/reinstate
// @access  Private (Admin)
const reinstateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const { id: adminId } = req.user;
    
    // Get deactivated user record
    const deactivatedUser = await DeactivatedUser.findById(id);
    if (!deactivatedUser) {
      return res.status(404).json({ message: 'Deactivated user not found' });
    }
    
    // Get admin info
    const adminUser = await UserNew.findById(adminId).select('name email');
    
    // Update deactivated user record
    deactivatedUser.status = 'reinstated';
    deactivatedUser.reinstatementInfo = {
      reinstatedAt: new Date(),
      reinstatedBy: adminId,
      reinstatedByName: adminUser ? adminUser.name : 'Unknown Admin',
      reinstatementReason: reason || 'User reinstated by admin'
    };
    
    await deactivatedUser.save();
    
    // Reactivate the original user
    const User = require('../models/User');
    const originalUserId = deactivatedUser.originalUserId || deactivatedUser.originalUserNewId;
    const userModel = deactivatedUser.originalUserId ? User : UserNew;
    
    await userModel.findByIdAndUpdate(originalUserId, {
      isActive: true,
      accountStatus: 'active',
      deactivatedAt: null,
      deactivatedBy: null,
      deactivationReason: null
    });
    
    res.json({ 
      message: 'User reinstated successfully',
      deactivatedUser 
    });
  } catch (error) {
    console.error('Error reinstating user:', error);
    res.status(500).json({ error: error.message });
  }
};

// @desc    Check current status of deactivated users and joiners
// @route   GET /api/admin/check-status
// @access  Private (Admin)
const checkStatus = async (req, res) => {
  try {
    const Joiner = require('../models/Joiner');
    const User = require('../models/User');
    const UserNew = require('../models/UserNew');
    
    const deactivatedUsers = await User.find({ isActive: false });
    const deactivatedUsersNew = await UserNew.find({ isActive: false });
    const allDeactivatedUsers = [...deactivatedUsers, ...deactivatedUsersNew];
    
    const joinerStatusCounts = await Joiner.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({
      deactivatedUsers: allDeactivatedUsers.map(u => ({ name: u.name, email: u.email })),
      joinerStatusDistribution: joinerStatusCounts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createAdmin,
  promoteUser,
  deactivateUser,
  reactivateUser,
  getAllUsers,
  getUserRoleHistory,
  getSystemStats,
  createTraineeAccount,
  getPendingUsers,
  fixJoinerStatuses,
  checkStatus,
  getDeactivatedUsers,
  getDeactivatedUserDetails,
  reinstateUser
};
