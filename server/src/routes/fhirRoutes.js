import express from "express";
import { randomUUID } from "node:crypto";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import Patient from "../models/Patient.js";
import Observation from "../models/Observation.js";
import Condition from "../models/Condition.js";
import AllergyIntolerance from "../models/AllergyIntolerance.js";
import MedicationRequest from "../models/MedicationRequest.js";
import Encounter from "../models/Encounter.js";
import Appointment from "../models/Appointment.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import {
  patientDocToResource,
  patientResourceToDoc,
  observationDocToResource,
  observationResourceToDoc,
  conditionDocToResource,
  conditionResourceToDoc,
  allergyIntoleranceDocToResource,
  allergyIntoleranceResourceToDoc,
  medicationRequestDocToResource,
  medicationRequestResourceToDoc,
  encounterDocToResource,
  encounterResourceToDoc,
  appointmentDocToResource,
  appointmentResourceToDoc,
  taskDocToResource,
  taskResourceToDoc,
  toSearchsetBundle
} from "../services/fhirMapper.js";
import {
  ensurePidIdentifier,
  generateNextPatientPid
} from "../services/patientPidService.js";
import {
  patientResourceSchema,
  observationResourceSchema,
  conditionResourceSchema,
  allergyIntoleranceResourceSchema,
  medicationRequestResourceSchema,
  encounterResourceSchema,
  appointmentResourceSchema,
  taskResourceSchema
} from "../services/validation.js";

const router = express.Router();

router.use(authenticate);

const readRoles = ["admin", "practitioner", "auditor"];
const writeRoles = ["admin", "practitioner"];
const patientWriteRoles = ["admin"];

const baseUrl = (req) => `${req.protocol}://${req.get("host")}/api/fhir`;

const parsePatientReference = (value, fieldName) => {
  const [resourceType, id] = String(value || "").split("/");
  if (resourceType !== "Patient" || !id) {
    throw new ApiError(400, `${fieldName} must be in Patient/{id} format`);
  }

  return id;
};

const ensurePatientExists = async (patientId) => {
  const patientExists = await Patient.exists({ _id: patientId });

  if (!patientExists) {
    throw new ApiError(400, "Referenced Patient does not exist");
  }
};

const ensurePractitionerExists = async (practitionerUserId) => {
  const practitionerExists = await User.exists({
    _id: practitionerUserId,
    role: "practitioner",
    active: true
  });

  if (!practitionerExists) {
    throw new ApiError(400, "Referenced Practitioner does not exist or is inactive");
  }
};

const ensureBookingPermission = (requestingUser, practitionerUserId) => {
  if (
    requestingUser.role === "practitioner" &&
    String(practitionerUserId) !== String(requestingUser.sub)
  ) {
    throw new ApiError(403, "Practitioners can only book appointments under their own schedule");
  }
};

const ensureTaskOwnerPermission = (requestingUser, ownerUserId) => {
  if (requestingUser.role !== "practitioner") {
    return;
  }

  if (!ownerUserId || String(ownerUserId) !== String(requestingUser.sub)) {
    throw new ApiError(403, "Practitioners can only assign or update tasks under their own worklist");
  }
};

const nonBlockingAppointmentStatuses = ["cancelled", "noshow", "entered-in-error"];
const slotDurationMinutes = 15;
const slotWindowStartMinutes = 9 * 60;
const slotWindowEndMinutes = 12 * 60;
const allowedBookingDays = new Set([1, 2, 3, 4, 5, 6]);

const ensurePractitionerAvailability = async ({
  practitionerUserId,
  start,
  end,
  excludeAppointmentId
}) => {
  const filter = {
    practitionerUserId,
    status: { $nin: nonBlockingAppointmentStatuses },
    start: { $lt: end },
    end: { $gt: start }
  };

  if (excludeAppointmentId) {
    filter._id = { $ne: excludeAppointmentId };
  }

  const conflict = await Appointment.findOne(filter).select("_id start end").lean();

  if (conflict) {
    throw new ApiError(409, "Practitioner is not available in the selected time range");
  }
};

