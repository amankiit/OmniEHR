import { Link, Outlet, useLocation } from "react-router-dom";
import { useMemo } from "react";
import NavBar from "./NavBar.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const knownLabels = {
  patients: "Patients",
  schedule: "Schedule",
  users: "Users",
  audit: "Audit Logs",
  login: "Sign In",
  "patient-register": "Patient Portal"
};

const toTitleCase = (value) => {
  if (!value) {
    return "";
  }

  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
};

const AppShell = () => {
  const location = useLocation();
  const { user } = useAuth();

  const breadcrumbs = useMemo(() => {
    const segments = location.pathname.split("/").filter(Boolean);

    if (!segments.length) {
      return [{ to: "/", label: "Dashboard", current: true }];
    }

    const items = [{ to: "/", label: "Dashboard", current: false }];
    let path = "";

    segments.forEach((segment, index) => {
      path += `/${segment}`;
      const isLast = index === segments.length - 1;

      const label =
        knownLabels[segment] ||
        (/^[a-fA-F0-9]{24}$/.test(segment) ? "Record" : toTitleCase(segment));

      items.push({
        to: path,
        label,
        current: isLast
      });
    });

    return items;
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <NavBar />

      <div className="workspace-main">
        <header className="workspace-header">
          <nav className="breadcrumb-nav" aria-label="Breadcrumb">
            {breadcrumbs.map((item, index) => (
              <span key={item.to} className="breadcrumb-item-wrap">
                {item.current ? (
                  <span className="breadcrumb-item breadcrumb-item-current">{item.label}</span>
                ) : (
                  <Link to={item.to} className="breadcrumb-item">
                    {item.label}
                  </Link>
                )}
                {index < breadcrumbs.length - 1 ? <span className="breadcrumb-sep">/</span> : null}
              </span>
            ))}
          </nav>

          <div className="workspace-actions">
            <Link to="/patients" className="workspace-chip-link">
              Registry
            </Link>
            <Link to="/schedule" className="workspace-chip-link">
              Schedule
            </Link>
            {user?.role === "admin" ? (
              <Link to="/users" className="workspace-chip-link">
                Access
              </Link>
            ) : null}
          </div>
        </header>

        <main className="page-shell" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppShell;
