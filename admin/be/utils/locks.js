import SftpClient from "ssh2-sftp-client";
import * as ftp from "basic-ftp";
import { Readable, Writable } from "stream";
import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const LOCK_TTL_MS = 30 * 60 * 1000;
const LOCKS_DIR = ".locks";

function isMissingPathError(error) {
  const code = String(error?.code || error?.name || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();

  if (
    code === "ENOENT" ||
    code === "NOSUCHKEY" ||
    code === "NOTFOUND" ||
    code === "550"
  ) {
    return true;
  }

  return (
    message.includes("no such file") ||
    message.includes("not found") ||
    message.includes("does not exist")
  );
}

function getServers(session) {
  const creds = session?.serverCredentials || {};
  if (Array.isArray(creds.servers)) return creds.servers;
  if (creds.type) return [creds];
  return [];
}

function getPrimaryServer(session) {
  const servers = getServers(session);
  return servers[0] || null;
}

function lockFilename(slug) {
  return `${slug}.json`;
}

function toIso(timestampMs) {
  return new Date(timestampMs).toISOString();
}

function readBodyToString(body) {
  if (!body) return Promise.resolve("");
  if (typeof body === "string") return Promise.resolve(body);
  if (Buffer.isBuffer(body)) return Promise.resolve(body.toString("utf-8"));

  return new Promise((resolve, reject) => {
    let data = "";
    body.on("data", (chunk) => {
      data += chunk.toString("utf-8");
    });
    body.on("end", () => resolve(data));
    body.on("error", reject);
  });
}

function parseLockOrNull(raw) {
  if (!raw) return null;
  try {
    const lock = JSON.parse(raw);
    if (!lock?.slug || !lock?.token || !lock?.expiresAt) return null;
    return lock;
  } catch {
    return null;
  }
}

function isExpired(lock, nowMs = Date.now()) {
  if (!lock?.expiresAt) return true;
  const expiresMs = new Date(lock.expiresAt).getTime();
  if (Number.isNaN(expiresMs)) return true;
  return nowMs >= expiresMs;
}

function buildLockPayload(
  slug,
  installationId,
  token,
  nowMs = Date.now(),
  priorLock = null,
) {
  return {
    slug,
    installationId,
    token,
    acquiredAt:
      priorLock?.token === token && priorLock?.acquiredAt
        ? priorLock.acquiredAt
        : toIso(nowMs),
    heartbeatAt: toIso(nowMs),
    expiresAt: toIso(nowMs + LOCK_TTL_MS),
  };
}

function createS3Client(server) {
  return new S3Client({
    endpoint: server.s3Endpoint,
    region: server.s3Region || "us-east-1",
    credentials: {
      accessKeyId: server.s3AccessKey,
      secretAccessKey: server.s3SecretKey,
    },
  });
}

async function readRemoteLock(server, slug) {
  if (!server) return null;

  if (server.type === "sftp") {
    const sftp = new SftpClient();
    const basePath = server.sftpPath || "/";
    const lockDir = `${basePath.replace(/\/$/, "")}/${LOCKS_DIR}`;
    const lockPath = `${lockDir}/${lockFilename(slug)}`;

    try {
      await sftp.connect({
        host: server.sftpHost,
        port: server.sftpPort || 22,
        username: server.sftpUsername,
        password: server.sftpPassword,
        tryKeyboard: true,
        authHandler: ["password", "keyboard-interactive"],
        readyTimeout: 10000,
      });

      try {
        const exists = await sftp.exists(lockPath);
        if (!exists) return null;

        const raw = await sftp.get(lockPath);
        if (Buffer.isBuffer(raw)) return parseLockOrNull(raw.toString("utf-8"));
        if (typeof raw === "string") return parseLockOrNull(raw);
        return null;
      } catch (error) {
        if (isMissingPathError(error)) return null;
        throw error;
      }
    } finally {
      await sftp.end().catch(() => {});
    }
  }

  if (server.type === "s3") {
    const s3 = createS3Client(server);
    const key = `${LOCKS_DIR}/${lockFilename(slug)}`;
    try {
      const res = await s3.send(
        new GetObjectCommand({
          Bucket: server.s3Bucket,
          Key: key,
        }),
      );
      const raw = await readBodyToString(res.Body);
      return parseLockOrNull(raw);
    } catch (error) {
      if (isMissingPathError(error)) return null;
      throw error;
    }
  }

  if (server.type === "ftp" || server.type === "ftps") {
    const client = new ftp.Client();
    client.ftp.verbose = false;
    const basePath = server.ftpPath || "/";
    const lockDir = `${basePath.replace(/\/$/, "")}/${LOCKS_DIR}`;
    const lockPath = `${lockDir}/${lockFilename(slug)}`;

    try {
      await client.access({
        host: server.ftpHost,
        port: server.ftpPort || 21,
        user: server.ftpUsername,
        password: server.ftpPassword,
        secure: server.type === "ftps",
      });

      const chunks = [];
      const sink = new Writable({
        write(chunk, _enc, cb) {
          chunks.push(Buffer.from(chunk));
          cb();
        },
      });

      try {
        await client.downloadTo(sink, lockPath);
      } catch (error) {
        if (isMissingPathError(error)) return null;
        throw error;
      }

      const raw = Buffer.concat(chunks).toString("utf-8");
      return parseLockOrNull(raw);
    } finally {
      client.close();
    }
  }

  return null;
}

async function writeRemoteLock(server, slug, lockData) {
  if (!server) throw new Error("No server configured");
  const raw = JSON.stringify(lockData, null, 2);

  if (server.type === "sftp") {
    const sftp = new SftpClient();
    const basePath = server.sftpPath || "/";
    const lockDir = `${basePath.replace(/\/$/, "")}/${LOCKS_DIR}`;
    const lockPath = `${lockDir}/${lockFilename(slug)}`;

    try {
      await sftp.connect({
        host: server.sftpHost,
        port: server.sftpPort || 22,
        username: server.sftpUsername,
        password: server.sftpPassword,
        tryKeyboard: true,
        authHandler: ["password", "keyboard-interactive"],
        readyTimeout: 10000,
      });

      await sftp.mkdir(lockDir, true).catch(() => {});
      await sftp.put(Buffer.from(raw, "utf-8"), lockPath);
      return;
    } finally {
      await sftp.end().catch(() => {});
    }
  }

  if (server.type === "s3") {
    const s3 = createS3Client(server);
    const key = `${LOCKS_DIR}/${lockFilename(slug)}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: server.s3Bucket,
        Key: key,
        Body: raw,
        ContentType: "application/json",
      }),
    );
  }

  if (server.type === "ftp" || server.type === "ftps") {
    const client = new ftp.Client();
    client.ftp.verbose = false;
    const basePath = server.ftpPath || "/";
    const lockDir = `${basePath.replace(/\/$/, "")}/${LOCKS_DIR}`;
    const lockPath = `${lockDir}/${lockFilename(slug)}`;

    try {
      await client.access({
        host: server.ftpHost,
        port: server.ftpPort || 21,
        user: server.ftpUsername,
        password: server.ftpPassword,
        secure: server.type === "ftps",
      });

      await client.ensureDir(lockDir);
      await client.uploadFrom(Readable.from([raw]), lockPath);
      return;
    } finally {
      client.close();
    }
  }
}

async function deleteRemoteLock(server, slug) {
  if (!server) return;

  if (server.type === "sftp") {
    const sftp = new SftpClient();
    const basePath = server.sftpPath || "/";
    const lockPath = `${basePath.replace(/\/$/, "")}/${LOCKS_DIR}/${lockFilename(slug)}`;

    try {
      await sftp.connect({
        host: server.sftpHost,
        port: server.sftpPort || 22,
        username: server.sftpUsername,
        password: server.sftpPassword,
        tryKeyboard: true,
        authHandler: ["password", "keyboard-interactive"],
        readyTimeout: 10000,
      });
      const exists = await sftp.exists(lockPath);
      if (exists) await sftp.delete(lockPath);
      return;
    } finally {
      await sftp.end().catch(() => {});
    }
  }

  if (server.type === "s3") {
    const s3 = createS3Client(server);
    const key = `${LOCKS_DIR}/${lockFilename(slug)}`;
    await s3.send(
      new DeleteObjectCommand({
        Bucket: server.s3Bucket,
        Key: key,
      }),
    );
  }

  if (server.type === "ftp" || server.type === "ftps") {
    const client = new ftp.Client();
    client.ftp.verbose = false;
    const basePath = server.ftpPath || "/";
    const lockPath = `${basePath.replace(/\/$/, "")}/${LOCKS_DIR}/${lockFilename(slug)}`;

    try {
      await client.access({
        host: server.ftpHost,
        port: server.ftpPort || 21,
        user: server.ftpUsername,
        password: server.ftpPassword,
        secure: server.type === "ftps",
      });

      try {
        await client.remove(lockPath);
      } catch (error) {
        if (!isMissingPathError(error)) throw error;
      }
      return;
    } finally {
      client.close();
    }
  }
}

export async function getArticleLock(session, slug) {
  const server = getPrimaryServer(session);
  if (!server) {
    return {
      available: true,
      lock: null,
      disabled: true,
      reason: "No server configured",
    };
  }

  const lock = await readRemoteLock(server, slug);
  if (!lock) return { available: true, lock: null };
  if (isExpired(lock))
    return { available: true, lock: null, expiredLock: lock };
  return { available: true, lock };
}

export async function acquireArticleLock(session, slug, installationId, token) {
  const server = getPrimaryServer(session);
  if (!server) {
    return { ok: true, disabled: true, reason: "No server configured", lock: null };
  }

  const nowMs = Date.now();
  const current = await readRemoteLock(server, slug);
  if (
    current &&
    !isExpired(current, nowMs) &&
    current.token !== token &&
    current.installationId !== installationId
  ) {
    return { ok: false, reason: "locked", lock: current };
  }

  const payload = buildLockPayload(slug, installationId, token, nowMs, current);
  await writeRemoteLock(server, slug, payload);

  const confirmed = await readRemoteLock(server, slug);
  if (confirmed?.token === token) return { ok: true, lock: confirmed };

  return { ok: false, reason: "race", lock: confirmed || null };
}

export async function refreshArticleLock(session, slug, installationId, token) {
  const server = getPrimaryServer(session);
  if (!server) {
    return { ok: true, disabled: true, reason: "No server configured", lock: null };
  }

  const nowMs = Date.now();
  const current = await readRemoteLock(server, slug);
  if (!current || isExpired(current, nowMs)) {
    return { ok: false, reason: "missing" };
  }
  if (current.token !== token) {
    return { ok: false, reason: "locked", lock: current };
  }

  const payload = buildLockPayload(slug, installationId, token, nowMs, current);
  await writeRemoteLock(server, slug, payload);
  const confirmed = await readRemoteLock(server, slug);
  if (confirmed?.token === token) return { ok: true, lock: confirmed };

  return { ok: false, reason: "race", lock: confirmed || null };
}

export async function releaseArticleLock(session, slug, token) {
  const server = getPrimaryServer(session);
  if (!server) {
    return { ok: true };
  }

  const current = await readRemoteLock(server, slug);
  if (!current) return { ok: true };
  if (current.token !== token)
    return { ok: false, reason: "locked", lock: current };

  await deleteRemoteLock(server, slug);
  return { ok: true };
}

export async function validateArticleLock(session, slug, token) {
  const server = getPrimaryServer(session);
  if (!server) return { ok: true, disabled: true, reason: "No server configured" };

  if (!token) return { ok: false, reason: "missing" };

  const state = await getArticleLock(session, slug);
  if (!state.available)
    return { ok: false, reason: "unavailable", error: state.error };
  if (!state.lock) return { ok: false, reason: "missing" };
  if (state.lock.token !== token)
    return { ok: false, reason: "locked", lock: state.lock };

  return { ok: true, lock: state.lock };
}
