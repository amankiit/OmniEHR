import { useEffect, useState } from "react";
import { adminApi } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

const AuditPage = () => {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(25);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const query = `?page=${page}&limit=${limit}`;
        const response = await adminApi.listAuditLogs(token, query);
        setRows(response.data || []);
        setTotal(response.total || 0);
        setLimit(response.limit || 25);
      } catch (err) {
        setError(err.message || "Unable to load audit logs");
      }
    };

    load();
  }, [page, limit, token]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <section className="stack-gap">
      <h1>Audit logs</h1>
      <p className="muted-text">
        HIPAA Security Rule audit trail of access and modification activity.
      </p>
      {error ? <p className="banner banner-error">{error}</p> : null}

      <article className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Role</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Status</th>
                <th>Outcome</th>
                <th>Path</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry._id}>
                  <td>{entry.createdAt}</td>
                  <td>{entry.actorEmail || "Unknown"}</td>
                  <td>{entry.actorRole || "-"}</td>
                  <td>{entry.action}</td>
                  <td>
                    {entry.resourceType}
                    {entry.resourceId ? `/${entry.resourceId}` : ""}
                  </td>
                  <td>{entry.statusCode}</td>
                  <td>{entry.outcome}</td>
                  <td>{entry.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      </article>
    </section>
  );
};

export default AuditPage;
