const mongoose = require("mongoose");
const crypto = require("crypto");

const UserSchema = new mongoose.Schema(
  {
    author_id: { 
      type: String, 
      required: true, 
      unique: true, 
      default: () => crypto.randomUUID() 
    },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profileImageUrl: { type: String, default: null },
    role: { 
      type: String, 
      enum: ["admin", "master_trainer", "trainer", "trainee", "boa"], 
      required: true 
    },
    // For trainers and trainees
    assignedTrainer: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      default: null 
    },
    // For master trainers and trainers
    assignedTrainees: { 
      type: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User" 
      }],
      default: []
    },
    // User status
    isActive: { type: Boolean, default: true },
    lastClockIn: { type: Date, default: null },
    lastClockOut: { type: Date, default: null },
    
    // Account management
    accountStatus: { 
      type: String, 
      enum: ["active", "inactive", "suspended", "deactivated"], 
      default: "active" 
    },
    deactivatedAt: { type: Date, default: null },
    deactivatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    deactivationReason: { type: String, default: null },
    
    // Role management
    roleHistory: [{
      role: { type: String, required: true },
      assignedAt: { type: Date, default: Date.now },
      assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      reason: { type: String, default: null }
    }],
    
    // Admin invite system
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    inviteToken: { type: String, default: null },
    inviteExpiresAt: { type: Date, default: null },
    // Additional fields for trainees
    employeeId: { type: String, unique: true, sparse: true },
    department: { type: String, default: null },
    joiningDate: { type: Date, default: Date.now },
    phone: { type: String, default: null },
    genre: { type: String, default: null },
    
    // Fields from joiners table
    date_of_joining: { type: Date, default: null },
    candidate_name: { type: String, default: null },
    phone_number: { type: String, default: null },
    candidate_personal_mail_id: { type: String, default: null },
    Company_Maill_ID: { type: String, default: null },
    joining_status: { type: String, default: null },
    genre: { type: String, default: null },
    role_type: { type: String, default: null },
    role_assign: { type: String, default: null },
    qualification: { type: String, default: null },
    Have_M_Tech_PC: { type: String, default: null },
    Have_M_Tech_OD: { type: String, default: null },
    Home_State: { type: String, default: null },
    Year_of_Passout: { type: String, default: null },
    Manager: { type: String, default: null },
    Specialization: { type: String, default: null },
    status: { type: String, default: 'active' },
    accountCreated: { type: Boolean, default: false },
    accountCreatedAt: { type: Date, default: null },
    createdBy: { type: String, ref: "User", default: null },
    
    // Password management
    tempPassword: { type: String, default: null }, // Temporary password for new accounts
    passwordChanged: { type: Boolean, default: false }, // Track if user changed their password
    
    // Array fields
    onboardingChecklist: [{
      welcomeEmailSent: { type: Boolean, default: false },
      credentialsGenerated: { type: Boolean, default: false },
      accountActivated: { type: Boolean, default: false },
      trainingAssigned: { type: Boolean, default: false },
      documentsSubmitted: { type: Boolean, default: false }
    }],
    company_allocated_details: { type: [mongoose.Schema.Types.Mixed], default: [] },
    dayPlanTasks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    fortnightExams: { type: [mongoose.Schema.Types.Mixed], default: [] },
    dailyQuizzes: { type: [mongoose.Schema.Types.Mixed], default: [] },
    courseLevelExams: { type: [mongoose.Schema.Types.Mixed], default: [] },
    demo_managements_details: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
