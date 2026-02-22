import mongoose from "mongoose";

const medicationRequestSchema = new mongoose.Schema(
  {
    resourceType: {
      type: String,
      default: "MedicationRequest"
    },
    status: {
      type: String,
      enum: [
        "active",
        "on-hold",
        "cancelled",
        "completed",
        "entered-in-error",
        "stopped",
        "draft",
        "unknown"
      ],
      default: "active"
    },
    intent: {
      type: String,
      enum: [
        "proposal",
        "plan",
        "order",
        "original-order",
        "reflex-order",
        "filler-order",
        "instance-order",
        "option"
      ],
      default: "order"
    },
    medication: {
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
    authoredOn: Date,
    dosageInstruction: String,
    reasonCode: {
      system: String,
      code: String,
      display: String
    },
    dispenseRequest: {
      numberOfRepeatsAllowed: Number,
      quantityValue: Number,
      quantityUnit: String
    },
    note: String,
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  {
    timestamps: true
  }
);

medicationRequestSchema.index({ "subject.reference": 1, createdAt: -1 });
medicationRequestSchema.index({ "medication.code": 1 });

const MedicationRequest = mongoose.model("MedicationRequest", medicationRequestSchema);

export default MedicationRequest;
