import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi, fhirApi } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { bundleToResources } from "../utils/fhir.js";
import {
  buildPatientRiskProfile,
  calculateNoShowRate,
  extractPatientIdFromAppointment,
  extractPatientIdFromReference,
  groupByPatient,
  isTaskOpen,
  isTaskOverdue
} from "../utils/clinicalOps.js";

const DashboardPage = () => {
  const { token, user } = useAuth();
  const [stats, setStats] = useState({
    patientCount: 0,
    observationCount: 0,
    conditionCount: 0,
    allergyCount: 0,
    medicationCount: 0,
    encounterCount: 0,
    appointmentCount: 0,
    taskCount: 0,
    openTaskCount: 0,
    overdueTaskCount: 0,
    highRiskPatientCount: 0,
    openCareGapCount: 0,
    noShowRate: 0,
    capabilityVersion: "-",
    userCount: 0
  });
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [
          capability,
          patientBundle,
          observationBundle,
          conditionBundle,
          allergyBundle,
          medicationBundle,
          encounterBundle,
          appointmentBundle,
          taskBundle
        ] = await Promise.all([
          fhirApi.capability(token),
          fhirApi.listPatients(token),
          fhirApi.listObservations(token),
          fhirApi.listConditions(token),
          fhirApi.listAllergies(token),
          fhirApi.listMedicationRequests(token),
          fhirApi.listEncounters(token),
          fhirApi.listAppointments(token),
          fhirApi.listTasks(token)
        ]);

        const patients = bundleToResources(patientBundle);
        const observations = bundleToResources(observationBundle);
        const conditions = bundleToResources(conditionBundle);
        const allergies = bundleToResources(allergyBundle);
        const medications = bundleToResources(medicationBundle);
        const encounters = bundleToResources(encounterBundle);
        const appointments = bundleToResources(appointmentBundle);
        const tasks = bundleToResources(taskBundle);

        const conditionsByPatient = groupByPatient(
          conditions,
          (condition) => extractPatientIdFromReference(condition.subject?.reference)
        );
        const allergiesByPatient = groupByPatient(
          allergies,
          (allergy) => extractPatientIdFromReference(allergy.patient?.reference)
        );
        const medicationsByPatient = groupByPatient(
          medications,
          (medication) => extractPatientIdFromReference(medication.subject?.reference)
        );
        const observationsByPatient = groupByPatient(
          observations,
          (observation) => extractPatientIdFromReference(observation.subject?.reference)
        );
        const encountersByPatient = groupByPatient(
          encounters,
          (encounter) => extractPatientIdFromReference(encounter.subject?.reference)
        );
        const appointmentsByPatient = groupByPatient(
          appointments,
          (appointment) => extractPatientIdFromAppointment(appointment)
        );
        const tasksByPatient = groupByPatient(
          tasks,
          (task) => extractPatientIdFromReference(task.for?.reference)
        );

        const riskProfiles = patients.map((patient) =>
          buildPatientRiskProfile({
            conditions: conditionsByPatient.get(patient.id) || [],
            allergies: allergiesByPatient.get(patient.id) || [],
            medications: medicationsByPatient.get(patient.id) || [],
            observations: observationsByPatient.get(patient.id) || [],
            encounters: encountersByPatient.get(patient.id) || [],
            appointments: appointmentsByPatient.get(patient.id) || [],
            tasks: tasksByPatient.get(patient.id) || []
          })
        );

        const openTasks = tasks.filter(isTaskOpen);
        const overdueTasks = openTasks.filter((task) => isTaskOverdue(task));

        const next = {
          patientCount: patients.length,
          observationCount: observations.length,
          conditionCount: conditions.length,
          allergyCount: allergies.length,
          medicationCount: medications.length,
          encounterCount: encounters.length,
          appointmentCount: appointments.length,
          taskCount: tasks.length,
          openTaskCount: openTasks.length,
          overdueTaskCount: overdueTasks.length,
          highRiskPatientCount: riskProfiles.filter((profile) => profile.tier === "high").length,
          openCareGapCount: riskProfiles.reduce(
            (total, profile) => total + profile.careGaps.length,
            0
          ),
          noShowRate: calculateNoShowRate(appointments, 90),
          capabilityVersion: capability.fhirVersion,
          userCount: 0
        };

        if (user.role === "admin") {
          const users = await adminApi.listUsers(token);
          next.userCount = users.total;
        }

        setStats(next);
      } catch (err) {
        setError(err.message || "Unable to load dashboard metrics");
      }
    };

    load();
  }, [token, user.role]);

  const showCommandCenter = useMemo(
    () => user.role === "admin" || user.role === "practitioner",
    [user.role]
  );

  return (
    <section className="stack-gap">
      <h1>Clinical dashboard</h1>
      <p className="muted-text">
        Active role: <strong>{user.role}</strong>
      </p>

      {showCommandCenter ? (
        <p className="banner banner-success">
          Enterprise workflows are available in the{" "}
          <Link to="/command-center" className="inline-link">
            Command Center
          </Link>
          : risk tiers, care gaps, and team task orchestration.
        </p>
      ) : null}

      {error ? <p className="banner banner-error">{error}</p> : null}

      <div className="stats-grid">
        <article className="metric-card">
          <h2>Patients</h2>
          <p className="metric-value">{stats.patientCount}</p>
          <Link to="/patients" className="inline-link">
            Open patient registry
          </Link>
        </article>

        <article className="metric-card">
          <h2>Appointments</h2>
          <p className="metric-value">{stats.appointmentCount}</p>
          <Link to="/schedule" className="inline-link">
            Manage schedule
          </Link>
        </article>

        <article className="metric-card">
          <h2>Open tasks</h2>
          <p className="metric-value">{stats.openTaskCount}</p>
          <p className="muted-text">{stats.overdueTaskCount} overdue care tasks.</p>
        </article>

        <article className="metric-card">
          <h2>High-risk patients</h2>
          <p className="metric-value">{stats.highRiskPatientCount}</p>
          <p className="muted-text">{stats.openCareGapCount} open care gaps across cohorts.</p>
        </article>

        <article className="metric-card">
          <h2>No-show rate</h2>
          <p className="metric-value">{stats.noShowRate}%</p>
          <p className="muted-text">Trailing 90-day outpatient trend.</p>
        </article>

        <article className="metric-card">
          <h2>FHIR Version</h2>
          <p className="metric-value">{stats.capabilityVersion}</p>
          <p className="muted-text">Capability statement served from `/fhir/metadata`.</p>
        </article>

        <article className="metric-card">
          <h2>Conditions</h2>
          <p className="metric-value">{stats.conditionCount}</p>
          <p className="muted-text">Problem-list records in longitudinal charts.</p>
        </article>

        <article className="metric-card">
          <h2>Allergies</h2>
          <p className="metric-value">{stats.allergyCount}</p>
          <p className="muted-text">Safety records for allergy/intolerance management.</p>
        </article>

        <article className="metric-card">
          <h2>Medications</h2>
          <p className="metric-value">{stats.medicationCount}</p>
          <p className="muted-text">Medication orders with prescribing context.</p>
        </article>

        <article className="metric-card">
          <h2>Observations</h2>
          <p className="metric-value">{stats.observationCount}</p>
          <p className="muted-text">Vitals and clinical measurements on file.</p>
        </article>

        <article className="metric-card">
          <h2>Encounters</h2>
          <p className="metric-value">{stats.encounterCount}</p>
          <p className="muted-text">Completed and active visit documentation.</p>
        </article>

        <article className="metric-card">
          <h2>Total tasks</h2>
          <p className="metric-value">{stats.taskCount}</p>
          <p className="muted-text">Care-team workflow activities tracked as FHIR Task.</p>
        </article>

        {user.role === "admin" ? (
          <article className="metric-card">
            <h2>Users</h2>
            <p className="metric-value">{stats.userCount}</p>
            <Link to="/users" className="inline-link">
              Manage access controls
            </Link>
          </article>
        ) : null}
      </div>
    </section>
  );
};

export default DashboardPage;
