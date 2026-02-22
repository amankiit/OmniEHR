import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { fhirApi } from "../api.js";
import { formatDateTime } from "../utils/fhir.js";
import { useAuth } from "../context/AuthContext.jsx";

const APPOINTMENT_NOTIFICATION_LEAD_MS = 2 * 60 * 1000;
const APPOINTMENT_NOTIFICATION_LOOKAHEAD_MS = 30 * 60 * 1000;
const APPOINTMENT_NOTIFICATION_POLL_MS = 30 * 1000;
const STALE_NOTIFICATION_MS = 30 * 60 * 1000;

const linksByRole = {
  core: [
    { to: "/", label: "Dashboard", end: true },
    { to: "/patients", label: "Patients" },
    { to: "/schedule", label: "Schedule", badgeKey: "appointments" }
  ],
  admin: [{ to: "/users", label: "Users" }],
  compliance: [{ to: "/audit", label: "Audit Logs", roles: ["admin", "auditor"] }]
};

const navLinkClassName = ({ isActive }) =>
  isActive ? "sidebar-link sidebar-link-active" : "sidebar-link";

const toAppointmentResources = (bundle) => {
  if (!Array.isArray(bundle?.entry)) {
    return [];
  }

  return bundle.entry.map((entry) => entry.resource).filter(Boolean);
};

const extractPatientReference = (appointment) => {
  const participant = appointment.participant?.find((record) =>
    String(record.actor?.reference || "").startsWith("Patient/")
  );

  return participant?.actor?.reference || "Patient/Unknown";
};

const NavGroup = ({ title, links, onNavigate, unreadCount }) => {
  if (!links.length) {
    return null;
  }

  return (
    <section className="sidebar-group">
      <h2 className="sidebar-group-title">{title}</h2>
      <div className="sidebar-group-links">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={navLinkClassName}
            onClick={onNavigate}
          >
            <span>{link.label}</span>
            {link.badgeKey === "appointments" && unreadCount > 0 ? (
              <span className="inline-notification-badge">{unreadCount}</span>
            ) : null}
          </NavLink>
        ))}
      </div>
    </section>
  );
};

