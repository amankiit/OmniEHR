import mongoose from "mongoose";

const conditionSchema = new mongoose.Schema(
  {
    resourceType: {
      type: String,
      default: "Condition"
    },
    clinicalStatus: {
      type: String,
      enum: ["active", "recurrence", "relapse", "inactive", "remission", "resolved"],
      default: "active"
    },
    verificationStatus: {
      type: String,
      enum: ["unconfirmed", "provisional", "differential", "confirmed", "refuted", "entered-in-error"],
      default: "confirmed"
    },
    code: {
      system: String,
      code: { type: String, required: true },
      display: String
    },
    subject: {
      reference: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Patient",
        required: true
      }
    },
    onsetDateTime: Date,
    recordedDate: Date,
    note: String,
    asserter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  {
    timestamps: true
  }
);

conditionSchema.index({ "subject.reference": 1, createdAt: -1 });
conditionSchema.index({ "code.code": 1 });

const Condition = mongoose.model("Condition", conditionSchema);

export default Condition;
