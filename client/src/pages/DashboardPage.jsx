import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi, fhirApi } from "../api.js";
import { bundleToResources } from "../utils/fhir.js";
import { useAuth } from "../context/AuthContext.jsx";

const DashboardPage = () => {
  const { token, user } = useAuth();
  const [stats, setStats] = useState({
    patientCount: 0,
    conditionCount: 0,
    allergyCount: 0,
    medicationCount: 0,
    encounterCount: 0,
    appointmentCount: 0,
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
          conditionBundle,
          allergyBundle,
          medicationBundle,
          encounterBundle,
          appointmentBundle
        ] = await Promise.all([
          fhirApi.capability(token),
          fhirApi.listPatients(token),
          fhirApi.listConditions(token),
          fhirApi.listAllergies(token),
          fhirApi.listMedicationRequests(token),
          fhirApi.listEncounters(token),
          fhirApi.listAppointments(token)
        ]);

        const next = {
          patientCount: bundleToResources(patientBundle).length,
          conditionCount: bundleToResources(conditionBundle).length,
          allergyCount: bundleToResources(allergyBundle).length,
          medicationCount: bundleToResources(medicationBundle).length,
          encounterCount: bundleToResources(encounterBundle).length,
          appointmentCount: bundleToResources(appointmentBundle).length,
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

  return (
    <section className="stack-gap">
      <h1>Clinical dashboard</h1>
      <p className="muted-text">
        Active role: <strong>{user.role}</strong>
      </p>

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
          <h2>Conditions</h2>
          <p className="metric-value">{stats.conditionCount}</p>
          <p className="muted-text">Active and historical problem-list entries.</p>
        </article>

        <article className="metric-card">
          <h2>Allergies</h2>
          <p className="metric-value">{stats.allergyCount}</p>
          <p className="muted-text">Allergy/intolerance safety records.</p>
        </article>

        <article className="metric-card">
          <h2>Medications</h2>
          <p className="metric-value">{stats.medicationCount}</p>
          <p className="muted-text">Medication requests and active orders.</p>
        </article>

        <article className="metric-card">
          <h2>Encounters</h2>
          <p className="metric-value">{stats.encounterCount}</p>
          <p className="muted-text">Visit documentation across care settings.</p>
        </article>

        <article className="metric-card">
          <h2>Appointments</h2>
          <p className="metric-value">{stats.appointmentCount}</p>
          <Link to="/schedule" className="inline-link">
            Manage schedule
          </Link>
        </article>

        <article className="metric-card">
          <h2>FHIR Version</h2>
          <p className="metric-value">{stats.capabilityVersion}</p>
          <p className="muted-text">Capability statement served from `/fhir/metadata`.</p>
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