const ensureWithinBookableSlot = ({ start, end, minutesDuration }) => {
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new ApiError(400, "Appointment start/end must be valid datetime values");
  }

  if (startDate >= endDate) {
    throw new ApiError(400, "Appointment end must be after start");
  }

  if (startDate.toDateString() !== endDate.toDateString()) {
    throw new ApiError(400, "Appointments must start and end on the same day");
  }

  if (!allowedBookingDays.has(startDate.getDay())) {
    throw new ApiError(400, "Appointments are only allowed Monday to Saturday");
  }

  const startTotalMinutes = startDate.getHours() * 60 + startDate.getMinutes();
  const endTotalMinutes = endDate.getHours() * 60 + endDate.getMinutes();
  const duration = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));

  if (
    startTotalMinutes < slotWindowStartMinutes ||
    endTotalMinutes > slotWindowEndMinutes ||
    startTotalMinutes % slotDurationMinutes !== 0 ||
    endTotalMinutes % slotDurationMinutes !== 0
  ) {
    throw new ApiError(400, "Appointments must be within 09:00-12:00 in 15-minute slot boundaries");
  }

  if (duration !== slotDurationMinutes) {
    throw new ApiError(400, "Appointments must be exactly 15 minutes");
  }

  if (minutesDuration !== undefined && Number(minutesDuration) !== slotDurationMinutes) {
    throw new ApiError(400, "minutesDuration must be 15");
  }
};

const resourceInteractions = [
  { code: "read" },
  { code: "search-type" },
  { code: "create" },
  { code: "update" }
];

router.get(
  "/metadata",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    res.json({
      resourceType: "CapabilityStatement",
      status: "active",
      date: new Date().toISOString(),
      kind: "instance",
      fhirVersion: "4.0.1",
      format: ["json"],
      software: {
        name: "OmniEHR Core",
        version: "2.0.0"
      },
      implementation: {
        description: "FHIR R4-compatible EHR API",
        url: baseUrl(req)
      },
      rest: [
        {
          mode: "server",
          resource: [
            { type: "Patient", interaction: resourceInteractions },
            { type: "Observation", interaction: resourceInteractions },
            { type: "Condition", interaction: resourceInteractions },
            { type: "AllergyIntolerance", interaction: resourceInteractions },
            { type: "MedicationRequest", interaction: resourceInteractions },
            { type: "Encounter", interaction: resourceInteractions },
            { type: "Appointment", interaction: resourceInteractions },
            { type: "Task", interaction: resourceInteractions }
          ]
        }
      ]
    });
  })
);

router.post(
  "/Patient",
  authorize(...patientWriteRoles),
  asyncHandler(async (req, res) => {
    const resource = patientResourceSchema.parse(req.body);
    const docPayload = patientResourceToDoc(resource);
    const pid = await generateNextPatientPid();
    const identifier = ensurePidIdentifier(docPayload.identifier, pid);

    const patient = await Patient.create({
      ...docPayload,
      pid,
      identifier,
      createdBy: req.user.sub,
      updatedBy: req.user.sub
    });

    res.status(201).json(patientDocToResource(patient));
  })
);

router.get(
  "/Patient",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const filter = {};

    if (req.query.identifier) {
      filter["identifier.value"] = String(req.query.identifier);
    }

    const patients = await Patient.find(filter).sort({ createdAt: -1 }).limit(100);
    const resources = patients.map(patientDocToResource);

    res.json(
      toSearchsetBundle({
        resourceType: "Patient",
        resources,
        total: resources.length,
        baseUrl: baseUrl(req),
        searchId: randomUUID()
      })
    );
  })
);

router.get(
  "/Patient/:id",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      throw new ApiError(404, "Patient not found");
    }

    res.json(patientDocToResource(patient));
  })
);

