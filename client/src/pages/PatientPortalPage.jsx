import { useState } from "react";
import { Link } from "react-router-dom";
import { publicApi } from "../api.js";

const emptyForm = {
  givenName: "",
  familyName: "",
  birthDate: "",
  gender: "unknown",
  phone: "",
  email: "",
  line1: "",
  city: "",
  state: "",
  postalCode: ""
};

const PatientPortalPage = () => {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationResult, setRegistrationResult] = useState(null);

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await publicApi.registerPatient(form);
      setRegistrationResult(response);
      setForm(emptyForm);
    } catch (err) {
      setError(err.message || "Unable to complete registration");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-layout">
      <section className="card">
        <h1>Patient Portal Registration</h1>
        <p className="muted-text">
          Register as a new patient. A unique 7-digit PID is generated automatically.
        </p>

        <form className="form-grid two-columns" onSubmit={onSubmit}>
          <label>
            Given name
            <input
              value={form.givenName}
              onChange={(event) => setForm((prev) => ({ ...prev, givenName: event.target.value }))}
              required
            />
          </label>
          <label>
            Family name
            <input
              value={form.familyName}
              onChange={(event) => setForm((prev) => ({ ...prev, familyName: event.target.value }))}
              required
            />
          </label>
          <label>
            Birth date
            <input
              type="date"
              value={form.birthDate}
              onChange={(event) => setForm((prev) => ({ ...prev, birthDate: event.target.value }))}
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
            Phone
            <input
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </label>
          <label className="label-span-2">
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
              onChange={(event) => setForm((prev) => ({ ...prev, postalCode: event.target.value }))}
            />
          </label>

          <button type="submit" className="button" disabled={loading}>
            {loading ? "Registering..." : "Register as patient"}
          </button>
        </form>

        <p>
          <Link to="/login" className="inline-link">
            Back to staff sign in
          </Link>
        </p>
      </section>

      {error ? <p className="banner banner-error">{error}</p> : null}

      {registrationResult ? (
        <section className="card">
          <h2>Registration successful</h2>
          <p>
            Your Patient ID (PID): <strong>{registrationResult.pid}</strong>
          </p>
          <p className="muted-text">
            Keep this PID for future communication with your healthcare provider.
          </p>
        </section>
      ) : null}
    </div>
  );
};

export default PatientPortalPage;
