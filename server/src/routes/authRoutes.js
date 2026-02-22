import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { loginSchema } from "../services/validation.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { signAccessToken } from "../utils/jwt.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

const formatUser = (user) => ({
  id: String(user._id),
  email: user.email,
  fullName: user.fullName,
  organization: user.organization,
  role: user.role,
  active: user.active,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body);
    const user = await User.findOne({ email: payload.email });

    if (!user || !user.active) {
      throw new ApiError(401, "Invalid credentials");
    }

    const passwordOk = await bcrypt.compare(payload.password, user.passwordHash);

    if (!passwordOk) {
      throw new ApiError(401, "Invalid credentials");
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signAccessToken({
      sub: String(user._id),
      email: user.email,
      role: user.role,
      name: user.fullName
    });

    res.json({ token, user: formatUser(user) });
  })
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    res.json({ user: formatUser(user) });
  })
);

export default router;
