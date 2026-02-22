import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fhirApi } from "../api.js";
import {
  bundleToResources,
  patientContact,
  patientFullName,
  patientMrn,
  patientPid
} from "../utils/fhir.js";
import { useAuth } from "../context/AuthContext.jsx";

const emptyForm = {
  mrn: "",
  givenName: "",
  familyName: "",
  gender: "unknown",
  birthDate: "",
  phone: "",
  email: "",
  line1: "",
  city: "",
  state: "",
  postalCode: ""
};

const canCreatePatient = (role) => role === "admin";

const PatientsPage = () => {
  const { token, user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadPatients = async () => {
    const bundle = await fhirApi.listPatients(token);
    setPatients(bundleToResources(bundle));
  };

  useEffect(() => {
    loadPatients().catch((err) => setError(err.message || "Unable to load patients"));
  }, [token]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const telecom = [];
      if (form.phone) {
        telecom.push({ system: "phone", value: form.phone });
      }
      if (form.email) {
        telecom.push({ system: "email", value: form.email });
      }

      const address = form.line1 || form.city || form.state || form.postalCode
        ? [
            {
              line: form.line1 ? [form.line1] : [],
              city: form.city,
              state: form.state,
              postalCode: form.postalCode
            }
          ]
        : [];

      const resource = {
        resourceType: "Patient",
        active: true,
        identifier: form.mrn
          ? [
              {
                system: "urn:mrn",
                value: form.mrn
              }
            ]
          : undefined,
        name: [
          {
            family: form.familyName,
            given: form.givenName ? [form.givenName] : []
          }
        ],
        telecom,
        gender: form.gender,
        birthDate: form.birthDate || undefined,
        address
      };

      await fhirApi.createPatient(token, resource);
      setForm(emptyForm);
      await loadPatients();
    } catch (err) {
      setError(err.message || "Unable to create patient");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="stack-gap">
      <h1>Patients</h1>
      {error ? <p className="banner banner-error">{error}</p> : null}
      {user.role !== "admin" ? (
        <p className="muted-text">Patient creation is restricted to admin users.</p>
      ) : null}

      {canCreatePatient(user.role) ? (
        <form className="card form-grid two-columns" onSubmit={onSubmit}>
          <h2>New patient</h2>
          <label>
            MRN
            <input
              value={form.mrn}
              onChange={(event) => setForm((prev) => ({ ...prev, mrn: event.target.value }))}
            />
          </label>
          <label>
            Given name
            <input
              value={form.givenName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, givenName: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Family name
            <input
              value={form.familyName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, familyName: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Gender
            <select
              value={form.gender}
              onChange={(event) => setForm((prev) => ({ ...prev, gender: event.target.value }))}
            >
              <option value="unknown">Unknown</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Birth date
            <input
              type="date"
              value={form.birthDate}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, birthDate: event.target.value }))
              }
            />
          </label>
          <label>
            Phone
            <input
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </label>
          <label>
            Email
            <input
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </label>
          <label>
            Address line
            <input
              value={form.line1}
              onChange={(event) => setForm((prev) => ({ ...prev, line1: event.target.value }))}
            />
          </label>
          <label>
            City
            <input
              value={form.city}
              onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
            />
          </label>
          <label>
            State
            <input
              value={form.state}
              onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))}
            />
          </label>
          <label>
            Postal code
            <input
              value={form.postalCode}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, postalCode: event.target.value }))
              }
            />
          </label>
          <button type="submit" className="button" disabled={loading}>
            {loading ? "Saving..." : "Create patient"}
          </button>
        </form>
      ) : null}

      <section className="card">
        <h2>Patient registry</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>PID</th>
                <th>MRN</th>
                <th>Gender</th>
                <th>Birth Date</th>
                <th>Phone</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => {
                const contact = patientContact(patient);

                return (
                  <tr key={patient.id}>
                    <td>
                      <Link to={`/patients/${patient.id}`} className="inline-link">
                        {patientFullName(patient)}
                      </Link>
                    </td>
                    <td>{patientPid(patient)}</td>
                    <td>{patientMrn(patient)}</td>
                    <td>{patient.gender || "-"}</td>
                    <td>{patient.birthDate || "-"}</td>
                    <td>{contact.phone}</td>
                    <td>{contact.email}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
};

export default PatientsPage;
