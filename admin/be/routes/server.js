import { Router } from "express";
import SftpClient from "ssh2-sftp-client";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { updateCredentials } from "../auth/crypto.js";

export const serverRouter = Router();

let idSeq = 1;
function genId() {
  return Date.now().toString(36) + (idSeq++).toString(36);
}

function maskSecret(val) {
  if (!val || val.length < 6) return "••••••";
  return val.slice(0, 3) + "•".repeat(val.length - 6) + val.slice(-3);
}

// migrate old single-server format to array
function getServers(session) {
  const creds = session.serverCredentials || {};
  if (Array.isArray(creds.servers)) return creds.servers;
  if (creds.type) return [{ id: genId(), name: "Default", ...creds }];
  return [];
}

function saveServers(servers, session) {
  session.serverCredentials = { servers };
  updateCredentials({ servers }, session.encryptionKey);
}

serverRouter.get("/", (req, res) => {
  const servers = getServers(req.session);
  const masked = servers.map(s => {
    const m = { ...s };
    if (m.s3SecretKey) m.s3SecretKey = maskSecret(m.s3SecretKey);
    if (m.sftpPassword) m.sftpPassword = maskSecret(m.sftpPassword);
    return m;
  });
  res.json(masked);
});

serverRouter.put("/", (req, res) => {
  const { id, name, type, ...fields } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: "Name required" });
  if (!type || !["s3", "sftp"].includes(type)) {
    return res.status(400).json({ error: "Invalid connection type" });
  }

  if (type === "s3") {
    if (!fields.s3Endpoint || !fields.s3Bucket || !fields.s3AccessKey) {
      return res.status(400).json({ error: "Endpoint, bucket and access key required" });
    }
  } else if (!fields.sftpHost || !fields.sftpUsername) {
    return res.status(400).json({ error: "Host and username required" });
  }

  const servers = getServers(req.session);
  const server = { name: name.trim(), type };

  if (type === "s3") {
    Object.assign(server, {
      s3Endpoint: fields.s3Endpoint, s3Bucket: fields.s3Bucket,
      s3AccessKey: fields.s3AccessKey, s3SecretKey: fields.s3SecretKey,
      s3Region: fields.s3Region || "",
    });
  } else {
    Object.assign(server, {
      sftpHost: fields.sftpHost, sftpPort: fields.sftpPort || 22,
      sftpUsername: fields.sftpUsername, sftpPassword: fields.sftpPassword,
      sftpPath: fields.sftpPath || "/",
    });
  }

  if (id) {
    const idx = servers.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: "Server not found" });
    const existing = servers[idx];
    if (type === "s3" && !fields.s3SecretKey) server.s3SecretKey = existing.s3SecretKey;
    if (type === "sftp" && !fields.sftpPassword) server.sftpPassword = existing.sftpPassword;
    server.id = id;
    servers[idx] = server;
  } else {
    server.id = genId();
    servers.push(server);
  }

  try {
    saveServers(servers, req.session);
    res.json({ success: true, id: server.id });
  } catch (err) {
    res.status(500).json({ error: "Save failed" });
  }
});

serverRouter.delete("/:id", (req, res) => {
  const servers = getServers(req.session);
  const idx = servers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Server not found" });

  servers.splice(idx, 1);
  try {
    saveServers(servers, req.session);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Save failed" });
  }
});

serverRouter.post("/:id/test", async (req, res) => {
  const servers = getServers(req.session);
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const start = Date.now();

  try {
    if (server.type === "sftp") {
      const sftp = new SftpClient();
      await sftp.connect({
        host: server.sftpHost,
        port: server.sftpPort || 22,
        username: server.sftpUsername,
        password: server.sftpPassword,
        tryKeyboard: true,
        authHandler: ["password", "keyboard-interactive"],
        readyTimeout: 10000,
      });
      const list = await sftp.list(server.sftpPath || "/");
      await sftp.end();
      res.json({ success: true, ms: Date.now() - start, details: `${list.length} items in ${server.sftpPath || "/"}` });

    } else if (server.type === "s3") {
      const s3 = new S3Client({
        endpoint: server.s3Endpoint,
        region: server.s3Region || "us-east-1",
        credentials: {
          accessKeyId: server.s3AccessKey,
          secretAccessKey: server.s3SecretKey,
        },
      });
      await s3.send(new ListBucketsCommand({}));
      res.json({ success: true, ms: Date.now() - start, details: `Connected to ${server.s3Endpoint}` });
    }
  } catch (err) {
    const detail = err.code ? `[${err.code}] ${err.message}` : err.message;
    res.json({ success: false, ms: Date.now() - start, details: detail });
  }
});
