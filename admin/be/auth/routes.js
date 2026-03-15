import { Router } from "express";
import {
  isSetupComplete,
  setup,
  verifyPassword,
  decryptCredentials,
} from "./crypto.js";

export const authRouter = Router();

authRouter.get("/status", (req, res) => {
  const setupDone = isSetupComplete();
  res.json({
    setupRequired: !setupDone,
    authenticated: !!req.session?.authenticated,
  });
});

authRouter.post("/setup", async (req, res) => {
  if (isSetupComplete()) {
    return res.status(400).json({ error: "Already configured" });
  }

  const { password, credentials } = req.body;
  if (!password || password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters" });
  }

  try {
    const serverCreds = credentials || {};
    const decrypted = await setup(password, serverCreds);

    req.session.authenticated = true;
    req.session.serverCredentials = decrypted;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Setup failed" });
  }
});

authRouter.post("/login", async (req, res) => {
  if (!isSetupComplete()) {
    return res.status(400).json({ error: "Setup required" });
  }

  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Password required" });
  }

  const valid = await verifyPassword(password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const decrypted = await decryptCredentials(password);
  if (!decrypted) {
    return res.status(500).json({ error: "Failed to decrypt credentials" });
  }

  req.session.authenticated = true;
  req.session.serverCredentials = decrypted;
  res.json({ success: true });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("eod.sid");
    res.json({ success: true });
  });
});
