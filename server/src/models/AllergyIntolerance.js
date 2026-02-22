import mongoose from "mongoose";

const reactionSchema = new mongoose.Schema(
  {
    substanceText: String,
    manifestation: [String],
    severity: {
      type: String,
      enum: ["mild", "moderate", "severe"]
    },
    description: String
  },
  { _id: false }
);

const allergyIntoleranceSchema = new mongoose.Schema(
  {
    resourceType: {
      type: String,
      default: "AllergyIntolerance"
    },
    clinicalStatus: {
      type: String,
      enum: ["active", "inactive", "resolved"],
      default: "active"
    },
    verificationStatus: {
      type: String,
      enum: ["unconfirmed", "confirmed", "refuted", "entered-in-error"],
      default: "confirmed"
    },
    type: {
      type: String,
      enum: ["allergy", "intolerance"],
      default: "allergy"
    },
    category: [
      {
        type: String,
        enum: ["food", "medication", "environment", "biologic"]
      }
    ],
    criticality: {
      type: String,
      enum: ["low", "high", "unable-to-assess"],
      default: "unable-to-assess"
    },
    code: {
      system: String,
      code: { type: String, required: true },
      display: String
    },
    patient: {
      reference: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Patient",
        required: true
      }
    },
    recordedDate: Date,
    reaction: [reactionSchema],
    recorder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  {
    timestamps: true
  }
);

allergyIntoleranceSchema.index({ "patient.reference": 1, createdAt: -1 });
allergyIntoleranceSchema.index({ "code.code": 1 });

const AllergyIntolerance = mongoose.model("AllergyIntolerance", allergyIntoleranceSchema);

export default AllergyIntolerance;
