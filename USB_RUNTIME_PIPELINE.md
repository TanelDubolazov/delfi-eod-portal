# USB Runtime Pipeline (Run + Rebuild + Deploy)

This document describes the full pipeline for preparing and using the USB runtime package for Delfi EOD Portal.

Goal:

- Run the admin CMS directly from USB
- Edit and publish news from USB
- Rebuild Astro site and deploy from USB
- Require no software installation on the host PC after USB is prepared

## 1) What gets packaged

For each target OS runtime folder under `usb-runtime/`:

- Portable Node.js binary (`node/`)
- Admin backend (`admin/be`) with target-specific `node_modules`
- Admin frontend build (`admin/fe/dist`)
- Web app source and build inputs (`web/src`, `web/public`, config files)
- Web prebuilt output (`web/dist`)
- Web target-specific dependencies (`web/node_modules`) for Astro rebuilds
- Runtime launcher scripts (`start.bat`, `start.command`, `start.sh`)
- Static server runtime script (`scripts/runtime/site-server.mjs`)
- Local content storage (`news-vault`)

Targets currently produced:

- `usb-runtime/win-x64`
- `usb-runtime/macos-arm64`
- `usb-runtime/linux-x64`

## 2) Build prerequisites (on packaging machine)

Build machine needs:

- Node.js + npm
- `tar` and `unzip` available in PATH
- Internet at least once to fetch Node archives/checksums (can later use cache)

Input folders used by the pipeline:

- `scripts/`
- `admin/`
- `web/`
- `news-vault/`
- `binaries/` (cache/download destination)

## 3) Build the USB runtime

Run from repository root:

```bash
node scripts/build-runtime.mjs
```

The script performs these steps in order:

1. Resolve Node checksums for configured `nodeVersion` and cache them in `binaries/SHASUMS256-<version>.txt`.
2. Download missing Node archives for each target into `binaries/`.
3. Verify archive checksums; re-download on mismatch.
4. Build web static site (`web/dist`).
5. Build admin frontend (`admin/fe/dist`).
6. Recreate each target runtime folder under `usb-runtime/<target>/`.
7. Copy required app files and runtime scripts.
8. Extract target Node archive into runtime `node/`.
9. Install target-specific production dependencies in:
   - `admin/be`
   - `web`
10. Validate required runtime layout (fails fast on missing essentials).

## 4) Copy to USB stick

Copy each runtime folder you need to the USB root (or a known directory), for example:

- `usb-runtime/win-x64`
- `usb-runtime/macos-arm64`
- `usb-runtime/linux-x64`

You can keep one or all targets on a single USB stick.

## 5) Start on host machine (no install)

Use the launcher inside the matching target folder:

- Windows: `start.bat`
- macOS: `start.command`
- Linux: `start.sh`

Services started locally:

- Admin CMS: `http://127.0.0.1:3001`
- Public site preview: `http://127.0.0.1:4321`

All processes use the portable Node binary bundled in the runtime folder.

## 6) CMS workflow from USB

1. Open admin CMS on `http://127.0.0.1:3001`.
2. Create/edit posts with markdown editor.
3. Publish content (stored under `news-vault/`).
4. Configure server connection details in CMS (S3/SFTP/FTP/FTPS).
5. Trigger:
   - Build Preview: rebuilds Astro output locally on USB
   - Deploy: rebuilds Astro output and uploads to selected server

Rebuild/deploy is done from USB runtime inputs (`web/src`, `web/public`, `web/node_modules`) and does not require host-side package installation.

## 7) Offline behavior expectations

After USB runtime is fully prepared:

- Starting CMS + preview works offline
- Editing and saving content to `news-vault/` works offline
- Astro rebuild for preview works offline

Network is only required for external operations:

- Deploy upload to remote server
- Initial download/cache of Node archives/checksums during packaging

## 8) Verification checklist before distribution

For each `usb-runtime/<target>` verify:

- Node executable exists (`node/node.exe` on Windows, `node/bin/node` on macOS/Linux)
- Launcher exists (`start.bat` / `start.command` / `start.sh`)
- `admin/be/index.js` exists
- `admin/be/node_modules` exists
- `admin/fe/dist/index.html` exists
- `web/dist/index.html` exists
- `web/src` exists
- `web/public` exists
- `web/node_modules` exists
- `scripts/runtime/site-server.mjs` exists
- `news-vault` exists

## 9) Operational notes

- `usb-runtime/` and `binaries/` may be intentionally excluded from git and built locally.
- If you update dependencies or runtime logic, rebuild the USB runtime before shipping.
- If adding new targets (for example `win-arm64` or `macos-x64`), update `targets` in `scripts/build-runtime.mjs` and rebuild.
