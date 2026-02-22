import Counter from "../models/Counter.js";
import { ApiError } from "../utils/apiError.js";

const PID_COUNTER_KEY = "patient_pid";
const PID_MIN = 1000000;
const PID_MAX = 9999999;
export const PID_SYSTEM = "urn:pid";

export const generateNextPatientPid = async () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await Counter.findOneAndUpdate(
      { key: PID_COUNTER_KEY },
      { $inc: { seq: 1 } },
      { new: true }
    );

    if (existing) {
      if (existing.seq < PID_MIN) {
        await Counter.updateOne(
          { _id: existing._id },
          { $set: { seq: PID_MIN - 1 } }
        );
        continue;
      }

      if (existing.seq > PID_MAX) {
        throw new ApiError(500, "Patient PID range exhausted");
      }

      return String(existing.seq);
    }

    try {
      const created = await Counter.create({ key: PID_COUNTER_KEY, seq: PID_MIN });
      return String(created.seq);
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
      // Another request created the counter first. Retry increment.
    }
  }

  throw new ApiError(500, "Unable to generate patient PID");
};

export const ensurePidIdentifier = (identifiers = [], pid) => {
  const safe = Array.isArray(identifiers) ? identifiers : [];

  const filtered = safe.filter((identifier) => {
    const system = String(identifier?.system || "").trim();
    const value = String(identifier?.value || "").trim();

    if (!value) {
      return false;
    }

    if (system === PID_SYSTEM) {
      return false;
    }

    if (value === pid) {
      return false;
    }

    return true;
  });

  return [{ system: PID_SYSTEM, value: pid }, ...filtered];
};
