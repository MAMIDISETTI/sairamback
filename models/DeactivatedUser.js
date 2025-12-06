const mongoose = require('mongoose');

const DeactivatedUserSchema = new mongoose.Schema(
  {
    // Reference to the original user
    originalUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    originalUserNewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserNew',
      default: null
    },
    
    // User information at time of deactivation
    userInfo: {
      author_id: { type: String, required: true },
      name: { type: String, required: true },
      email: { type: String, required: true },
      role: { 
        type: String, 
        enum: ["admin", "master_trainer", "trainer", "trainee", "boa"], 
        required: true 
      },
      department: { type: String, default: null },
      phone: { type: String, default: null },
      joiningDate: { type: Date, default: null },
      employeeId: { type: String, default: null }
    },
    
    // Deactivation details
    deactivationDetails: {
      deactivatedAt: { type: Date, default: Date.now },
      deactivatedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'UserNew', 
        required: true 
      },
      deactivatedByName: { type: String, required: true },
      deactivatedByEmail: { type: String, required: true },
      reason: { type: String, required: true, default: 'Account deactivated by admin' },
      remarks: { type: String, default: null },
      category: {
        type: String,
        enum: ['Resigned', 'Terminated', 'Joined and Exit', 'Absconded', 'BGV Failed', 'Deployed', 'other'],
        default: 'other'
      },
      severity: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'low'
      }
    },
    
    // Assignment information at time of deactivation
    assignmentInfo: {
      assignedTrainer: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        default: null 
      },
      assignedTrainerName: { type: String, default: null },
      assignedTrainees: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
      }],
      assignedTraineeNames: [{ type: String }],
      status: { 
        type: String, 
        enum: ['active', 'pending_assignment', 'inactive'], 
        default: 'inactive' 
      }
    },
    
    // System information
    systemInfo: {
      lastLoginAt: { type: Date, default: null },
      accountCreatedAt: { type: Date, default: null },
      totalLoginDays: { type: Number, default: 0 },
      lastActivityAt: { type: Date, default: null }
    },
    
    // Additional notes and attachments
    additionalInfo: {
      notes: { type: String, default: null },
      attachments: [{ 
        type: String // File paths or URLs
      }],
      followUpRequired: { type: Boolean, default: false },
      followUpDate: { type: Date, default: null },
      followUpNotes: { type: String, default: null }
    },
    
    // Status tracking
    status: {
      type: String,
      enum: ['deactivated', 'reinstated', 'permanently_removed'],
      default: 'deactivated'
    },
    
    // Reinstatement information (if applicable)
    reinstatementInfo: {
      reinstatedAt: { type: Date, default: null },
      reinstatedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'UserNew', 
        default: null 
      },
      reinstatedByName: { type: String, default: null },
      reinstatementReason: { type: String, default: null }
    }
  },
  { 
    timestamps: true,
    collection: 'deactivated_users'
  }
);

// Indexes for better query performance
DeactivatedUserSchema.index({ 'userInfo.email': 1 });
DeactivatedUserSchema.index({ 'userInfo.author_id': 1 });
DeactivatedUserSchema.index({ 'deactivationDetails.deactivatedAt': -1 });
DeactivatedUserSchema.index({ 'userInfo.role': 1 });
DeactivatedUserSchema.index({ 'deactivationDetails.category': 1 });
DeactivatedUserSchema.index({ status: 1 });

// Virtual for formatted deactivation date
DeactivatedUserSchema.virtual('formattedDeactivationDate').get(function() {
  return this.deactivationDetails.deactivatedAt.toLocaleDateString();
});

// Virtual for days since deactivation
DeactivatedUserSchema.virtual('daysSinceDeactivation').get(function() {
  const now = new Date();
  const deactivatedAt = this.deactivationDetails.deactivatedAt;
  const diffTime = Math.abs(now - deactivatedAt);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

module.exports = mongoose.model('DeactivatedUser', DeactivatedUserSchema);
