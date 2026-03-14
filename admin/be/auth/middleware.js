export function requireAuth(req, res, next) {
  if (!req.session?.authenticated) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}