router.put(
  "/Patient/:id",
  authorize(...patientWriteRoles),
  asyncHandler(async (req, res) => {
    const resource = patientResourceSchema.parse(req.body);
    const docPayload = patientResourceToDoc(resource);
    const existingPatient = await Patient.findById(req.params.id).select("pid");

    if (!existingPatient) {
      throw new ApiError(404, "Patient not found");
    }

    const pid = existingPatient.pid || (await generateNextPatientPid());
    const identifier = ensurePidIdentifier(docPayload.identifier, pid);

    const patient = await Patient.findByIdAndUpdate(
      req.params.id,
      {
        ...docPayload,
        pid,
        identifier,
        updatedBy: req.user.sub
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!patient) {
      throw new ApiError(404, "Patient not found");
    }

    res.json(patientDocToResource(patient));
  })
);

router.get(
  ["/Patient/:id/$everything", "/Patient/:id/\\$everything"],
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      throw new ApiError(404, "Patient not found");
    }

    const [observations, conditions, allergies, medications, encounters, appointments, tasks] =
      await Promise.all([
        Observation.find({ "subject.reference": req.params.id }).sort({ effectiveDateTime: -1 }),
        Condition.find({ "subject.reference": req.params.id }).sort({ recordedDate: -1, createdAt: -1 }),
        AllergyIntolerance.find({ "patient.reference": req.params.id }).sort({ recordedDate: -1, createdAt: -1 }),
        MedicationRequest.find({ "subject.reference": req.params.id }).sort({ authoredOn: -1, createdAt: -1 }),
        Encounter.find({ "subject.reference": req.params.id }).sort({ periodStart: -1, createdAt: -1 }),
        Appointment.find({ "patient.reference": req.params.id }).sort({ start: -1, createdAt: -1 }),
        Task.find({ "for.reference": req.params.id }).sort({ dueDate: 1, authoredOn: -1, createdAt: -1 })
      ]);

    const allResources = [
      patientDocToResource(patient),
      ...conditions.map(conditionDocToResource),
      ...allergies.map(allergyIntoleranceDocToResource),
      ...medications.map(medicationRequestDocToResource),
      ...encounters.map(encounterDocToResource),
      ...observations.map(observationDocToResource),
      ...appointments.map(appointmentDocToResource),
      ...tasks.map(taskDocToResource)
    ];

    res.json({
      resourceType: "Bundle",
      type: "searchset",
      total: allResources.length,
      timestamp: new Date().toISOString(),
      entry: allResources.map((resource) => ({
        fullUrl: `${baseUrl(req)}/${resource.resourceType}/${resource.id}`,
        resource,
        search: { mode: "match" }
      }))
    });
  })
);

router.post(
  "/Observation",
  authorize(...writeRoles),
  asyncHandler(async (req, res) => {
    const resource = observationResourceSchema.parse(req.body);
    const docPayload = observationResourceToDoc(resource);

    await ensurePatientExists(docPayload.subject.reference);

    const observation = await Observation.create({
      ...docPayload,
      performer: req.user.sub
    });

    res.status(201).json(observationDocToResource(observation));
  })
);

router.get(
  "/Observation",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const filter = {};

    if (req.query.subject) {
      filter["subject.reference"] = parsePatientReference(req.query.subject, "subject");
    }

    const observations = await Observation.find(filter)
      .sort({ effectiveDateTime: -1, createdAt: -1 })
      .limit(200);
    const resources = observations.map(observationDocToResource);

    res.json(
      toSearchsetBundle({
        resourceType: "Observation",
        resources,
        total: resources.length,
        baseUrl: baseUrl(req),
        searchId: randomUUID()
      })
    );
  })
);

router.get(
  "/Observation/:id",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const observation = await Observation.findById(req.params.id);

    if (!observation) {
      throw new ApiError(404, "Observation not found");
    }

    res.json(observationDocToResource(observation));
  })
);

