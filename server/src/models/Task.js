import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    resourceType: {
      type: String,
      default: "Task"
    },
    status: {
      type: String,
      enum: [
        "draft",
        "requested",
        "received",
        "accepted",
        "rejected",
        "ready",
        "cancelled",
        "in-progress",
        "on-hold",
        "failed",
        "completed",
        "entered-in-error"
      ],
      default: "requested"
    },
    intent: {
      type: String,
      default: "order"
    },
    priority: {
      type: String,
      enum: ["routine", "urgent", "asap", "stat"],
      default: "routine"
    },
    codeText: String,
    description: {
      type: String,
      required: true
    },
    for: {
      reference: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Patient",
        required: true
      }
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    ownerName: String,
    authoredOn: Date,
    dueDate: Date,
    note: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  {
    timestamps: true
  }
);

taskSchema.index({ "for.reference": 1, dueDate: 1 });
taskSchema.index({ ownerUserId: 1, status: 1, dueDate: 1 });

const Task = mongoose.model("Task", taskSchema);

export default Task;
