import { ZodError } from "zod";

export const notFoundHandler = (_req, res) => {
  res.status(404).json({ message: "Route not found" });
};

export const errorHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: "Validation error",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }

  if (error?.name === "CastError") {
    return res.status(400).json({ message: "Invalid resource identifier" });
  }

  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? "Internal server error" : error.message;

  return res.status(statusCode).json({ message });
};