router.put(
  "/Observation/:id",
  authorize(...writeRoles),
  asyncHandler(async (req, res) => {
    const resource = observationResourceSchema.parse(req.body);
    const docPayload = observationResourceToDoc(resource);

    await ensurePatientExists(docPayload.subject.reference);

    const observation = await Observation.findByIdAndUpdate(
      req.params.id,
      {
        ...docPayload,
        performer: req.user.sub
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!observation) {
      throw new ApiError(404, "Observation not found");
    }

    res.json(observationDocToResource(observation));
  })
);

router.post(
  "/Condition",
  authorize(...writeRoles),
  asyncHandler(async (req, res) => {
    const resource = conditionResourceSchema.parse(req.body);
    const docPayload = conditionResourceToDoc(resource);

    await ensurePatientExists(docPayload.subject.reference);

    const condition = await Condition.create({
      ...docPayload,
      asserter: req.user.sub
    });

    res.status(201).json(conditionDocToResource(condition));
  })
);

router.get(
  "/Condition",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const filter = {};

    if (req.query.subject) {
      filter["subject.reference"] = parsePatientReference(req.query.subject, "subject");
    }

    const records = await Condition.find(filter).sort({ recordedDate: -1, createdAt: -1 }).limit(200);
    const resources = records.map(conditionDocToResource);

    res.json(
      toSearchsetBundle({
        resourceType: "Condition",
        resources,
        total: resources.length,
        baseUrl: baseUrl(req),
        searchId: randomUUID()
      })
    );
  })
);

router.get(
  "/Condition/:id",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const record = await Condition.findById(req.params.id);

    if (!record) {
      throw new ApiError(404, "Condition not found");
    }

    res.json(conditionDocToResource(record));
  })
);

router.put(
  "/Condition/:id",
  authorize(...writeRoles),
  asyncHandler(async (req, res) => {
    const resource = conditionResourceSchema.parse(req.body);
    const docPayload = conditionResourceToDoc(resource);

    await ensurePatientExists(docPayload.subject.reference);

    const record = await Condition.findByIdAndUpdate(
      req.params.id,
      {
        ...docPayload,
        asserter: req.user.sub
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!record) {
      throw new ApiError(404, "Condition not found");
    }

    res.json(conditionDocToResource(record));
  })
);

router.post(
  "/AllergyIntolerance",
  authorize(...writeRoles),
  asyncHandler(async (req, res) => {
    const resource = allergyIntoleranceResourceSchema.parse(req.body);
    const docPayload = allergyIntoleranceResourceToDoc(resource);

    await ensurePatientExists(docPayload.patient.reference);

    const record = await AllergyIntolerance.create({
      ...docPayload,
      recorder: req.user.sub
    });

    res.status(201).json(allergyIntoleranceDocToResource(record));
  })
);

router.get(
  "/AllergyIntolerance",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const filter = {};

    if (req.query.patient) {
      filter["patient.reference"] = parsePatientReference(req.query.patient, "patient");
    }

    const records = await AllergyIntolerance.find(filter)
      .sort({ recordedDate: -1, createdAt: -1 })
      .limit(200);
    const resources = records.map(allergyIntoleranceDocToResource);

    res.json(
      toSearchsetBundle({
        resourceType: "AllergyIntolerance",
        resources,
        total: resources.length,
        baseUrl: baseUrl(req),
        searchId: randomUUID()
      })
    );
  })
);

router.get(
  "/AllergyIntolerance/:id",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const record = await AllergyIntolerance.findById(req.params.id);

    if (!record) {
      throw new ApiError(404, "AllergyIntolerance not found");
    }

    res.json(allergyIntoleranceDocToResource(record));
  })
);

