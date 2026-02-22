import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    organization: {
      type: String,
      trim: true,
      default: ""
    },
    passwordHash: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ["admin", "practitioner", "auditor"],
      default: "practitioner"
    },
    active: {
      type: Boolean,
      default: true
    },
    lastLoginAt: Date
  },
  {
    timestamps: true
  }
);

const User = mongoose.model("User", userSchema);

export default User;
