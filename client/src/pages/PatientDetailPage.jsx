import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { adminApi, fhirApi } from "../api.js";
import {
  bundleToResources,
  formatDateTime,
  medicationDisplay,
  observationValue,
  patientAddress,
  patientContact,
  patientFullName,
  patientMrn,
  patientPid,
  pickCodingCode,
  pickCodingDisplay,
  reasonText,
  splitEverythingBundle
} from "../utils/fhir.js";
import {
  buildDailySlots,
  getDayRangeFromDateInput,
  getNextBookableDateInput,
  getPractitionerIdFromAppointment,
  SERVICE_CATEGORY_OPTIONS,
  getSlotRange,
  isBookableDateInput,
  isSlotUnavailable,
  practitionerHasAvailableSlot
} from "../utils/scheduling.js";
import {
  buildPatientRiskProfile,
  getTaskDueDate,
  isTaskOverdue
} from "../utils/clinicalOps.js";
import { useAuth } from "../context/AuthContext.jsx";

const canEdit = (role) => role === "admin" || role === "practitioner";

const initialChart = {
  patient: null,
  observations: [],
  conditions: [],
  allergies: [],
  medications: [],
  encounters: [],
  appointments: [],
  tasks: []
};

const emptyObservation = {
  code: "8480-6",
  display: "Systolic blood pressure",
  value: "",
  unit: "mmHg",
  note: ""
};

const emptyCondition = {
  code: "44054006",
  display: "Type 2 diabetes mellitus",
  clinicalStatus: "active",
  note: ""
};

const emptyAllergy = {
  code: "227493005",
  display: "Cashew nuts",
  category: "food",
  criticality: "high",
  reaction: "Hives",
  severity: "moderate"
};

const emptyMedication = {
  code: "860975",
  display: "Metformin 500 MG Oral Tablet",
  status: "active",
  dosage: "Take 1 tablet by mouth twice daily",
  reason: "Type 2 diabetes"
};

const emptyEncounter = {
  status: "finished",
  classCode: "AMB",
  typeCode: "185349003",
  typeDisplay: "Outpatient visit",
  reason: "Routine follow-up",
  location: "Primary care clinic",
  serviceProvider: "General Medicine",
  note: ""
};

const emptyAppointment = {
  appointmentDate: getNextBookableDateInput(),
  slotValue: "",
  practitionerId: "",
  serviceCategory: "Follow-up",
  reason: "",
  description: "",
  comment: ""
};

const emptyTask = {
  description: "",
  priority: "routine",
  category: "Care coordination",
  dueDate: "",
  note: "",
  ownerId: ""
};

