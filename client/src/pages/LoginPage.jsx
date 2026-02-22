import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const defaultLogin = { email: "", password: "" };

const LoginPage = () => {
  const { isAuthenticated, login } = useAuth();
  const [loginForm, setLoginForm] = useState(defaultLogin);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const onLoginSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await login(loginForm);
    } catch (err) {
      setError(err.message || "Unable to sign in");
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

      {error ? <p className="banner banner-error">{error}</p> : null}
    </div>
  );
};

export default LoginPage;
