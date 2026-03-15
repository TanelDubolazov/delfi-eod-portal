import crypto from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

const SCRYPT_KEYLEN = 32;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };
const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_LENGTH = 16;

let configPath;
let credentialsPath;

export function initAuth(baseDir) {
  const adminDir = path.join(baseDir, ".admin");
  if (!fs.existsSync(adminDir)) fs.mkdirSync(adminDir, { recursive: true });
  configPath = path.join(adminDir, "config.json");
  credentialsPath = path.join(adminDir, "credentials.enc");
}

export function isSetupComplete() {
  return fs.existsSync(configPath) && fs.existsSync(credentialsPath);
}

function readConfig() {
  if (!fs.existsSync(configPath)) return null;
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

function writeConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

function deriveKey(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      SCRYPT_OPTIONS,
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      },
    );
  });
}

function encrypt(data, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return { iv: iv.toString("hex"), authTag: authTag.toString("hex"), encrypted };
}

function decrypt(encryptedBuf, key, ivHex, authTagHex) {
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encryptedBuf),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf-8"));
}

export async function setup(password, serverCredentials) {
  const salt = crypto.randomBytes(32).toString("hex");
  const passwordHash = await bcrypt.hash(password, 12);
  const key = await deriveKey(password, salt);

  const { iv, authTag, encrypted } = encrypt(serverCredentials, key);

  writeConfig({ passwordHash, salt, iv, authTag, createdAt: new Date().toISOString() });
  fs.writeFileSync(credentialsPath, encrypted);

  return serverCredentials;
}

export async function verifyPassword(password) {
  const config = readConfig();
  if (!config) return false;
  return bcrypt.compare(password, config.passwordHash);
}

export async function decryptCredentials(password) {
  const config = readConfig();
  if (!config) return null;

  const key = await deriveKey(password, config.salt);
  const encryptedBuf = fs.readFileSync(credentialsPath);

  try {
    return decrypt(encryptedBuf, key, config.iv, config.authTag);
  } catch {
    return null;
  }
}
