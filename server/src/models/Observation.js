import mongoose from "mongoose";

const observationSchema = new mongoose.Schema(
  {
    resourceType: {
      type: String,
      default: "Observation"
    },
    status: {
      type: String,
      enum: ["registered", "preliminary", "final", "amended"],
      default: "final"
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
    effectiveDateTime: Date,
    issued: Date,
    valueQuantity: {
      value: Number,
      unit: String,
      system: String,
      code: String
    },
    note: String,
    performer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  {
    timestamps: true
  }
);

observationSchema.index({ "subject.reference": 1, createdAt: -1 });

const Observation = mongoose.model("Observation", observationSchema);

export default Observation;
