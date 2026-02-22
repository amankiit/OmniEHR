import { useEffect, useState } from "react";
import { adminApi } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

const emptyForm = {
  fullName: "",
  email: "",
  organization: "",
  role: "practitioner",
  password: ""
};

const UsersPage = () => {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadUsers = async () => {
    const response = await adminApi.listUsers(token);
    setUsers(response.data || []);
  };

  useEffect(() => {
    loadUsers().catch((err) => setError(err.message || "Unable to load users"));
  }, [token]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await adminApi.createUser(token, form);
      setForm(emptyForm);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Unable to create user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="stack-gap">
      <h1>User access</h1>
      {error ? <p className="banner banner-error">{error}</p> : null}

      <form className="card form-grid two-columns" onSubmit={onSubmit}>
        <h2>Create user</h2>
        <label>
          Full name
          <input
            value={form.fullName}
            onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
            required
          />
        </label>
        <label>
          Organization
          <input
            value={form.organization}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, organization: event.target.value }))
            }
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            required
          />
        </label>
        <label>
          Role
          <select
            value={form.role}
            onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
          >
            <option value="practitioner">Practitioner</option>
            <option value="auditor">Auditor</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="label-span-2">
          Password
          <input
            type="password"
            placeholder="At least 12 chars with upper/lower/number/symbol"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            required
          />
        </label>
        <button type="submit" className="button" disabled={loading}>
          {loading ? "Saving..." : "Create user"}
        </button>
      </form>

      <article className="card">
        <h2>Provisioned users</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Organization</th>
                <th>Last Login</th>
              </tr>
            </thead>
            <tbody>
              {users.map((record) => (
                <tr key={record.id}>
                  <td>{record.fullName}</td>
                  <td>{record.email}</td>
                  <td>{record.role}</td>
                  <td>{record.organization || "-"}</td>
                  <td>{record.lastLoginAt || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
};

export default UsersPage;
