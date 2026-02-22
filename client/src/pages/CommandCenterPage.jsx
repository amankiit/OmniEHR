import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi, fhirApi } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  bundleToResources,
  formatDateTime,
  patientFullName,
  patientIdentifier
} from "../utils/fhir.js";
import {
  buildPatientRiskProfile,
  calculateNoShowRate,
  calculateServiceMix,
  extractPatientIdFromAppointment,
  extractPatientIdFromReference,
  getTaskDueDate,
  groupByPatient,
  isTaskOpen,
  isTaskOverdue
} from "../utils/clinicalOps.js";

const TASK_STATUS_OPTIONS = [
  "requested",
  "accepted",
  "in-progress",
  "on-hold",
  "completed",
  "cancelled"
];

const TASK_PRIORITY_OPTIONS = ["routine", "urgent", "asap", "stat"];

const TASK_CATEGORY_OPTIONS = [
  "Care coordination",
  "Medication reconciliation",
  "Lab follow-up",
  "Preventive screening",
  "Discharge outreach",
  "Referral management"
];

const emptyTaskForm = {
  patientId: "",
  ownerId: "",
  priority: "routine",
  category: "Care coordination",
  dueDate: "",
  description: "",
  note: ""
};

const normalize = (value) => String(value || "").toLowerCase();

const sortByDateAsc = (left, right) => {
  const dateA = new Date(left);
  const dateB = new Date(right);
  return (dateA.getTime() || 0) - (dateB.getTime() || 0);
};

const buildPatientLabel = (patient) => `${patientFullName(patient)} (${patientIdentifier(patient)})`;

const ownerReference = (task) => task?.owner?.reference || "";

