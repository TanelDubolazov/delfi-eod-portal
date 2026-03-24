export function requireAuth(req, res, next) {
  if (!req.session?.authenticated) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

const CSRF_HEADER_NAME = "x-eod-requested-by";
const CSRF_HEADER_VALUE = "delfi-eod-admin";
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requireStateChangingRequestHeader(req, res, next) {
  if (!req.path.startsWith("/api/") || !STATE_CHANGING_METHODS.has(req.method)) {
    next();
    return;
  }

  const headerValue = req.get(CSRF_HEADER_NAME);
  if (headerValue !== CSRF_HEADER_VALUE) {
    res.status(403).json({ error: "Invalid state-changing request header" });
    return;
  }

  next();
}
