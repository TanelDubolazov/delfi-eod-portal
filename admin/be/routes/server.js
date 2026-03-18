import { Router } from "express";
import SftpClient from "ssh2-sftp-client";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { updateCredentials } from "../auth/crypto.js";

export const serverRouter = Router();

function maskSecret(val) {
  if (!val || val.length < 6) return "••••••";
  return val.slice(0, 3) + "•".repeat(val.length - 6) + val.slice(-3);
}

serverRouter.get("/", (req, res) => {
  const creds = req.session.serverCredentials || {};

  const masked = { ...creds };
  if (masked.s3SecretKey) masked.s3SecretKey = maskSecret(masked.s3SecretKey);
  if (masked.sftpPassword) masked.sftpPassword = maskSecret(masked.sftpPassword);

  res.json(masked);
});

serverRouter.put("/", (req, res) => {
  const { type, s3Endpoint, s3Bucket, s3AccessKey, s3SecretKey, s3Region,
          sftpHost, sftpPort, sftpUsername, sftpPassword, sftpPath } = req.body;

  if (!type || !["s3", "sftp"].includes(type)) {
    return res.status(400).json({ error: "Invalid connection type" });
  }

  const creds = { type };

  if (type === "s3") {
    if (!s3Endpoint || !s3Bucket || !s3AccessKey) {
      return res.status(400).json({ error: "Endpoint, bucket and access key required" });
    }
    Object.assign(creds, { s3Endpoint, s3Bucket, s3AccessKey, s3SecretKey, s3Region: s3Region || "" });
  } else {
    if (!sftpHost || !sftpUsername) {
      return res.status(400).json({ error: "Host and username required" });
    }
    Object.assign(creds, { sftpHost, sftpPort: sftpPort || 22, sftpUsername, sftpPassword, sftpPath: sftpPath || "/" });
  }

  try {
    const existing = req.session.serverCredentials || {};
    if (type === existing.type) {
      if (type === "s3" && !s3SecretKey) creds.s3SecretKey = existing.s3SecretKey;
      if (type === "sftp" && !sftpPassword) creds.sftpPassword = existing.sftpPassword;
    }
    updateCredentials(creds, req.session.encryptionKey);
    req.session.serverCredentials = creds;
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to save credentials:", err);
    res.status(500).json({ error: "Save failed" });
  }
});

serverRouter.post("/test", async (req, res) => {
  const creds = req.session.serverCredentials;
  if (!creds || !creds.type) {
    return res.status(400).json({ error: "No connection configured" });
  }

  const start = Date.now();

  try {
    if (creds.type === "sftp") {
      const sftp = new SftpClient();
      await sftp.connect({
        host: creds.sftpHost,
        port: creds.sftpPort || 22,
        username: creds.sftpUsername,
        password: creds.sftpPassword,
        tryKeyboard: true,
        authHandler: ["password", "keyboard-interactive"],
        readyTimeout: 10000,
      });
      const list = await sftp.list(creds.sftpPath || "/");
      await sftp.end();
      res.json({ success: true, ms: Date.now() - start, details: `${list.length} items in ${creds.sftpPath || "/"}` });

    } else if (creds.type === "s3") {
      const s3 = new S3Client({
        endpoint: creds.s3Endpoint,
        region: creds.s3Region || "us-east-1",
        credentials: {
          accessKeyId: creds.s3AccessKey,
          secretAccessKey: creds.s3SecretKey,
        },
      });
      await s3.send(new ListBucketsCommand({}));
      res.json({ success: true, ms: Date.now() - start, details: `Connected to ${creds.s3Endpoint}` });
    }
  } catch (err) {
    const detail = err.code ? `[${err.code}] ${err.message}` : err.message;
    res.json({ success: false, ms: Date.now() - start, details: detail });
  }
});
