# Delfi EOD Portal

Emergency Operation Delfi.

## Components

- **[admin/](admin/)** — Admin management panel (Express + Vue)

## USB runtime packaging

Build portable runtime folders (Node binary + preinstalled backend dependencies + built frontend/site assets):

```bash
node scripts/build-runtime.mjs
```

This creates:

- `runtime/win-x64`
- `runtime/macos-arm64`
- `runtime/linux-x64`

Each runtime can be copied to a USB drive and started on matching OS/CPU with:

- Windows: `start.bat`
- macOS: `start.command`
- Linux: `start.sh`

Notes:

- `web/dist` must exist before running the runtime build script.
- `admin/fe/dist` is built automatically by the script.
- Runtime includes `web/package.json`, `web/src`, and target-specific `web/node_modules` so CMS deploy can rebuild Astro directly on USB.
- Backend `node_modules` are installed per target OS/CPU so native modules (for example `sharp`) match the runtime.

In Server Connection view:

- `Build Preview` rebuilds local `web/dist` only (no upload) so editors can verify changes at `http://localhost:4321`.
- `Deploy` rebuilds and uploads to the selected server target.
