import { Router } from "express";
import fs from "fs";
import path from "path";

export const alertRouter = Router();

function getConstsPath(baseDir) {
  return path.join(baseDir, "web", "src", "consts.ts");
}

function parseAlertFromConsts(text) {
  const activeMatch = text.match(/active:\s*(true|false)/);
  const messageMatch = text.match(/message:\s*("(?:\\.|[^"\\])*")/);
  if (!activeMatch || !messageMatch) return null;

  let message;
  try {
    message = JSON.parse(messageMatch[1]);
  } catch {
    message = "";
  }

  return {
    active: activeMatch[1] === "true",
    message,
  };
}

function updateAlertInConsts(text, updates) {
  let output = text;

  if (typeof updates.active === "boolean") {
    output = output.replace(/active:\s*(true|false)/, `active: ${updates.active}`);
  }

  if (typeof updates.message === "string") {
    const serialized = JSON.stringify(updates.message);
    output = output.replace(/message:\s*("(?:\\.|[^"\\])*")/, `message: ${serialized}`);
  }

  return output;
}

alertRouter.get("/", async (req, res) => {
  try {
    const constsPath = getConstsPath(req.app.get("BASE_DIR") || process.cwd());
    const text = await fs.promises.readFile(constsPath, "utf-8");
    const alert = parseAlertFromConsts(text);
    if (!alert) {
      return res.status(500).json({ error: "Alert not found in consts" });
    }
    res.json(alert);
  } catch (err) {
    console.error("Error reading alert:", err);
    res.status(500).json({ error: "Cannot read alert config" });
  }
});

alertRouter.post("/toggle", async (req, res) => {
  try {
    const constsPath = getConstsPath(req.app.get("BASE_DIR") || process.cwd());
    const text = await fs.promises.readFile(constsPath, "utf-8");
    const alert = parseAlertFromConsts(text);
    if (!alert) {
      return res.status(500).json({ error: "Alert not found in consts" });
    }
    const newActive = !alert.active;
    const newText = updateAlertInConsts(text, { active: newActive });
    await fs.promises.writeFile(constsPath, newText, "utf-8");
    res.json({ ...alert, active: newActive });
  } catch (err) {
    console.error("Error toggling alert:", err);
    res.status(500).json({ error: "Cannot toggle alert" });
  }
});

alertRouter.put("/", async (req, res) => {
  try {
    const { active, message } = req.body || {};

    if (typeof active !== "boolean" && typeof message !== "string") {
      return res.status(400).json({ error: "Provide 'active' and/or 'message'" });
    }

    if (typeof message === "string" && !message.trim()) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }

    const constsPath = getConstsPath(req.app.get("BASE_DIR") || process.cwd());
    const text = await fs.promises.readFile(constsPath, "utf-8");
    const alert = parseAlertFromConsts(text);
    if (!alert) {
      return res.status(500).json({ error: "Alert not found in consts" });
    }

    const updated = {
      active: typeof active === "boolean" ? active : alert.active,
      message: typeof message === "string" ? message.trim() : alert.message,
    };

    const newText = updateAlertInConsts(text, updated);
    await fs.promises.writeFile(constsPath, newText, "utf-8");
    res.json(updated);
  } catch (err) {
    console.error("Error updating alert:", err);
    res.status(500).json({ error: "Cannot update alert" });
  }
});
