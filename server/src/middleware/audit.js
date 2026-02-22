import AuditLog from "../models/AuditLog.js";

const methodToAction = {
  GET: "read",
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete"
};

const parseRouteContext = (urlPath) => {
  const cleanPath = (urlPath || "").split("?")[0];
  const segments = cleanPath.split("/").filter(Boolean);

  if (segments.length < 2 || segments[0] !== "api") {
    return { resourceType: "Unknown", resourceId: undefined };
  }

  const resourceType = segments[2] || segments[1] || "Unknown";
  const resourceId = segments[3];

  return { resourceType, resourceId };
};

export const requestAuditTrail = (req, res, next) => {
  const watched = req.originalUrl.startsWith("/api/fhir") || req.originalUrl.startsWith("/api/admin");

  if (!watched) {
    return next();
  }

  res.on("finish", () => {
    const { resourceType, resourceId } = parseRouteContext(req.originalUrl);
    const outcome = res.statusCode >= 200 && res.statusCode < 400 ? "success" : "failure";

    AuditLog.create({
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      actorRole: req.user?.role,
      action: methodToAction[req.method] || "unknown",
      resourceType,
      resourceId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      outcome,
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    }).catch(() => {
      // Non-blocking by design to avoid impacting clinical workflows.
    });
  });

  return next();
};