router.put(
  "/AllergyIntolerance/:id",
  authorize(...writeRoles),
  asyncHandler(async (req, res) => {
    const resource = allergyIntoleranceResourceSchema.parse(req.body);
    const docPayload = allergyIntoleranceResourceToDoc(resource);

    await ensurePatientExists(docPayload.patient.reference);

    const record = await AllergyIntolerance.findByIdAndUpdate(
      req.params.id,
      {
        ...docPayload,
        recorder: req.user.sub
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!record) {
      throw new ApiError(404, "AllergyIntolerance not found");
    }

    res.json(allergyIntoleranceDocToResource(record));
  })
);

router.post(
  "/MedicationRequest",
  authorize(...writeRoles),
  asyncHandler(async (req, res) => {
    const resource = medicationRequestResourceSchema.parse(req.body);
    const docPayload = medicationRequestResourceToDoc(resource);

    await ensurePatientExists(docPayload.subject.reference);

    const record = await MedicationRequest.create({
      ...docPayload,
      requester: req.user.sub
    });

    res.status(201).json(medicationRequestDocToResource(record));
  })
);

router.get(
  "/MedicationRequest",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const filter = {};

    if (req.query.subject) {
      filter["subject.reference"] = parsePatientReference(req.query.subject, "subject");
    }

    const records = await MedicationRequest.find(filter)
      .sort({ authoredOn: -1, createdAt: -1 })
      .limit(200);
    const resources = records.map(medicationRequestDocToResource);

    res.json(
      toSearchsetBundle({
        resourceType: "MedicationRequest",
        resources,
        total: resources.length,
        baseUrl: baseUrl(req),
        searchId: randomUUID()
      })
    );
  })
);

router.get(
  "/MedicationRequest/:id",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const record = await MedicationRequest.findById(req.params.id);

    if (!record) {
      throw new ApiError(404, "MedicationRequest not found");
    }

    res.json(medicationRequestDocToResource(record));
  })
);

router.put(
  "/MedicationRequest/:id",
  authorize(...writeRoles),
  asyncHandler(async (req, res) => {
    const resource = medicationRequestResourceSchema.parse(req.body);
    const docPayload = medicationRequestResourceToDoc(resource);

    await ensurePatientExists(docPayload.subject.reference);

    const record = await MedicationRequest.findByIdAndUpdate(
      req.params.id,
      {
        ...docPayload,
        requester: req.user.sub
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!record) {
      throw new ApiError(404, "MedicationRequest not found");
    }

    res.json(medicationRequestDocToResource(record));
  })
);

router.post(
  "/Encounter",
  authorize(...writeRoles),
  asyncHandler(async (req, res) => {
    const resource = encounterResourceSchema.parse(req.body);
    const docPayload = encounterResourceToDoc(resource);

    await ensurePatientExists(docPayload.subject.reference);

    const record = await Encounter.create(docPayload);

    res.status(201).json(encounterDocToResource(record));
  })
);

router.get(
  "/Encounter",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const filter = {};

    if (req.query.subject) {
      filter["subject.reference"] = parsePatientReference(req.query.subject, "subject");
    }

    const records = await Encounter.find(filter).sort({ periodStart: -1, createdAt: -1 }).limit(200);
    const resources = records.map(encounterDocToResource);

    res.json(
      toSearchsetBundle({
        resourceType: "Encounter",
        resources,
        total: resources.length,
        baseUrl: baseUrl(req),
        searchId: randomUUID()
      })
    );
  })
);

router.get(
  "/Encounter/:id",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const record = await Encounter.findById(req.params.id);

    if (!record) {
      throw new ApiError(404, "Encounter not found");
    }

    res.json(encounterDocToResource(record));
  })
);

router.put(
  "/Encounter/:id",
  authorize(...writeRoles),
  asyncHandler(async (req, res) => {
    const resource = encounterResourceSchema.parse(req.body);
    const docPayload = encounterResourceToDoc(resource);

    await ensurePatientExists(docPayload.subject.reference);

    const record = await Encounter.findByIdAndUpdate(req.params.id, docPayload, {
      new: true,
      runValidators: true
    });

    if (!record) {
      throw new ApiError(404, "Encounter not found");
    }

    res.json(encounterDocToResource(record));
  })
);

