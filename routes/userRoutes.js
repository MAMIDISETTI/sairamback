const express = require("express");
const { protect, masterTrainerOnly, requireRoles } = require("../middlewares/authMiddleware");
const { getUsers, getUserById, createUser, updateUserByAuthorId } = require("../controllers/userController");

const router = express.Router();

// User Management Routes
router.get("/", protect, requireRoles(["admin", "master_trainer", "boa", "trainer"]), getUsers); // Get all users (Admin, Master Trainer, BOA, and Trainer)
router.get("/:id", protect, getUserById); // Get a specific user
router.post("/", protect, createUser); // Create a new user (BOA/Admin)
router.put("/by-author/:authorId", protect, requireRoles(["admin"]), updateUserByAuthorId); // Update user by author_id (Admin only)

module.exports = router;
