import express from "express";
import Patient from "../models/Patient.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { patientDocToResource, patientResourceToDoc } from "../services/fhirMapper.js";
import { patientPortalRegistrationSchema } from "../services/validation.js";
import {
  ensurePidIdentifier,
  generateNextPatientPid
} from "../services/patientPidService.js";

const router = express.Router();

router.post(
  "/patient-register",
  asyncHandler(async (req, res) => {
    const payload = patientPortalRegistrationSchema.parse(req.body);
    const pid = await generateNextPatientPid();

    const telecom = [];
    if (payload.phone) {
      telecom.push({ system: "phone", value: payload.phone });
    }
    if (payload.email) {
      telecom.push({ system: "email", value: payload.email });
    }

    const hasAddress = payload.line1 || payload.city || payload.state || payload.postalCode;
    const address = hasAddress
      ? [
          {
            line: payload.line1 ? [payload.line1] : [],
            city: payload.city,
            state: payload.state,
            postalCode: payload.postalCode
          }
        ]
      : [];

    const resource = {
      resourceType: "Patient",
      active: true,
      name: [
        {
          family: payload.familyName,
          given: [payload.givenName]
        }
      ],
      telecom,
      gender: payload.gender,
      birthDate: payload.birthDate,
      address
    };

    const docPayload = patientResourceToDoc(resource);
    const identifier = ensurePidIdentifier(docPayload.identifier, pid);

    const patient = await Patient.create({
      ...docPayload,
      pid,
      identifier
    });

    const patientResource = patientDocToResource(patient);

    res.status(201).json({
      message: "Registration completed",
      pid,
      patientId: patientResource.id,
      patient: patientResource
    });
  })
);

export default router;
