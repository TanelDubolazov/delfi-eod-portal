import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import https from 'https';
import { createHash } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const nodeVersion = 'v24.14.0';
const nodeDistBaseUrl = `https://nodejs.org/dist/${nodeVersion}`;
const checksumCachePath = path.join(rootDir, 'binaries', `SHASUMS256-${nodeVersion}.txt`);
const usbRuntimeRoot = path.join(rootDir, 'usb-runtime');

const targets = [
  {
    id: 'win-x64',
    os: 'win32',
    cpu: 'x64',
    archiveName: `node-${nodeVersion}-win-x64.zip`,
    launcher: 'scripts/runtime/start.bat',
  },
  {
    id: 'macos-arm64',
    os: 'darwin',
    cpu: 'arm64',
    archiveName: `node-${nodeVersion}-darwin-arm64.tar.gz`,
    launcher: 'scripts/runtime/start.command',
  },
  {
    id: 'linux-x64',
    os: 'linux',
    cpu: 'x64',
    archiveName: `node-${nodeVersion}-linux-x64.tar.xz`,
    launcher: 'scripts/runtime/start.sh',
  },
];

function fileExists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`Failed to fetch ${url} (status ${res.statusCode || 'unknown'})`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

function downloadFile(url, destinationPath) {
  return new Promise((resolve, reject) => {
    const tmpPath = `${destinationPath}.part`;

    fs.rm(tmpPath, { force: true })
      .catch(() => {})
      .finally(() => {
        https.get(url, (res) => {
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`Failed to download ${url} (status ${res.statusCode || 'unknown'})`));
            return;
          }

          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', async () => {
            try {
              await fs.writeFile(tmpPath, Buffer.concat(chunks));
              await fs.rename(tmpPath, destinationPath);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        }).on('error', reject);
      });
  });
}

async function sha256File(filePath) {
  const content = await fs.readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function parseShasums(rawText) {
  const map = new Map();
  const lines = rawText.split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})\s+(.+)$/i);
    if (!match) continue;
    const [, hash, fileName] = match;
    map.set(fileName, hash.toLowerCase());
  }
  return map;
}

async function ensureNodeArchives() {
  await fs.mkdir(path.join(rootDir, 'binaries'), { recursive: true });

  let shasumsText = '';
  console.log(`\nResolving Node.js checksums for ${nodeVersion}...`);
  try {
    shasumsText = await fetchText(`${nodeDistBaseUrl}/SHASUMS256.txt`);
    await fs.writeFile(checksumCachePath, shasumsText, 'utf8');
    console.log('Using online checksums from nodejs.org');
  } catch {
    if (await fileExists(checksumCachePath)) {
      shasumsText = await fs.readFile(checksumCachePath, 'utf8');
      console.log(`Using cached checksums from ${path.relative(rootDir, checksumCachePath)}`);
    } else {
      throw new Error(
        `Could not fetch checksums and no local cache found at ${checksumCachePath}. Connect to internet once to prime cache.`,
      );
    }
  }

  const checksums = parseShasums(shasumsText);

  for (const target of targets) {
    const expectedHash = checksums.get(target.archiveName);
    if (!expectedHash) {
      throw new Error(`Missing checksum for ${target.archiveName} in SHASUMS256.txt`);
    }

    const archivePath = path.join(rootDir, 'binaries', target.archiveName);
    const archiveUrl = `${nodeDistBaseUrl}/${target.archiveName}`;

    if (!(await fileExists(archivePath))) {
      console.log(`Downloading ${target.archiveName}...`);
      await downloadFile(archiveUrl, archivePath);
    }

    let actualHash = await sha256File(archivePath);
    if (actualHash !== expectedHash) {
      console.log(`Checksum mismatch for ${target.archiveName}, re-downloading...`);
      await fs.rm(archivePath, { force: true });
      await downloadFile(archiveUrl, archivePath);
      actualHash = await sha256File(archivePath);
      if (actualHash !== expectedHash) {
        throw new Error(`Checksum verification failed for ${target.archiveName}`);
      }
    }
  }
}

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

