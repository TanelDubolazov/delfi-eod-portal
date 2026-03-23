import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const targets = [
  {
    id: 'win-x64',
    os: 'win32',
    cpu: 'x64',
    archive: 'binaries/node-v24.14.0-win-x64.zip',
    launcher: 'scripts/runtime/start.bat',
  },
  {
    id: 'macos-arm64',
    os: 'darwin',
    cpu: 'arm64',
    archive: 'binaries/node-v24.14.0-darwin-arm64.tar.gz',
    launcher: 'scripts/runtime/start.command',
  },
  {
    id: 'linux-x64',
    os: 'linux',
    cpu: 'x64',
    archive: 'binaries/node-v24.14.0-linux-x64.tar.xz',
    launcher: 'scripts/runtime/start.sh',
  },
];

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

async function prepareTargetRuntime(target) {
  const runtimeRoot = path.join(rootDir, 'runtime', target.id);
  const archivePath = path.join(rootDir, target.archive);
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

  console.log(`Done: runtime/${target.id}`);
}

async function main() {
  await ensureFileExists(path.join(rootDir, 'web', 'dist', 'index.html'));
  await buildAdminFrontend();

  await fs.rm(path.join(rootDir, 'runtime'), { recursive: true, force: true });

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
