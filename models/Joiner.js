const mongoose = require('mongoose');

const joinerSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  
  candidate_name: {
    type: String,
    trim: true,
    maxlength: [100, 'Candidate name cannot exceed 100 characters']
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address']
  },
  
  candidate_personal_mail_id: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address']
  },
  
  Company_Maill_ID: {
    type: String,
    lowercase: true,
    trim: true,
    default: null,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address']
  },
  
  phone: {
    type: String,
    required: false,
    trim: true,
    default: null,
    validate: {
      validator: function(v) {
        // Allow null, undefined, or empty string
        if (!v || v === null || v === undefined || v.trim() === '') return true;
        // If provided, validate format
        return /^[\+]?[0-9][\d]{0,15}$/.test(v);
      },
      message: 'Please enter a valid phone number'
    }
  },
  
  phone_number: {
    type: String,
    trim: true,
    default: null,
    validate: {
      validator: function(v) {
        // Allow null, undefined, or empty string
        if (!v || v === null || v === undefined || v.trim() === '') return true;
        // If provided, validate format
        return /^[\+]?[0-9][\d]{0,15}$/.test(v);
      },
      message: 'Please enter a valid phone number'
    }
  },
  
  // Department and Role Information
  department: {
    type: String,
    required: [true, 'Department is required'],
    enum: ['IT', 'HR', 'Finance', 'SDM', 'SDI', 'OTHERS'],
    default: 'OTHERS'
  },
  
  top_department_name_as_per_darwinbox: {
    type: String,
    trim: true,
    maxlength: [100, 'Department name cannot exceed 100 characters']
  },
  
  role: {
    type: String,
    required: true,
    enum: ['trainee', 'trainer', 'master_trainer', 'boa'],
    default: 'trainee'
  },
  
  role_assign: {
    type: String,
    enum: ['SDM', 'SDI', 'SDF', 'SDB', 'OTHER'],
    default: 'OTHER'
  },
  
  qualification: {
    type: String,
    trim: true,
    maxlength: [200, 'Qualification cannot exceed 200 characters'],
    default: null
  },
  
  // New fields for joiner data
  Have_M_Tech_PC: {
    type: String,
    trim: true,
    maxlength: [100, 'Have M.Tech PC cannot exceed 100 characters'],
    default: null
  },
  
  Have_M_Tech_OD: {
    type: String,
    trim: true,
    maxlength: [100, 'Have M.Tech OD cannot exceed 100 characters'],
    default: null
  },
  
  Home_State: {
    type: String,
    trim: true,
    maxlength: [100, 'Home State cannot exceed 100 characters'],
    default: null
  },
  
  Year_of_Passout: {
    type: String,
    trim: true,
    maxlength: [10, 'Year of Passout cannot exceed 10 characters'],
    default: null
  },
  
  Manager: {
    type: String,
    trim: true,
    maxlength: [100, 'Manager cannot exceed 100 characters'],
    default: null
  },
  
  Specialization: {
    type: String,
    trim: true,
    maxlength: [200, 'Specialization cannot exceed 200 characters'],
    default: null
  },
  
  // Optional Information
  employeeId: {
    type: String,
    trim: true,
    maxlength: [50, 'Employee ID cannot exceed 50 characters']
  },
  
  genre: {
    type: String,
    enum: ['Male', 'Female', 'Other', 'male', 'female', 'other'],
    default: null
  },
  
  // Joining Information
  joiningDate: {
    type: Date,
    required: [true, 'Joining date is required'],
    default: Date.now
  },
  
  date_of_joining: {
    type: Date,
    default: null
  },
  
  joining_status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'postponed', 'active'],
    default: 'pending'
  },
  
  author_id: {
    type: String,
    required: true,
    unique: true
  },
  
  // Status and Workflow
  status: {
    type: String,
    enum: ['pending', 'active', 'inactive', 'completed', 'not_joined'],
    default: 'pending'
  },
  
  notJoinedReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Not joined reason cannot exceed 500 characters'],
    default: ''
  },
  
  // Account Creation
  accountCreated: {
    type: Boolean,
    default: false
  },
  
  accountCreatedAt: {
    type: Date,
    default: null
  },
  
  // User Account Reference (if account is created)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Administrative Information
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null
  },
  
  // Additional Notes
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters'],
    default: ''
  },
  
  // Onboarding Checklist
  onboardingChecklist: {
    welcomeEmailSent: { type: Boolean, default: false },
    credentialsGenerated: { type: Boolean, default: false },
    accountActivated: { type: Boolean, default: false },
    trainingAssigned: { type: Boolean, default: false },
    documentsSubmitted: { type: Boolean, default: false }
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better query performance
joinerSchema.index({ joiningDate: 1 });
joinerSchema.index({ department: 1 });
joinerSchema.index({ status: 1 });
joinerSchema.index({ createdBy: 1 });

// Pre-save middleware to update updatedAt and normalize genre
joinerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Normalize genre field to capitalize first letter
  if (this.genre) {
    this.genre = this.genre.charAt(0).toUpperCase() + this.genre.slice(1).toLowerCase();
  }
  
  next();
});

// Virtual for full name display
joinerSchema.virtual('displayName').get(function() {
  return this.name;
});

// Virtual for joining date formatted
joinerSchema.virtual('formattedJoiningDate').get(function() {
  return this.joiningDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Method to check if joiner is active
joinerSchema.methods.isActive = function() {
  return this.status === 'active';
};

// Method to check if account is created
joinerSchema.methods.hasAccount = function() {
  return this.accountCreated && this.userId;
};

// Static method to get joiners by date range
joinerSchema.statics.getByDateRange = function(startDate, endDate) {
  return this.find({
    joiningDate: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ joiningDate: -1 });
};

// Static method to get joiners by department
joinerSchema.statics.getByDepartment = function(department) {
  return this.find({ department }).sort({ joiningDate: -1 });
};

// Static method to get pending joiners
joinerSchema.statics.getPending = function() {
  return this.find({ status: 'pending' }).sort({ joiningDate: -1 });
};

module.exports = mongoose.model('Joiner', joinerSchema);