async function ensureFileExists(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Required file is missing: ${filePath}`);
  }
}

async function copyDir(src, dest) {
  await fs.cp(src, dest, { recursive: true });
}

async function extractNodeArchive(archivePath, targetNodeDir) {
  const tempDir = path.join(path.dirname(targetNodeDir), '.node-extract');
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });

  if (archivePath.endsWith('.zip')) {
    run('unzip', ['-q', archivePath, '-d', tempDir], rootDir);
  } else {
    run('tar', ['-xf', archivePath, '-C', tempDir], rootDir);
  }

  const extracted = await fs.readdir(tempDir, { withFileTypes: true });
  const firstDir = extracted.find((entry) => entry.isDirectory());
  if (!firstDir) {
    throw new Error(`Could not locate extracted Node directory in ${tempDir}`);
  }

  await fs.mkdir(path.dirname(targetNodeDir), { recursive: true });
  await fs.rename(path.join(tempDir, firstDir.name), targetNodeDir);
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function makeExecutable(filePath) {
  await fs.chmod(filePath, 0o755);
}

async function buildAdminFrontend() {
  console.log('\nBuilding admin frontend dist...');
  const feDir = path.join(rootDir, 'admin', 'fe');
  run('npm', ['ci'], feDir);
  run('npm', ['run', 'build'], feDir);
}

async function buildWebStaticSite() {
  console.log('\nBuilding web static dist...');
  const webDir = path.join(rootDir, 'web');
  run('npm', ['ci'], webDir);
  run('npm', ['run', 'build'], webDir);
}

async function prepareTargetRuntime(target) {
  const runtimeRoot = path.join(usbRuntimeRoot, target.id);
  const archivePath = path.join(rootDir, 'binaries', target.archiveName);
  const launcherPath = path.join(rootDir, target.launcher);

  console.log(`\nPreparing ${target.id} runtime...`);

  await ensureFileExists(archivePath);
  await ensureFileExists(launcherPath);

  await fs.rm(runtimeRoot, { recursive: true, force: true });
  await fs.mkdir(runtimeRoot, { recursive: true });

  await copyDir(path.join(rootDir, 'admin', 'be'), path.join(runtimeRoot, 'admin', 'be'));
  await fs.rm(path.join(runtimeRoot, 'admin', 'be', 'node_modules'), { recursive: true, force: true });

  await fs.mkdir(path.join(runtimeRoot, 'web'), { recursive: true });
  await fs.copyFile(path.join(rootDir, 'web', 'package.json'), path.join(runtimeRoot, 'web', 'package.json'));
  await fs.copyFile(path.join(rootDir, 'web', 'package-lock.json'), path.join(runtimeRoot, 'web', 'package-lock.json'));
  await fs.copyFile(path.join(rootDir, 'web', 'astro.config.mjs'), path.join(runtimeRoot, 'web', 'astro.config.mjs'));
  await fs.copyFile(path.join(rootDir, 'web', 'tsconfig.json'), path.join(runtimeRoot, 'web', 'tsconfig.json'));
  await copyDir(path.join(rootDir, 'web', 'src'), path.join(runtimeRoot, 'web', 'src'));

  await copyDir(path.join(rootDir, 'admin', 'fe', 'dist'), path.join(runtimeRoot, 'admin', 'fe', 'dist'));
  await copyDir(path.join(rootDir, 'web', 'dist'), path.join(runtimeRoot, 'web', 'dist'));
  await copyDir(path.join(rootDir, 'news-vault'), path.join(runtimeRoot, 'news-vault'));

  await fs.mkdir(path.join(runtimeRoot, 'scripts', 'runtime'), { recursive: true });
  await fs.copyFile(
    path.join(rootDir, 'scripts', 'runtime', 'site-server.mjs'),
    path.join(runtimeRoot, 'scripts', 'runtime', 'site-server.mjs'),
  );

  await fs.copyFile(launcherPath, path.join(runtimeRoot, path.basename(launcherPath)));

  const nodeDir = path.join(runtimeRoot, 'node');
  await extractNodeArchive(archivePath, nodeDir);

  if (target.id === 'linux-x64' || target.id === 'macos-arm64') {
    await makeExecutable(path.join(runtimeRoot, path.basename(launcherPath)));
    await makeExecutable(path.join(nodeDir, 'bin', 'node'));
  }

  console.log(`Installing backend dependencies for ${target.id}...`);
  run(
    'npm',
    ['ci', '--omit=dev', '--include=optional', '--os', target.os, '--cpu', target.cpu],
    path.join(runtimeRoot, 'admin', 'be'),
  );

  console.log(`Installing web dependencies for ${target.id}...`);
  run(
    'npm',
    ['ci', '--omit=dev', '--include=optional', '--os', target.os, '--cpu', target.cpu],
    path.join(runtimeRoot, 'web'),
  );

  console.log(`Done: usb-runtime/${target.id}`);
}

async function main() {
  await ensureNodeArchives();
  await buildWebStaticSite();
  await buildAdminFrontend();

  await fs.rm(usbRuntimeRoot, { recursive: true, force: true });

  for (const target of targets) {
    await prepareTargetRuntime(target);
  }

  console.log('\nRuntime build complete.');
}

main().catch((error) => {
  console.error('\nRuntime build failed.');
  console.error(error.message);
  process.exit(1);
});
