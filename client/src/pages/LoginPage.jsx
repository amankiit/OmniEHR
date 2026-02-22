import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const defaultLogin = { email: "", password: "" };
const defaultBootstrap = {
  fullName: "",
  email: "",
  organization: "",
  password: ""
};

const LoginPage = () => {
  const { isAuthenticated, login, bootstrapAdmin } = useAuth();
  const [loginForm, setLoginForm] = useState(defaultLogin);
  const [bootstrapForm, setBootstrapForm] = useState(defaultBootstrap);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const onLoginSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await login(loginForm);
    } catch (err) {
      setError(err.message || "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  const onBootstrapSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await bootstrapAdmin(bootstrapForm);
      setMessage("Bootstrap admin created. You are now signed in.");
    } catch (err) {
      setError(err.message || "Unable to bootstrap admin");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-layout">
      <section className="card">
        <h1>OmniEHR</h1>
        <p className="muted-text">FHIR R4 API with HIPAA-aligned security controls.</p>

        <form onSubmit={onLoginSubmit} className="form-grid">
          <label>
            Email
            <input
              type="email"
              value={loginForm.email}
              onChange={(event) =>
                setLoginForm((prev) => ({ ...prev, email: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) =>
                setLoginForm((prev) => ({ ...prev, password: event.target.value }))
              }
              required
            />
          </label>
          <button type="submit" className="button" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="muted-text">
          New patient?{" "}
          <Link to="/patient-register" className="inline-link">
            Register through patient portal
          </Link>
        </p>
      </section>

      <section className="card">
        <h2>First-time setup</h2>
        <p className="muted-text">
          Create the initial admin account when the system has no users.
        </p>
        <form onSubmit={onBootstrapSubmit} className="form-grid">
          <label>
            Full name
            <input
              value={bootstrapForm.fullName}
              onChange={(event) =>
                setBootstrapForm((prev) => ({ ...prev, fullName: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Organization
            <input
              value={bootstrapForm.organization}
              onChange={(event) =>
                setBootstrapForm((prev) => ({ ...prev, organization: event.target.value }))
              }
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={bootstrapForm.email}
              onChange={(event) =>
                setBootstrapForm((prev) => ({ ...prev, email: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={bootstrapForm.password}
              onChange={(event) =>
                setBootstrapForm((prev) => ({ ...prev, password: event.target.value }))
              }
              placeholder="At least 12 chars with upper/lower/number/symbol"
              required
            />
          </label>
          <button type="submit" className="button button-secondary" disabled={loading}>
            {loading ? "Provisioning..." : "Bootstrap admin"}
          </button>
        </form>
      </section>

      {error ? <p className="banner banner-error">{error}</p> : null}
      {message ? <p className="banner banner-success">{message}</p> : null}
    </div>
  );
};

export default LoginPage;
