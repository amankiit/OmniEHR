import { verifyAccessToken } from "../utils/jwt.js";
import { ApiError } from "../utils/apiError.js";

export const authenticate = (req, _res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return next(new ApiError(401, "Missing bearer token"));
  }

  const token = authorization.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    return next();
  } catch {
    return next(new ApiError(401, "Invalid or expired token"));
  }
};

export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication required"));
  }

  if (!roles.includes(req.user.role)) {
    return next(new ApiError(403, "Insufficient permissions"));
  }

  return next();
};
