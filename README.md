# Delfi EOD Portal

Emergency Operation Delfi.

## Components

- **[admin/](admin/)** — Admin management panel (Express + Vue)

## USB runtime packaging

Build portable runtime folders (Node binary + preinstalled backend dependencies + built frontend/site assets):

```bash
node scripts/build-runtime.mjs
```

The script automatically downloads required portable Node.js archives into `binaries/` (if missing) and verifies checksums from official Node.js SHASUMS.
It also caches checksums in `binaries/SHASUMS256-v24.14.0.txt` so builds continue to work offline after the first successful online run.

This creates:

- `usb-runtime/win-x64`
- `usb-runtime/macos-arm64`
- `usb-runtime/linux-x64`

Each runtime can be copied to a USB drive and started on matching OS/CPU with:

- Windows: `start.bat`
- macOS: `start.command`
- Linux: `start.sh`

Notes:

- `web/dist` is built automatically by the runtime build script.
- `admin/fe/dist` is built automatically by the script.
- Runtime includes `web/package.json`, `web/src`, and target-specific `web/node_modules` so CMS deploy can rebuild Astro directly on USB.
- Backend `node_modules` are installed per target OS/CPU so native modules (for example `sharp`) match the runtime.

In Server Connection view:

- `Build Preview` rebuilds local `web/dist` only (no upload) so editors can verify changes at `http://127.0.0.1:4321`.
- `Deploy` rebuilds and uploads to the selected server target.