const AlertsPanel = ({ notifications, onClear }) => {
  return (
    <section className="alerts-panel">
      <header className="alerts-panel-header">
        <h3>Upcoming Alerts</h3>
        <button type="button" className="alerts-clear-button" onClick={onClear}>
          Clear
        </button>
      </header>

      {notifications.length === 0 ? (
        <p className="alerts-empty">No upcoming appointment alerts.</p>
      ) : (
        <ul className="alerts-list">
          {notifications.map((notification) => (
            <li
              key={notification.key}
              className={notification.read ? "alerts-item" : "alerts-item alerts-item-unread"}
            >
              <p className="alerts-item-title">Appointment starts in 2 minutes</p>
              <p className="alerts-item-text">{notification.patientReference}</p>
              <p className="alerts-item-time">{formatDateTime(notification.startTime)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const NavBar = () => {
  const { user, token, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifiedKeysRef = useRef(new Set());

  useEffect(() => {
    setMenuOpen(false);
    setAlertsOpen(false);
  }, [location.pathname]);

  const adminLinks = useMemo(() => {
    if (user?.role !== "admin") {
      return [];
    }

    return linksByRole.admin;
  }, [user?.role]);

  const complianceLinks = useMemo(
    () =>
      linksByRole.compliance.filter((link) =>
        link.roles ? link.roles.includes(user?.role) : true
      ),
    [user?.role]
  );

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );

  const pollAppointmentNotifications = useCallback(async () => {
    if (user?.role !== "practitioner" || !token) {
      return;
    }

    const now = new Date();
    const windowEnd = new Date(now.getTime() + APPOINTMENT_NOTIFICATION_LOOKAHEAD_MS);

    const bundle = await fhirApi.listAppointments(token, {
      from: now.toISOString(),
      to: windowEnd.toISOString()
    });

    const appointments = toAppointmentResources(bundle);
    const newNotifications = [];

    appointments.forEach((appointment) => {
      const appointmentId = String(appointment.id || "").trim();
      const startTime = appointment.start;

      if (!appointmentId || !startTime) {
        return;
      }

      const startDate = new Date(startTime);
      if (Number.isNaN(startDate.getTime())) {
        return;
      }

      const msUntilStart = startDate.getTime() - now.getTime();

      if (msUntilStart < 0 || msUntilStart > APPOINTMENT_NOTIFICATION_LEAD_MS) {
        return;
      }

      const key = `${appointmentId}:${startDate.toISOString()}`;
      if (notifiedKeysRef.current.has(key)) {
        return;
      }

      notifiedKeysRef.current.add(key);
      newNotifications.push({
        key,
        appointmentId,
        startTime: startDate.toISOString(),
        patientReference: extractPatientReference(appointment),
        read: false
      });
    });

    if (newNotifications.length === 0) {
      return;
    }

    setNotifications((previous) => {
      const cutoff = now.getTime() - STALE_NOTIFICATION_MS;

      return [...newNotifications, ...previous]
        .filter((notification) => {
          const time = new Date(notification.startTime).getTime();
          return !Number.isNaN(time) && time >= cutoff;
        })
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
        .slice(0, 30);
    });
  }, [token, user?.role]);

  useEffect(() => {
    if (user?.role !== "practitioner" || !token) {
      setNotifications([]);
      setAlertsOpen(false);
      notifiedKeysRef.current.clear();
      return;
    }

    pollAppointmentNotifications().catch(() => {
      // Non-blocking: UI should remain usable even if poll fails.
    });

    const timer = setInterval(() => {
      pollAppointmentNotifications().catch(() => {
        // Ignore intermittent poll failures.
      });
    }, APPOINTMENT_NOTIFICATION_POLL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [pollAppointmentNotifications, token, user?.role]);

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const onLogout = () => {
    closeMenu();
    setAlertsOpen(false);
    logout();
  };

  const toggleAlerts = () => {
    setAlertsOpen((current) => {
      const next = !current;
      if (next) {
        setNotifications((previous) =>
          previous.map((notification) => ({ ...notification, read: true }))
        );
      }
      return next;
    });
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  return (
    <>
      <header className="mobile-bar">
        <Link to="/" className="mobile-brand">
          OmniEHR
        </Link>
        <div className="mobile-bar-actions">
          <button type="button" className="mobile-alert-button" onClick={toggleAlerts}>
            Alerts
            {unreadCount > 0 ? <span className="notification-badge">{unreadCount}</span> : null}
          </button>
          <button
            type="button"
            className="mobile-menu-button"
            onClick={() => setMenuOpen((current) => !current)}
            aria-expanded={menuOpen}
            aria-controls="sidebar-nav"
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>
      </header>

      {alertsOpen ? (
        <div className="mobile-alert-popover">
          <AlertsPanel notifications={notifications} onClear={clearNotifications} />
        </div>
      ) : null}

      <aside id="sidebar-nav" className={menuOpen ? "sidebar sidebar-open" : "sidebar"}>
        <div className="sidebar-top">
          <Link to="/" className="sidebar-brand" onClick={closeMenu}>
            <span className="sidebar-brand-mark">O</span>
            <div>
              <strong>OmniEHR</strong>
              <p>HIPAA & FHIR compliant</p>
            </div>
          </Link>
        </div>

        <div className="sidebar-content">
          <NavGroup
            title="Workspace"
            links={linksByRole.core}
            onNavigate={closeMenu}
            unreadCount={unreadCount}
          />
          <NavGroup
            title="Administration"
            links={adminLinks}
            onNavigate={closeMenu}
            unreadCount={unreadCount}
          />
          <NavGroup
            title="Compliance"
            links={complianceLinks}
            onNavigate={closeMenu}
            unreadCount={unreadCount}
          />
        </div>

        <div className="sidebar-footer">
          <button type="button" className="sidebar-alert-button" onClick={toggleAlerts}>
            <span>Notifications</span>
            {unreadCount > 0 ? <span className="notification-badge">{unreadCount}</span> : null}
          </button>

          {alertsOpen ? <AlertsPanel notifications={notifications} onClear={clearNotifications} /> : null}

          <div className="sidebar-user-card">
            <span className="role-badge">{user?.role}</span>
            <p className="sidebar-user-name">{user?.fullName}</p>
            <p className="sidebar-user-email">{user?.email}</p>
          </div>
          <button type="button" className="button button-secondary sidebar-logout" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <button
        type="button"
        className={menuOpen ? "sidebar-backdrop sidebar-backdrop-open" : "sidebar-backdrop"}
        onClick={closeMenu}
        aria-label="Close menu"
      />
    </>
  );
};

export default NavBar;