const CommandCenterPage = () => {
  const { token, user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [allergies, setAllergies] = useState([]);
  const [medications, setMedications] = useState([]);
  const [observations, setObservations] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [practitioners, setPractitioners] = useState([]);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [riskFilter, setRiskFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState("");
  const [error, setError] = useState("");

  const loadData = async () => {
    const [
      patientBundle,
      conditionBundle,
      allergyBundle,
      medicationBundle,
      observationBundle,
      encounterBundle,
      appointmentBundle,
      taskBundle,
      practitionerResponse
    ] = await Promise.all([
      fhirApi.listPatients(token),
      fhirApi.listConditions(token),
      fhirApi.listAllergies(token),
      fhirApi.listMedicationRequests(token),
      fhirApi.listObservations(token),
      fhirApi.listEncounters(token),
      fhirApi.listAppointments(token),
      fhirApi.listTasks(token),
      adminApi.listPractitioners(token).catch(() => ({ data: [] }))
    ]);

    const patientRecords = bundleToResources(patientBundle);
    const practitionerRecords = practitionerResponse.data || [];

    setPatients(patientRecords);
    setConditions(bundleToResources(conditionBundle));
    setAllergies(bundleToResources(allergyBundle));
    setMedications(bundleToResources(medicationBundle));
    setObservations(bundleToResources(observationBundle));
    setEncounters(bundleToResources(encounterBundle));
    setAppointments(bundleToResources(appointmentBundle));
    setTasks(bundleToResources(taskBundle));
    setPractitioners(practitionerRecords);

    setTaskForm((previous) => {
      const defaultOwnerId =
        user.role === "practitioner"
          ? user.id
          : previous.ownerId || practitionerRecords[0]?.id || "";

      return {
        ...previous,
        patientId: previous.patientId || patientRecords[0]?.id || "",
        ownerId: defaultOwnerId
      };
    });
  };

  useEffect(() => {
    setLoading(true);
    setError("");

    loadData()
      .catch((err) => setError(err.message || "Unable to load command center"))
      .finally(() => setLoading(false));
  }, [token, user.id, user.role]);

  const patientById = useMemo(() => {
    const map = new Map();
    patients.forEach((patient) => map.set(patient.id, patient));
    return map;
  }, [patients]);

  const practitionerById = useMemo(() => {
    const map = new Map();
    practitioners.forEach((practitioner) => map.set(practitioner.id, practitioner));
    return map;
  }, [practitioners]);

  const conditionsByPatient = useMemo(
    () => groupByPatient(conditions, (condition) => extractPatientIdFromReference(condition.subject?.reference)),
    [conditions]
  );

  const allergiesByPatient = useMemo(
    () => groupByPatient(allergies, (allergy) => extractPatientIdFromReference(allergy.patient?.reference)),
    [allergies]
  );

  const medicationsByPatient = useMemo(
    () => groupByPatient(medications, (medication) => extractPatientIdFromReference(medication.subject?.reference)),
    [medications]
  );

  const observationsByPatient = useMemo(
    () => groupByPatient(observations, (observation) => extractPatientIdFromReference(observation.subject?.reference)),
    [observations]
  );

  const encountersByPatient = useMemo(
    () => groupByPatient(encounters, (encounter) => extractPatientIdFromReference(encounter.subject?.reference)),
    [encounters]
  );

  const appointmentsByPatient = useMemo(
    () => groupByPatient(appointments, (appointment) => extractPatientIdFromAppointment(appointment)),
    [appointments]
  );

  const tasksByPatient = useMemo(
    () => groupByPatient(tasks, (task) => extractPatientIdFromReference(task.for?.reference)),
    [tasks]
  );

  const patientRows = useMemo(() => {
    const now = new Date();

    return patients
      .map((patient) => {
        const patientId = patient.id;
        const patientConditions = conditionsByPatient.get(patientId) || [];
        const patientAllergies = allergiesByPatient.get(patientId) || [];
        const patientMedications = medicationsByPatient.get(patientId) || [];
        const patientObservations = observationsByPatient.get(patientId) || [];
        const patientEncounters = encountersByPatient.get(patientId) || [];
        const patientAppointments = appointmentsByPatient.get(patientId) || [];
        const patientTasks = tasksByPatient.get(patientId) || [];

        const profile = buildPatientRiskProfile({
          conditions: patientConditions,
          allergies: patientAllergies,
          medications: patientMedications,
          observations: patientObservations,
          encounters: patientEncounters,
          appointments: patientAppointments,
          tasks: patientTasks
        });

        const openTasks = patientTasks.filter(isTaskOpen);
        const overdueTasks = openTasks.filter((task) => isTaskOverdue(task, now));

        const nextAppointment = [...patientAppointments]
          .filter((appointment) => {
            const start = new Date(appointment.start);
            return !Number.isNaN(start.getTime()) && start >= now;
          })
          .sort((a, b) => sortByDateAsc(a.start, b.start))[0];

        const lastEncounter = [...patientEncounters].sort(
          (a, b) =>
            new Date(b.period?.start || 0).getTime() - new Date(a.period?.start || 0).getTime()
        )[0];

        return {
          patient,
          profile,
          openTaskCount: openTasks.length,
          overdueTaskCount: overdueTasks.length,
          nextAppointment,
          lastEncounter
        };
      })
      .sort((left, right) => {
        if (right.profile.score !== left.profile.score) {
          return right.profile.score - left.profile.score;
        }

        return right.overdueTaskCount - left.overdueTaskCount;
      });
  }, [
    allergiesByPatient,
    appointmentsByPatient,
    conditionsByPatient,
    encountersByPatient,
    medicationsByPatient,
    observationsByPatient,
    patients,
    tasksByPatient
  ]);

  const taskRows = useMemo(() => {
    return [...tasks].sort((left, right) => {
      const overdueLeft = isTaskOverdue(left) ? 1 : 0;
      const overdueRight = isTaskOverdue(right) ? 1 : 0;
      if (overdueLeft !== overdueRight) {
        return overdueRight - overdueLeft;
      }

      return sortByDateAsc(getTaskDueDate(left), getTaskDueDate(right));
    });
  }, [tasks]);

  const filteredPatientRows = useMemo(() => {
    return patientRows.filter((row) => {
      if (riskFilter !== "all" && row.profile.tier !== riskFilter) {
        return false;
      }

      if (ownerFilter === "all") {
        return true;
      }

      const patientTasks = tasksByPatient.get(row.patient.id) || [];
      const openTasks = patientTasks.filter(isTaskOpen);

      if (ownerFilter === "unassigned") {
        return openTasks.some((task) => !ownerReference(task));
      }

      return openTasks.some((task) => ownerReference(task) === `Practitioner/${ownerFilter}`);
    });
  }, [ownerFilter, patientRows, riskFilter, tasksByPatient]);

  const dashboardStats = useMemo(() => {
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const openTasks = tasks.filter(isTaskOpen);
    const overdueTasks = openTasks.filter((task) => isTaskOverdue(task, now));
    const highRiskPatients = patientRows.filter((row) => row.profile.tier === "high");
    const totalGaps = patientRows.reduce((sum, row) => sum + row.profile.careGaps.length, 0);
    const appointmentsNext24h = appointments.filter((appointment) => {
      const start = new Date(appointment.start);
      if (Number.isNaN(start.getTime())) {
        return false;
      }

      return start >= now && start <= next24h;
    });

    return {
      highRiskCount: highRiskPatients.length,
      openTaskCount: openTasks.length,
      overdueTaskCount: overdueTasks.length,
      totalGapCount: totalGaps,
      next24hAppointments: appointmentsNext24h.length,
      noShowRate: calculateNoShowRate(appointments, 90)
    };
  }, [appointments, patientRows, tasks]);

  const serviceMix = useMemo(() => {
    const rows = calculateServiceMix(appointments);
    const total = rows.reduce((sum, row) => sum + row.count, 0);

    return rows.slice(0, 8).map((row) => ({
      ...row,
      share: total ? Math.round((row.count / total) * 1000) / 10 : 0
    }));
  }, [appointments]);

  const onCreateTask = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const ownerId = user.role === "practitioner" ? user.id : taskForm.ownerId || "";
      const owner = practitionerById.get(ownerId);
      const dueIso = taskForm.dueDate
        ? new Date(`${taskForm.dueDate}T23:59:59`).toISOString()
        : undefined;

      await fhirApi.createTask(token, {
        resourceType: "Task",
        status: "requested",
        intent: "order",
        priority: taskForm.priority,
        code: taskForm.category ? { text: taskForm.category } : undefined,
        description: taskForm.description.trim(),
        for: {
          reference: `Patient/${taskForm.patientId}`
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

      setTaskForm((previous) => ({
        ...previous,
        description: "",
        note: "",
        dueDate: ""
      }));

      await loadData();
    } catch (err) {
      setError(err.message || "Unable to create care task");
    } finally {
      setSaving(false);
    }
  };

  const onUpdateTaskStatus = async (task, status) => {
    setUpdatingTaskId(task.id);
    setError("");

    try {
      await fhirApi.updateTask(token, task.id, {
        ...task,
        status
      });

      setTasks((previous) =>
        previous.map((record) => (record.id === task.id ? { ...record, status } : record))
      );
    } catch (err) {
      setError(err.message || "Unable to update task status");
    } finally {
      setUpdatingTaskId("");
    }
  };

  return (
    <section className="stack-gap">
      <h1>Clinical command center</h1>
      <p className="muted-text">
        Enterprise operations view for risk stratification, care gaps, and team task orchestration.
      </p>
      {error ? <p className="banner banner-error">{error}</p> : null}
      {loading ? <p>Loading command center...</p> : null}

      <div className="stats-grid">
        <article className="metric-card">
          <h2>High-risk patients</h2>
          <p className="metric-value">{dashboardStats.highRiskCount}</p>
          <p className="muted-text">Risk score 8+ from active alerts, gaps, and overdue tasks.</p>
        </article>
        <article className="metric-card">
          <h2>Open care tasks</h2>
          <p className="metric-value">{dashboardStats.openTaskCount}</p>
          <p className="muted-text">{dashboardStats.overdueTaskCount} overdue across all assignees.</p>
        </article>
        <article className="metric-card">
          <h2>Open care gaps</h2>
          <p className="metric-value">{dashboardStats.totalGapCount}</p>
          <p className="muted-text">Quality opportunities detected from longitudinal chart data.</p>
        </article>
        <article className="metric-card">
          <h2>Appointments (24h)</h2>
          <p className="metric-value">{dashboardStats.next24hAppointments}</p>
          <p className="muted-text">Upcoming scheduled visits in the next day.</p>
        </article>
        <article className="metric-card">
          <h2>No-show rate</h2>
          <p className="metric-value">{dashboardStats.noShowRate}%</p>
          <p className="muted-text">Trailing 90-day operational no-show trend.</p>
        </article>
      </div>

      <form className="card form-grid two-columns" onSubmit={onCreateTask}>
        <h2>Create care task</h2>
        <label>
          Patient
          <select
            value={taskForm.patientId}
            onChange={(event) =>
              setTaskForm((previous) => ({ ...previous, patientId: event.target.value }))
            }
            required
          >
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {buildPatientLabel(patient)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Assignee
          <select
            value={user.role === "practitioner" ? user.id : taskForm.ownerId}
            onChange={(event) =>
              setTaskForm((previous) => ({ ...previous, ownerId: event.target.value }))
            }
            disabled={user.role === "practitioner"}
          >
            {user.role === "admin" ? <option value="">Unassigned</option> : null}
            {practitioners.map((practitioner) => (
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
              setTaskForm((previous) => ({ ...previous, priority: event.target.value }))
            }
          >
            {TASK_PRIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label>
          Category
          <select
            value={taskForm.category}
            onChange={(event) =>
              setTaskForm((previous) => ({ ...previous, category: event.target.value }))
            }
          >
            {TASK_CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label>
          Due date
          <input
            type="date"
            value={taskForm.dueDate}
            onChange={(event) =>
              setTaskForm((previous) => ({ ...previous, dueDate: event.target.value }))
            }
          />
        </label>

        <label className="label-span-2">
          Task summary
          <input
            value={taskForm.description}
            onChange={(event) =>
              setTaskForm((previous) => ({ ...previous, description: event.target.value }))
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
              setTaskForm((previous) => ({ ...previous, note: event.target.value }))
            }
          />
        </label>

        <button type="submit" className="button" disabled={saving || !taskForm.patientId}>
          {saving ? "Saving..." : "Create task"}
        </button>
      </form>

      <article className="card form-grid two-columns">
        <h2>Population filters</h2>
        <label>
          Risk tier
          <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
            <option value="all">All tiers</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          Task owner
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
            <option value="all">All owners</option>
            <option value="unassigned">Unassigned</option>
            {practitioners.map((practitioner) => (
              <option key={practitioner.id} value={practitioner.id}>
                {practitioner.fullName}
              </option>
            ))}
          </select>
        </label>
      </article>

      <article className="card">
        <h2>Care coordination worklist</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Risk</th>
                <th>Alerts</th>
                <th>Care gaps</th>
                <th>Open tasks</th>
                <th>Next appointment</th>
                <th>Last encounter</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatientRows.map((row) => (
                <tr key={row.patient.id}>
                  <td>
                    <Link to={`/patients/${row.patient.id}`} className="inline-link">
                      {patientFullName(row.patient)}
                    </Link>
                    <p className="muted-text">{patientIdentifier(row.patient)}</p>
                  </td>
                  <td>
                    <span className={`risk-chip risk-chip-${row.profile.tier}`}>
                      {row.profile.tier} ({row.profile.score})
                    </span>
                  </td>
                  <td>{row.profile.safetyAlerts.length}</td>
                  <td>{row.profile.careGaps.length}</td>
                  <td>
                    {row.openTaskCount}
                    {row.overdueTaskCount > 0 ? (
                      <span className="inline-notification-badge">{row.overdueTaskCount}</span>
                    ) : null}
                  </td>
                  <td>{formatDateTime(row.nextAppointment?.start)}</td>
                  <td>{formatDateTime(row.lastEncounter?.period?.start)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2>Task inbox</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Patient</th>
                <th>Owner</th>
                <th>Priority</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {taskRows.map((task) => {
                const patientId = extractPatientIdFromReference(task.for?.reference);
                const patient = patientById.get(patientId);
                const dueDate = getTaskDueDate(task);
                const isOverdue = isTaskOverdue(task);
                const owner = task.owner?.display || practitionerById.get(ownerReference(task).split("/")[1])?.fullName || "-";

                return (
                  <tr key={task.id}>
                    <td>
                      <p>{task.description || "-"}</p>
                      {task.code?.text ? <p className="muted-text">{task.code.text}</p> : null}
                    </td>
                    <td>
                      {patient ? (
                        <Link to={`/patients/${patient.id}`} className="inline-link">
                          {patientFullName(patient)}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{owner}</td>
                    <td>
                      <span className={`priority-chip priority-chip-${normalize(task.priority)}`}>
                        {task.priority || "routine"}
                      </span>
                    </td>
                    <td>
                      {formatDateTime(dueDate)}
                      {isOverdue ? <p className="status-text-overdue">Overdue</p> : null}
                    </td>
                    <td>
                      <select
                        value={task.status}
                        onChange={(event) => onUpdateTaskStatus(task, event.target.value)}
                        disabled={updatingTaskId === task.id}
                      >
                        {TASK_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2>Service line demand</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Service category</th>
                <th>Volume</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {serviceMix.map((row) => (
                <tr key={row.service}>
                  <td>{row.service}</td>
                  <td>{row.count}</td>
                  <td>{row.share}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
};

export default CommandCenterPage;
