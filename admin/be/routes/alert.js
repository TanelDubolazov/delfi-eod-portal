import { Router } from "express";
import fs from "fs";
import path from "path";

export const alertRouter = Router();

function getConstsPath(baseDir) {
  return path.join(baseDir, "web", "src", "consts.ts");
}

function parseAlertFromConsts(text) {
  const activeMatch = text.match(/active:\s*(true|false)/);
  const messageMatch = text.match(/message:\s*"([^"]*)"/);
  if (!activeMatch || !messageMatch) return null;
  return {
    active: activeMatch[1] === "true",
    message: messageMatch[1],
  };
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
    const newText = text.replace(
      /active:\s*(true|false)/,
      `active: ${newActive}`,
    );
    await fs.promises.writeFile(constsPath, newText, "utf-8");
    res.json({ ...alert, active: newActive });
  } catch (err) {
    console.error("Error toggling alert:", err);
    res.status(500).json({ error: "Cannot toggle alert" });
  }
});