router.post(
  "/Appointment",
  authorize(...writeRoles),
  asyncHandler(async (req, res) => {
    const resource = appointmentResourceSchema.parse(req.body);
    const docPayload = appointmentResourceToDoc(resource);

    ensureWithinBookableSlot(docPayload);
    await ensurePatientExists(docPayload.patient.reference);
    await ensurePractitionerExists(docPayload.practitionerUserId);
    ensureBookingPermission(req.user, docPayload.practitionerUserId);
    await ensurePractitionerAvailability({
      practitionerUserId: docPayload.practitionerUserId,
      start: docPayload.start,
      end: docPayload.end
    });

    const practitioner = await User.findById(docPayload.practitionerUserId)
      .select("fullName")
      .lean();

    const record = await Appointment.create({
      ...docPayload,
      practitionerName: practitioner?.fullName || docPayload.practitionerName,
      createdBy: req.user.sub
    });

    res.status(201).json(appointmentDocToResource(record));
  })
);

router.get(
  "/Appointment",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const filter = {};

    if (req.user.role === "practitioner") {
      filter.practitionerUserId = req.user.sub;
    }

    if (req.query.patient) {
      filter["patient.reference"] = parsePatientReference(req.query.patient, "patient");
    }

    if (req.query.practitioner) {
      const [resourceType, id] = String(req.query.practitioner).split("/");
      if (resourceType !== "Practitioner" || !id) {
        throw new ApiError(400, "practitioner must be in Practitioner/{id} format");
      }
      if (req.user.role === "practitioner" && String(id) !== String(req.user.sub)) {
        throw new ApiError(403, "Practitioners can only access their own schedule");
      }
      filter.practitionerUserId = id;
    }

    if (req.query.from || req.query.to) {
      filter.start = {};

      if (req.query.from) {
        const from = new Date(String(req.query.from));
        if (Number.isNaN(from.getTime())) {
          throw new ApiError(400, "from must be a valid datetime");
        }
        filter.start.$gte = from;
      }

      if (req.query.to) {
        const to = new Date(String(req.query.to));
        if (Number.isNaN(to.getTime())) {
          throw new ApiError(400, "to must be a valid datetime");
        }
        filter.start.$lte = to;
      }
    }

    const records = await Appointment.find(filter).sort({ start: 1 }).limit(300);
    const resources = records.map(appointmentDocToResource);

    res.json(
      toSearchsetBundle({
        resourceType: "Appointment",
        resources,
        total: resources.length,
        baseUrl: baseUrl(req),
        searchId: randomUUID()
      })
    );
  })
);

router.get(
  "/Appointment/:id",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const record = await Appointment.findById(req.params.id);

    if (!record) {
      throw new ApiError(404, "Appointment not found");
    }

    if (
      req.user.role === "practitioner" &&
      String(record.practitionerUserId) !== String(req.user.sub)
    ) {
      throw new ApiError(403, "Practitioners can only access their own schedule");
    }

    res.json(appointmentDocToResource(record));
  })
);