const PatientDetailPage = () => {
  const { id } = useParams();
  const { token, user } = useAuth();
  const [chart, setChart] = useState(initialChart);
  const [observationForm, setObservationForm] = useState(emptyObservation);
  const [conditionForm, setConditionForm] = useState(emptyCondition);
  const [allergyForm, setAllergyForm] = useState(emptyAllergy);
  const [medicationForm, setMedicationForm] = useState(emptyMedication);
  const [encounterForm, setEncounterForm] = useState(emptyEncounter);
  const [appointmentForm, setAppointmentForm] = useState(emptyAppointment);
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [practitioners, setPractitioners] = useState([]);
  const [slotAppointments, setSlotAppointments] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const load = async () => {
    const [patientResource, practitionerResponse, taskBundle] = await Promise.all([
      fhirApi.getPatient(token, id),
      adminApi.listPractitioners(token),
      fhirApi.listTasks(token, { for: `Patient/${id}` })
    ]);

    const taskResources = bundleToResources(taskBundle);
    let grouped = { ...initialChart, patient: patientResource, tasks: taskResources };

    try {
      const everythingBundle = await fhirApi.getPatientEverything(token, id);
      const split = splitEverythingBundle(everythingBundle);
      grouped = {
        ...split,
        patient: split.patient || patientResource,
        tasks: split.tasks.length ? split.tasks : taskResources
      };
    } catch {
      // Keep demographics visible even if $everything is temporarily unavailable.
    }

    const practitionerRecords = practitionerResponse.data || [];

    setChart(grouped);
    setPractitioners(practitionerRecords);

    setAppointmentForm((prev) => {
      const defaultPractitionerId =
        user.role === "practitioner"
          ? user.id
          : prev.practitionerId || practitionerRecords[0]?.id || "";

      return { ...prev, practitionerId: defaultPractitionerId };
    });

    setTaskForm((prev) => {
      const defaultOwnerId =
        user.role === "practitioner"
          ? user.id
          : prev.ownerId || practitionerRecords[0]?.id || "";

      return {
        ...prev,
        ownerId: defaultOwnerId
      };
    });
  };

  const loadSlotAppointments = async (dateInput) => {
    if (!isBookableDateInput(dateInput)) {
      setSlotAppointments([]);
      return;
    }

    const { start, end } = getDayRangeFromDateInput(dateInput);
    const response = await fhirApi.listAppointments(token, {
      from: start.toISOString(),
      to: end.toISOString()
    });

    setSlotAppointments(bundleToResources(response));
  };

  useEffect(() => {
    setInitialLoading(true);
    load()
      .catch((err) => setError(err.message || "Unable to load patient details"))
      .finally(() => setInitialLoading(false));
  }, [id, token, user.id, user.role]);

  useEffect(() => {
    loadSlotAppointments(appointmentForm.appointmentDate).catch((err) =>
      setError(err.message || "Unable to load slot availability")
    );
  }, [token, appointmentForm.appointmentDate]);

  const availablePractitioners = useMemo(() => {
    const scopedPractitioners =
      user.role === "practitioner"
        ? practitioners.filter((practitioner) => practitioner.id === user.id)
        : practitioners;

    return scopedPractitioners.filter((practitioner) => {
      return practitionerHasAvailableSlot({
        appointments: slotAppointments,
        practitionerId: practitioner.id,
        dateInput: appointmentForm.appointmentDate
      });
    });
  }, [appointmentForm.appointmentDate, practitioners, slotAppointments, user.id, user.role]);

  const practitionerMap = useMemo(() => {
    const map = new Map();
    practitioners.forEach((practitioner) => {
      map.set(practitioner.id, practitioner);
    });
    return map;
  }, [practitioners]);

  const taskOwnerOptions = useMemo(() => {
    if (user.role === "practitioner") {
      return practitioners.filter((practitioner) => practitioner.id === user.id);
    }

    return practitioners;
  }, [practitioners, user.id, user.role]);

  const slotOptions = useMemo(() => {
    const slots = buildDailySlots();

    return slots.map((slot) => ({
      ...slot,
      unavailable:
        !appointmentForm.practitionerId ||
        isSlotUnavailable({
          appointments: slotAppointments,
          practitionerId: appointmentForm.practitionerId,
          dateInput: appointmentForm.appointmentDate,
          slotValue: slot.value
        })
    }));
  }, [appointmentForm.appointmentDate, appointmentForm.practitionerId, slotAppointments]);

  useEffect(() => {
    if (availablePractitioners.length === 0) {
      return;
    }

    setAppointmentForm((prev) => {
      const stillAvailable = availablePractitioners.some(
        (practitioner) => practitioner.id === prev.practitionerId
      );
      if (stillAvailable) {
        return prev;
      }

      return {
        ...prev,
        practitionerId: availablePractitioners[0].id
      };
    });
  }, [availablePractitioners]);

  useEffect(() => {
    setAppointmentForm((prev) => {
      const isCurrentAvailable = slotOptions.some(
        (slot) => slot.value === prev.slotValue && !slot.unavailable
      );

      if (isCurrentAvailable) {
        return prev;
      }

      const firstAvailable = slotOptions.find((slot) => !slot.unavailable)?.value || "";
      if (firstAvailable === prev.slotValue) {
        return prev;
      }

      return {
        ...prev,
        slotValue: firstAvailable
      };
    });
  }, [slotOptions]);

  const submitClinicalResource = async ({ request, onSuccess }) => {
    setLoading(true);
    setError("");

    try {
      await request();
      onSuccess();
      await load();
      await loadSlotAppointments(appointmentForm.appointmentDate);
    } catch (err) {
      setError(err.message || "Unable to save clinical data");
    } finally {
      setLoading(false);
    }
  };

  const onCreateObservation = async (event) => {
    event.preventDefault();

    await submitClinicalResource({
      request: () =>
        fhirApi.createObservation(token, {
          resourceType: "Observation",
          status: "final",
          code: {
            coding: [
              {
                system: "http://loinc.org",
                code: observationForm.code,
                display: observationForm.display
              }
            ]
          },
          subject: {
            reference: `Patient/${id}`
          },
          effectiveDateTime: new Date().toISOString(),
          valueQuantity: {
            value: Number(observationForm.value),
            unit: observationForm.unit,
            system: "http://unitsofmeasure.org",
            code: observationForm.unit
          },
          note: observationForm.note ? [{ text: observationForm.note }] : undefined
        }),
      onSuccess: () => setObservationForm(emptyObservation)
    });
  };

  const onCreateCondition = async (event) => {
    event.preventDefault();

    await submitClinicalResource({
      request: () =>
        fhirApi.createCondition(token, {
          resourceType: "Condition",
          clinicalStatus: {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
                code: conditionForm.clinicalStatus
              }
            ]
          },
          verificationStatus: {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                code: "confirmed"
              }
            ]
          },
          code: {
            coding: [
              {
                system: "http://snomed.info/sct",
                code: conditionForm.code,
                display: conditionForm.display
              }
            ]
          },
          subject: {
            reference: `Patient/${id}`
          },
          recordedDate: new Date().toISOString(),
          note: conditionForm.note ? [{ text: conditionForm.note }] : undefined
        }),
      onSuccess: () => setConditionForm(emptyCondition)
    });
  };

  const onCreateAllergy = async (event) => {
    event.preventDefault();

    await submitClinicalResource({
      request: () =>
        fhirApi.createAllergy(token, {
          resourceType: "AllergyIntolerance",
          clinicalStatus: {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                code: "active"
              }
            ]
          },
          verificationStatus: {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
                code: "confirmed"
              }
            ]
          },
          type: "allergy",
          category: [allergyForm.category],
          criticality: allergyForm.criticality,
          code: {
            coding: [
              {
                system: "http://snomed.info/sct",
                code: allergyForm.code,
                display: allergyForm.display
              }
            ]
          },
          patient: {
            reference: `Patient/${id}`
          },
          recordedDate: new Date().toISOString(),
          reaction: allergyForm.reaction
            ? [
                {
                  substance: { text: allergyForm.display },
                  manifestation: [{ text: allergyForm.reaction }],
                  severity: allergyForm.severity,
                  description: allergyForm.reaction
                }
              ]
            : undefined
        }),
      onSuccess: () => setAllergyForm(emptyAllergy)
    });
  };

  const onCreateMedication = async (event) => {
    event.preventDefault();

    await submitClinicalResource({
      request: () =>
        fhirApi.createMedicationRequest(token, {
          resourceType: "MedicationRequest",
          status: medicationForm.status,
          intent: "order",
          medicationCodeableConcept: {
            coding: [
              {
                system: "http://www.nlm.nih.gov/research/umls/rxnorm",
                code: medicationForm.code,
                display: medicationForm.display
              }
            ]
          },
          subject: {
            reference: `Patient/${id}`
          },
          authoredOn: new Date().toISOString(),
          dosageInstruction: medicationForm.dosage
            ? [
                {
                  text: medicationForm.dosage
                }
              ]
            : undefined,
          reasonCode: medicationForm.reason
            ? [
                {
                  text: medicationForm.reason
                }
              ]
            : undefined
        }),
      onSuccess: () => setMedicationForm(emptyMedication)
    });
  };

  const onCreateEncounter = async (event) => {
    event.preventDefault();

    await submitClinicalResource({
      request: () =>
        fhirApi.createEncounter(token, {
          resourceType: "Encounter",
          status: encounterForm.status,
          class: {
            code: encounterForm.classCode
          },
          type: [
            {
              coding: [
                {
                  system: "http://snomed.info/sct",
                  code: encounterForm.typeCode,
                  display: encounterForm.typeDisplay
                }
              ]
            }
          ],
          subject: {
            reference: `Patient/${id}`
          },
          period: {
            start: new Date().toISOString()
          },
          reasonCode: encounterForm.reason
            ? [
                {
                  text: encounterForm.reason
                }
              ]
            : undefined,
          location: encounterForm.location
            ? [
                {
                  location: {
                    display: encounterForm.location
                  }
                }
              ]
            : undefined,
          serviceProvider: encounterForm.serviceProvider
            ? {
                display: encounterForm.serviceProvider
              }
            : undefined,
          note: encounterForm.note ? [{ text: encounterForm.note }] : undefined
        }),
      onSuccess: () => setEncounterForm(emptyEncounter)
    });
  };

  const onCreateAppointment = async (event) => {
    event.preventDefault();

    await submitClinicalResource({
      request: () => {
        if (!isBookableDateInput(appointmentForm.appointmentDate)) {
          throw new Error("Appointments can only be booked Monday to Saturday");
        }

        const slotRange = getSlotRange(appointmentForm.appointmentDate, appointmentForm.slotValue);
        if (!slotRange) {
          throw new Error("Select a valid slot");
        }

        const practitioner = availablePractitioners.find(
          (record) => record.id === appointmentForm.practitionerId
        );

        if (!practitioner) {
          throw new Error("Select an available practitioner");
        }

        return fhirApi.createAppointment(token, {
          resourceType: "Appointment",
          status: "booked",
          description: appointmentForm.description,
          serviceCategory: appointmentForm.serviceCategory
            ? [{ text: appointmentForm.serviceCategory }]
            : undefined,
          start: slotRange.start.toISOString(),
          end: slotRange.end.toISOString(),
          minutesDuration: 15,
          participant: [
            {
              actor: {
                reference: `Patient/${id}`
              },
              status: "accepted"
            },
            {
              actor: {
                reference: `Practitioner/${practitioner.id}`,
                display: practitioner.fullName
              },
              status: "accepted"
            }
          ],
          reasonCode: appointmentForm.reason ? [{ text: appointmentForm.reason }] : undefined,
          comment: appointmentForm.comment || undefined
        });
      },
      onSuccess: () =>
        setAppointmentForm((prev) => ({
          ...emptyAppointment,
          practitionerId: prev.practitionerId,
          appointmentDate: prev.appointmentDate
        }))
    });
  };

  const onCreateTask = async (event) => {
    event.preventDefault();

    await submitClinicalResource({
      request: () => {
        const ownerId = user.role === "practitioner" ? user.id : taskForm.ownerId;
        const owner = practitionerMap.get(ownerId);
        const dueIso = taskForm.dueDate
          ? new Date(`${taskForm.dueDate}T23:59:59`).toISOString()
          : undefined;

        return fhirApi.createTask(token, {
          resourceType: "Task",
          status: "requested",
          intent: "order",
          priority: taskForm.priority,
          code: taskForm.category ? { text: taskForm.category } : undefined,
          description: taskForm.description.trim(),
          for: {
            reference: `Patient/${id}`
          },
          owner: ownerId
            ? {
                reference: `Practitioner/${ownerId}`,
                display: owner?.fullName
              }
            : undefined,
          authoredOn: new Date().toISOString(),
          executionPeriod: dueIso ? { end: dueIso } : undefined,
          note: taskForm.note ? [{ text: taskForm.note.trim() }] : undefined
        });
      },
      onSuccess: () => setTaskForm((prev) => ({ ...emptyTask, ownerId: prev.ownerId }))
    });
  };

  const onUpdateTaskStatus = async (task, nextStatus) => {
    await submitClinicalResource({
      request: () =>
        fhirApi.updateTask(token, task.id, {
          ...task,
          status: nextStatus
        }),
      onSuccess: () => {}
    });
  };

  const riskProfile = useMemo(
    () =>
      buildPatientRiskProfile({
        conditions: chart.conditions,
        allergies: chart.allergies,
        medications: chart.medications,
        observations: chart.observations,
        encounters: chart.encounters,
        appointments: chart.appointments,
        tasks: chart.tasks
      }),
    [
      chart.allergies,
      chart.appointments,
      chart.conditions,
      chart.encounters,
      chart.medications,
      chart.observations,
      chart.tasks
    ]
  );

  if (initialLoading) {
    return <p>Loading patient...</p>;
  }

  if (!chart.patient) {
    return <p>Patient was not found.</p>;
  }

  const patient = chart.patient;
  const contact = patientContact(patient);

  const appointmentPractitioner = (appointment) => {
    const practitionerId = getPractitionerIdFromAppointment(appointment);
    const practitioner = practitionerMap.get(practitionerId);

    if (practitioner?.fullName) {
      return practitioner.fullName;
    }

    const participant = appointment.participant?.find((record) =>
      String(record.actor?.reference || "").startsWith("Practitioner/")
    );

    return participant?.actor?.display || participant?.actor?.reference || "-";
  };

  return (
    <section className="stack-gap">
      <h1>{patientFullName(patient)}</h1>
      <p className="muted-text">
        Longitudinal chart view with problem list, allergies, medications, encounters, vitals, and
        appointments.
      </p>
      {error ? <p className="banner banner-error">{error}</p> : null}

      <article className="card">
        <h2>Demographics</h2>
        <div className="details-grid">
          <p>
            <strong>PID:</strong> {patientPid(patient)}
          </p>
          <p>
            <strong>MRN:</strong> {patientMrn(patient)}
          </p>
          <p>
            <strong>Gender:</strong> {patient.gender || "-"}
          </p>
          <p>
            <strong>Birth date:</strong> {patient.birthDate || "-"}
          </p>
          <p>
            <strong>Phone:</strong> {contact.phone}
          </p>
          <p>
            <strong>Email:</strong> {contact.email}
          </p>
          <p>
            <strong>Address:</strong> {patientAddress(patient)}
          </p>
        </div>
      </article>

      <article className="stats-grid">
        <div className="metric-card">
          <h2>Conditions</h2>
          <p className="metric-value">{chart.conditions.length}</p>
        </div>
        <div className="metric-card">
          <h2>Allergies</h2>
          <p className="metric-value">{chart.allergies.length}</p>
        </div>
        <div className="metric-card">
          <h2>Medications</h2>
          <p className="metric-value">{chart.medications.length}</p>
        </div>
        <div className="metric-card">
          <h2>Encounters</h2>
          <p className="metric-value">{chart.encounters.length}</p>
        </div>
        <div className="metric-card">
          <h2>Observations</h2>
          <p className="metric-value">{chart.observations.length}</p>
        </div>
        <div className="metric-card">
          <h2>Appointments</h2>
          <p className="metric-value">{chart.appointments.length}</p>
        </div>
        <div className="metric-card">
          <h2>Care tasks</h2>
          <p className="metric-value">{chart.tasks.length}</p>
        </div>
      </article>

      <article className="card form-grid two-columns">
        <h2>Clinical decision support</h2>
        <div className="metric-card">
          <h3>Risk tier</h3>
          <p className="metric-value">
            <span className={`risk-chip risk-chip-${riskProfile.tier}`}>
              {riskProfile.tier} ({riskProfile.score})
            </span>
          </p>
          <p className="muted-text">
            {riskProfile.openTaskCount} open tasks, {riskProfile.overdueTaskCount} overdue.
          </p>
        </div>
        <div className="metric-card">
          <h3>Latest vitals</h3>
          <p className="muted-text">
            BP: {riskProfile.latestVitals.systolic || "-"} / {riskProfile.latestVitals.diastolic || "-"} mmHg
          </p>
          <p className="muted-text">HbA1c: {riskProfile.latestVitals.a1c || "-"}</p>
        </div>
        <div>
          <h3>Safety alerts</h3>
          {riskProfile.safetyAlerts.length === 0 ? (
            <p className="muted-text">No active alerts.</p>
          ) : (
            <ul className="plain-list">
              {riskProfile.safetyAlerts.map((alert) => (
                <li key={`${alert.title}-${alert.detail}`}>
                  <span className={`risk-chip risk-chip-${alert.severity}`}>{alert.severity}</span>{" "}
                  {alert.title}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Open care gaps</h3>
          {riskProfile.careGaps.length === 0 ? (
            <p className="muted-text">No open care gaps.</p>
          ) : (
            <ul className="plain-list">
              {riskProfile.careGaps.map((gap) => (
                <li key={`${gap.title}-${gap.detail}`}>
                  <span className={`risk-chip risk-chip-${gap.severity}`}>{gap.severity}</span> {gap.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>

      {canEdit(user.role) ? (
        <>
          <form className="card form-grid two-columns" onSubmit={onCreateCondition}>
            <h2>Add condition</h2>
            <label>
              SNOMED code
              <input
                value={conditionForm.code}
                onChange={(event) =>
                  setConditionForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Condition name
              <input
                value={conditionForm.display}
                onChange={(event) =>
                  setConditionForm((prev) => ({ ...prev, display: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Clinical status
              <select
                value={conditionForm.clinicalStatus}
                onChange={(event) =>
                  setConditionForm((prev) => ({ ...prev, clinicalStatus: event.target.value }))
                }
              >
                <option value="active">Active</option>
                <option value="recurrence">Recurrence</option>
                <option value="remission">Remission</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>
            <label className="label-span-2">
              Note
              <textarea
                rows="2"
                value={conditionForm.note}
                onChange={(event) =>
                  setConditionForm((prev) => ({ ...prev, note: event.target.value }))
                }
              />
            </label>
            <button type="submit" className="button" disabled={loading}>
              {loading ? "Saving..." : "Add condition"}
            </button>
          </form>

          <form className="card form-grid two-columns" onSubmit={onCreateAllergy}>
            <h2>Add allergy</h2>
            <label>
              SNOMED code
              <input
                value={allergyForm.code}
                onChange={(event) =>
                  setAllergyForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Allergy name
              <input
                value={allergyForm.display}
                onChange={(event) =>
                  setAllergyForm((prev) => ({ ...prev, display: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Category
              <select
                value={allergyForm.category}
                onChange={(event) =>
                  setAllergyForm((prev) => ({ ...prev, category: event.target.value }))
                }
              >
                <option value="food">Food</option>
                <option value="medication">Medication</option>
                <option value="environment">Environment</option>
                <option value="biologic">Biologic</option>
              </select>
            </label>
            <label>
              Criticality
              <select
                value={allergyForm.criticality}
                onChange={(event) =>
                  setAllergyForm((prev) => ({ ...prev, criticality: event.target.value }))
                }
              >
                <option value="low">Low</option>
                <option value="high">High</option>
                <option value="unable-to-assess">Unable to assess</option>
              </select>
            </label>
            <label>
              Reaction
              <input
                value={allergyForm.reaction}
                onChange={(event) =>
                  setAllergyForm((prev) => ({ ...prev, reaction: event.target.value }))
                }
              />
            </label>
            <label>
              Severity
              <select
                value={allergyForm.severity}
                onChange={(event) =>
                  setAllergyForm((prev) => ({ ...prev, severity: event.target.value }))
                }
              >
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>
            </label>
            <button type="submit" className="button form-submit-start" disabled={loading}>
              {loading ? "Saving..." : "Add allergy"}
            </button>
          </form>

          <form className="card form-grid two-columns" onSubmit={onCreateMedication}>
            <h2>Prescribe medication</h2>
            <label>
              RxNorm code
              <input
                value={medicationForm.code}
                onChange={(event) =>
                  setMedicationForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Medication
              <input
                value={medicationForm.display}
                onChange={(event) =>
                  setMedicationForm((prev) => ({ ...prev, display: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Status
              <select
                value={medicationForm.status}
                onChange={(event) =>
                  setMedicationForm((prev) => ({ ...prev, status: event.target.value }))
                }
              >
                <option value="active">Active</option>
                <option value="on-hold">On hold</option>
                <option value="completed">Completed</option>
                <option value="stopped">Stopped</option>
              </select>
            </label>
            <label>
              Reason
              <input
                value={medicationForm.reason}
                onChange={(event) =>
                  setMedicationForm((prev) => ({ ...prev, reason: event.target.value }))
                }
              />
            </label>
            <label className="label-span-2">
              Dosage instructions
              <textarea
                rows="2"
                value={medicationForm.dosage}
                onChange={(event) =>
                  setMedicationForm((prev) => ({ ...prev, dosage: event.target.value }))
                }
              />
            </label>
            <button type="submit" className="button" disabled={loading}>
              {loading ? "Saving..." : "Add medication"}
            </button>
          </form>

          <form className="card form-grid two-columns" onSubmit={onCreateEncounter}>
            <h2>Document encounter</h2>
            <label>
              Encounter status
              <select
                value={encounterForm.status}
                onChange={(event) =>
                  setEncounterForm((prev) => ({ ...prev, status: event.target.value }))
                }
              >
                <option value="planned">Planned</option>
                <option value="arrived">Arrived</option>
                <option value="in-progress">In progress</option>
                <option value="finished">Finished</option>
              </select>
            </label>
            <label>
              Class code
              <input
                value={encounterForm.classCode}
                onChange={(event) =>
                  setEncounterForm((prev) => ({ ...prev, classCode: event.target.value }))
                }
              />
            </label>
            <label>
              Type code
              <input
                value={encounterForm.typeCode}
                onChange={(event) =>
                  setEncounterForm((prev) => ({ ...prev, typeCode: event.target.value }))
                }
              />
            </label>
            <label>
              Type display
              <input
                value={encounterForm.typeDisplay}
                onChange={(event) =>
                  setEncounterForm((prev) => ({ ...prev, typeDisplay: event.target.value }))
                }
              />
            </label>
            <label>
              Reason
              <input
                value={encounterForm.reason}
                onChange={(event) =>
                  setEncounterForm((prev) => ({ ...prev, reason: event.target.value }))
                }
              />
            </label>
            <label>
              Location
              <input
                value={encounterForm.location}
                onChange={(event) =>
                  setEncounterForm((prev) => ({ ...prev, location: event.target.value }))
                }
              />
            </label>
            <label>
              Service provider
              <input
                value={encounterForm.serviceProvider}
                onChange={(event) =>
                  setEncounterForm((prev) => ({ ...prev, serviceProvider: event.target.value }))
                }
              />
            </label>
            <label className="label-span-2">
              Note
              <textarea
                rows="2"
                value={encounterForm.note}
                onChange={(event) =>
                  setEncounterForm((prev) => ({ ...prev, note: event.target.value }))
                }
              />
            </label>
            <button type="submit" className="button" disabled={loading}>
              {loading ? "Saving..." : "Add encounter"}
            </button>
          </form>

          <form className="card form-grid two-columns" onSubmit={onCreateObservation}>
            <h2>Add observation</h2>
            <label>
              LOINC code
              <input
                value={observationForm.code}
                onChange={(event) =>
                  setObservationForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Display
              <input
                value={observationForm.display}
                onChange={(event) =>
                  setObservationForm((prev) => ({ ...prev, display: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Numeric value
              <input
                type="number"
                step="0.01"
                value={observationForm.value}
                onChange={(event) =>
                  setObservationForm((prev) => ({ ...prev, value: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Unit
              <input
                value={observationForm.unit}
                onChange={(event) =>
                  setObservationForm((prev) => ({ ...prev, unit: event.target.value }))
                }
                required
              />
            </label>
            <label className="label-span-2">
              Note
              <textarea
                rows="2"
                value={observationForm.note}
                onChange={(event) =>
                  setObservationForm((prev) => ({ ...prev, note: event.target.value }))
                }
              />
            </label>
            <button type="submit" className="button" disabled={loading}>
              {loading ? "Saving..." : "Add observation"}
            </button>
          </form>

          <form className="card form-grid two-columns" onSubmit={onCreateAppointment}>
            <h2>Schedule follow-up</h2>
            <label>
              Date
              <input
                type="date"
                value={appointmentForm.appointmentDate}
                onChange={(event) =>
                  setAppointmentForm((prev) => ({ ...prev, appointmentDate: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Practitioner
              <select
                value={appointmentForm.practitionerId}
                onChange={(event) =>
                  setAppointmentForm((prev) => ({ ...prev, practitionerId: event.target.value }))
                }
                disabled={user.role === "practitioner"}
                required
              >
                {availablePractitioners.map((practitioner) => (
                  <option key={practitioner.id} value={practitioner.id}>
                    {practitioner.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Service category
              <select
                value={appointmentForm.serviceCategory}
                onChange={(event) =>
                  setAppointmentForm((prev) => ({ ...prev, serviceCategory: event.target.value }))
                }
                required
              >
                {SERVICE_CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Slot
              <select
                value={appointmentForm.slotValue}
                onChange={(event) =>
                  setAppointmentForm((prev) => ({ ...prev, slotValue: event.target.value }))
                }
                required
              >
                <option value="" disabled>Choose a slot</option>
                {slotOptions.map((slot) => (
                  <option key={slot.value} value={slot.value} disabled={slot.unavailable}>
                    {slot.label}
                    {slot.unavailable ? " (Unavailable)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <input
                value={appointmentForm.reason}
                onChange={(event) =>
                  setAppointmentForm((prev) => ({ ...prev, reason: event.target.value }))
                }
              />
            </label>
            <label>
              Description
              <input
                value={appointmentForm.description}
                onChange={(event) =>
                  setAppointmentForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </label>
            <label className="label-span-2">
              Comment
              <textarea
                rows="2"
                value={appointmentForm.comment}
                onChange={(event) =>
                  setAppointmentForm((prev) => ({ ...prev, comment: event.target.value }))
                }
              />
            </label>
            {availablePractitioners.length === 0 ? (
              <p className="banner banner-error label-span-2">
                No practitioners are available for the selected date.
              </p>
            ) : null}
            {!isBookableDateInput(appointmentForm.appointmentDate) ? (
              <p className="banner banner-error label-span-2">
                Slots are available Monday-Saturday only.
              </p>
            ) : null}
            <button
              type="submit"
              className="button"
              disabled={
                loading ||
                !appointmentForm.appointmentDate ||
                !appointmentForm.slotValue ||
                !appointmentForm.practitionerId ||
                availablePractitioners.length === 0 ||
                !isBookableDateInput(appointmentForm.appointmentDate)
              }
            >
              {loading ? "Saving..." : "Schedule appointment"}
            </button>
          </form>

          <form className="card form-grid two-columns" onSubmit={onCreateTask}>
            <h2>Create care task</h2>
            <label>
              Assignee
              <select
                value={user.role === "practitioner" ? user.id : taskForm.ownerId}
                onChange={(event) =>
                  setTaskForm((prev) => ({ ...prev, ownerId: event.target.value }))
                }
                disabled={user.role === "practitioner"}
              >
                {user.role === "admin" ? <option value="">Unassigned</option> : null}
                {taskOwnerOptions.map((practitioner) => (
                  <option key={practitioner.id} value={practitioner.id}>
                    {practitioner.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={taskForm.priority}
                onChange={(event) =>
                  setTaskForm((prev) => ({ ...prev, priority: event.target.value }))
                }
              >
                <option value="routine">routine</option>
                <option value="urgent">urgent</option>
                <option value="asap">asap</option>
                <option value="stat">stat</option>
              </select>
            </label>
            <label>
              Category
              <select
                value={taskForm.category}
                onChange={(event) =>
                  setTaskForm((prev) => ({ ...prev, category: event.target.value }))
                }
              >
                <option value="Care coordination">Care coordination</option>
                <option value="Medication reconciliation">Medication reconciliation</option>
                <option value="Lab follow-up">Lab follow-up</option>
                <option value="Preventive screening">Preventive screening</option>
              </select>
            </label>
            <label>
              Due date
              <input
                type="date"
                value={taskForm.dueDate}
                onChange={(event) =>
                  setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))
                }
              />
            </label>
            <label className="label-span-2">
              Task summary
              <input
                value={taskForm.description}
                onChange={(event) =>
                  setTaskForm((prev) => ({ ...prev, description: event.target.value }))
                }
                required
              />
            </label>
            <label className="label-span-2">
              Note
              <textarea
                rows="2"
                value={taskForm.note}
                onChange={(event) =>
                  setTaskForm((prev) => ({ ...prev, note: event.target.value }))
                }
              />
            </label>
            <button type="submit" className="button" disabled={loading}>
              {loading ? "Saving..." : "Create care task"}
            </button>
          </form>
        </>
      ) : null}

      <article className="card">
        <h2>Problem list</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Recorded</th>
                <th>Code</th>
                <th>Description</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {chart.conditions.map((condition) => (
                <tr key={condition.id}>
                  <td>{formatDateTime(condition.recordedDate)}</td>
                  <td>{pickCodingCode(condition)}</td>
                  <td>{pickCodingDisplay(condition)}</td>
                  <td>{condition.clinicalStatus?.coding?.[0]?.code || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2>Allergies</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Recorded</th>
                <th>Substance</th>
                <th>Category</th>
                <th>Criticality</th>
                <th>Reaction</th>
              </tr>
            </thead>
            <tbody>
              {chart.allergies.map((allergy) => (
                <tr key={allergy.id}>
                  <td>{formatDateTime(allergy.recordedDate)}</td>
                  <td>{pickCodingDisplay(allergy)}</td>
                  <td>{(allergy.category || []).join(", ") || "-"}</td>
                  <td>{allergy.criticality || "-"}</td>
                  <td>
                    {allergy.reaction?.[0]?.description ||
                      allergy.reaction?.[0]?.manifestation?.[0]?.text ||
                      "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2>Medications</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Authored</th>
                <th>Medication</th>
                <th>Status</th>
                <th>Dosage</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {chart.medications.map((medication) => (
                <tr key={medication.id}>
                  <td>{formatDateTime(medication.authoredOn)}</td>
                  <td>{medicationDisplay(medication)}</td>
                  <td>{medication.status || "-"}</td>
                  <td>{medication.dosageInstruction?.[0]?.text || "-"}</td>
                  <td>{reasonText(medication)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2>Encounters</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Start</th>
                <th>Status</th>
                <th>Type</th>
                <th>Location</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {chart.encounters.map((encounter) => (
                <tr key={encounter.id}>
                  <td>{formatDateTime(encounter.period?.start)}</td>
                  <td>{encounter.status || "-"}</td>
                  <td>
                    {encounter.type?.[0]?.coding?.[0]?.display ||
                      encounter.type?.[0]?.coding?.[0]?.code ||
                      "-"}
                  </td>
                  <td>{encounter.location?.[0]?.location?.display || "-"}</td>
                  <td>{reasonText(encounter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2>Observations</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Code</th>
                <th>Description</th>
                <th>Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {chart.observations.map((observation) => {
                const code = observation.code?.coding?.[0] || {};

                return (
                  <tr key={observation.id}>
                    <td>{formatDateTime(observation.effectiveDateTime)}</td>
                    <td>{code.code || "-"}</td>
                    <td>{code.display || "-"}</td>
                    <td>{observationValue(observation)}</td>
                    <td>{observation.status || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2>Care tasks</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Task</th>
                <th>Owner</th>
                <th>Priority</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {chart.tasks.map((task) => (
                <tr key={task.id}>
                  <td>{formatDateTime(task.authoredOn)}</td>
                  <td>
                    <p>{task.description || "-"}</p>
                    <p className="muted-text">{task.code?.text || "-"}</p>
                  </td>
                  <td>{task.owner?.display || "-"}</td>
                  <td>
                    <span className={`priority-chip priority-chip-${task.priority || "routine"}`}>
                      {task.priority || "routine"}
                    </span>
                  </td>
                  <td>
                    {formatDateTime(getTaskDueDate(task))}
                    {isTaskOverdue(task) ? <p className="status-text-overdue">Overdue</p> : null}
                  </td>
                  <td>
                    {canEdit(user.role) ? (
                      <select
                        value={task.status}
                        onChange={(event) => onUpdateTaskStatus(task, event.target.value)}
                        disabled={loading}
                      >
                        <option value="requested">requested</option>
                        <option value="accepted">accepted</option>
                        <option value="in-progress">in-progress</option>
                        <option value="on-hold">on-hold</option>
                        <option value="completed">completed</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                    ) : (
                      task.status || "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2>Appointments</h2>
        <p>
          <Link to="/schedule" className="inline-link">
            Open full scheduler
          </Link>
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Start</th>
                <th>End</th>
                <th>Practitioner</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {chart.appointments.map((appointment) => (
                <tr key={appointment.id}>
                  <td>{formatDateTime(appointment.start)}</td>
                  <td>{formatDateTime(appointment.end)}</td>
                  <td>{appointmentPractitioner(appointment)}</td>
                  <td>{appointment.status || "-"}</td>
                  <td>{reasonText(appointment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
};

export default PatientDetailPage;
