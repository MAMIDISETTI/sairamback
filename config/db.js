const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI ;
    await mongoose.connect(mongoUri, {});
    console.log("Connected to MongoDB");
  } catch (err) {
    process.exit(1);
  }
};

module.exports = connectDB;