router.put(
  "/Appointment/:id",
  authorize(...writeRoles),
  asyncHandler(async (req, res) => {
    const resource = appointmentResourceSchema.parse(req.body);
    const docPayload = appointmentResourceToDoc(resource);
    const existingRecord = await Appointment.findById(req.params.id).select("practitionerUserId");

    if (!existingRecord) {
      throw new ApiError(404, "Appointment not found");
    }

    if (
      req.user.role === "practitioner" &&
      String(existingRecord.practitionerUserId) !== String(req.user.sub)
    ) {
      throw new ApiError(403, "Practitioners can only modify their own schedule");
    }

    ensureWithinBookableSlot(docPayload);
    await ensurePatientExists(docPayload.patient.reference);
    await ensurePractitionerExists(docPayload.practitionerUserId);
    ensureBookingPermission(req.user, docPayload.practitionerUserId);
    await ensurePractitionerAvailability({
      practitionerUserId: docPayload.practitionerUserId,
      start: docPayload.start,
      end: docPayload.end,
      excludeAppointmentId: req.params.id
    });

    const practitioner = await User.findById(docPayload.practitionerUserId)
      .select("fullName")
      .lean();

    const record = await Appointment.findByIdAndUpdate(
      req.params.id,
      {
        ...docPayload,
        practitionerName: practitioner?.fullName || docPayload.practitionerName,
        createdBy: req.user.sub
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!record) {
      throw new ApiError(404, "Appointment not found");
    }

    res.json(appointmentDocToResource(record));
  })
);

router.post(
  "/Task",
  authorize(...writeRoles),
  asyncHandler(async (req, res) => {
    const resource = taskResourceSchema.parse(req.body);
    const docPayload = taskResourceToDoc(resource);

    await ensurePatientExists(docPayload.for.reference);

    let ownerUserId = docPayload.ownerUserId;
    if (req.user.role === "practitioner") {
      ownerUserId = req.user.sub;
    }
    ensureTaskOwnerPermission(req.user, ownerUserId);

    let ownerName = docPayload.ownerName;
    if (ownerUserId) {
      await ensurePractitionerExists(ownerUserId);
      const owner = await User.findById(ownerUserId).select("fullName").lean();
      ownerName = owner?.fullName || ownerName;
    }

    const record = await Task.create({
      ...docPayload,
      ownerUserId,
      ownerName,
      createdBy: req.user.sub
    });

    res.status(201).json(taskDocToResource(record));
  })
);

router.get(
  "/Task",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const filter = {};

    if (req.query.for) {
      filter["for.reference"] = parsePatientReference(req.query.for, "for");
    }

    if (req.query.status) {
      filter.status = String(req.query.status);
    }

    if (req.user.role === "practitioner") {
      filter.ownerUserId = req.user.sub;
    }

    if (req.query.owner) {
      const [resourceType, ownerId] = String(req.query.owner).split("/");
      if (resourceType !== "Practitioner" || !ownerId) {
        throw new ApiError(400, "owner must be in Practitioner/{id} format");
      }

      ensureTaskOwnerPermission(req.user, ownerId);
      filter.ownerUserId = ownerId;
    }

    const records = await Task.find(filter).sort({ dueDate: 1, authoredOn: -1, createdAt: -1 }).limit(300);
    const resources = records.map(taskDocToResource);

    res.json(
      toSearchsetBundle({
        resourceType: "Task",
        resources,
        total: resources.length,
        baseUrl: baseUrl(req),
        searchId: randomUUID()
      })
    );
  })
);

router.get(
  "/Task/:id",
  authorize(...readRoles),
  asyncHandler(async (req, res) => {
    const record = await Task.findById(req.params.id);

    if (!record) {
      throw new ApiError(404, "Task not found");
    }

    ensureTaskOwnerPermission(req.user, record.ownerUserId);

    res.json(taskDocToResource(record));
  })
);

router.put(
  "/Task/:id",
  authorize(...writeRoles),
  asyncHandler(async (req, res) => {
    const resource = taskResourceSchema.parse(req.body);
    const docPayload = taskResourceToDoc(resource);
    const existingRecord = await Task.findById(req.params.id).select("ownerUserId");

    if (!existingRecord) {
      throw new ApiError(404, "Task not found");
    }

    ensureTaskOwnerPermission(req.user, existingRecord.ownerUserId);
    await ensurePatientExists(docPayload.for.reference);

    let ownerUserId = docPayload.ownerUserId;
    if (req.user.role === "practitioner") {
      ownerUserId = req.user.sub;
    }
    ensureTaskOwnerPermission(req.user, ownerUserId);

    let ownerName = docPayload.ownerName;
    if (ownerUserId) {
      await ensurePractitionerExists(ownerUserId);
      const owner = await User.findById(ownerUserId).select("fullName").lean();
      ownerName = owner?.fullName || ownerName;
    }

    const record = await Task.findByIdAndUpdate(
      req.params.id,
      {
        ...docPayload,
        ownerUserId,
        ownerName
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!record) {
      throw new ApiError(404, "Task not found");
    }

    res.json(taskDocToResource(record));
  })
);

export default router;
