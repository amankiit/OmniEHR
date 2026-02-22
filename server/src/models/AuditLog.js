import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    actorEmail: String,
    actorRole: String,
    action: {
      type: String,
      required: true
    },
    resourceType: String,
    resourceId: String,
    method: {
      type: String,
      required: true
    },
    path: {
      type: String,
      required: true
    },
    statusCode: {
      type: Number,
      required: true
    },
    outcome: {
      type: String,
      enum: ["success", "failure"],
      required: true
    },
    ipAddress: String,
    userAgent: String
  },
  {
    timestamps: true
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorUserId: 1, createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
