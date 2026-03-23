# Delfi Emergency Operation Portal

## 1. Overview
Emergency Operation Delfi (EOD) is a crisis communication tool designed for quickly administering and publishing content
during crisis mode of operation -- in the event that primary infrastructure is degraded or unavailable.
The goal is a simple, portable, resilient, static-first website building in a lightweight admin editor
that can migrate content to a new host in 15-60 minutes.

- Admin UI: local-first, password-protected encryption to secrets, soft-lock editing.
- Public site: static HTML/CSS/JS + structured content (JSON + markdown).

- Source content under `news-vault/` and `web/src/content` (depending on implementation mode).

## 2. What it does
- Build static public crisis portal with Home, Article, and Contact pages.
    - Critical alert banner with immediate visibility.
    - Article metadata: title, lead, lead image, body, author, publish date.
    - Auto-resized images and local asset handling (via static build process).
- Admin for content editing with CRUD workflows: create/edit/publish/unpublish articles.
- Soft-lock mechanism: indicates when an article is being edited.
- Minimal dependencies to avoid vendor lock-in.

## 3. Core architecture
- `web/` Astro static site generator for public-facing pages.
- `admin/` Express backend plus Vue frontend for article management.
- locally ran admin approach for maximum security
- Storage options:
  - local filesystem (`news-vault/`)
  - static output (for deployment to S3-compatible bucket/FTP/SFTP)

### 3.1 Diagram of information flow towards audience
```
+---------------------+              +-----------------------+
| Visitors routed via |     <---     |  Source (S3/FTP/Local)|
| DNS (eod.delfi.ee)  |              | (build artifacts)     |
+---------------------+              +-----------------------+
                                         ^
                                         |
                                         v
                                +-----------------+
                                | Admin Console   |
                                | (admin/*)       |
                                +-----------------+
```

## 4. Setup and usage

### 4.1 USB runtime packaging

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

### 4.2 Admin application
1. `cd admin/be`
2. `npm install`
3. `cd ../fe`
4. `npm install`
5. `cd ../..`
6. `./dev.sh`
4. Open admin `http://localhost:####` - follow full link with port from output
> Default encryption protection by password entered on first run locally  : configured in `admin/be/ auth/middleware.js`, 
stored in folder /.admin/ once set.

### 4.3 Local deployment (front-end) - for testing purposes and/or local hosting
1. `cd web`
2. `npm install`
3. `npm run dev`
4. Open `http://localhost:####` - follow full link with port from output

## 5. Building static output
1. `cd web`
2. `npm run build`
3. Output is in `web/dist` (HTML, CSS, JS, assets, structured JSON as needed).
4. For S3/FTP deploy, sync `web/dist` to destination.

## 6. Deployment targets
- S3/S3-compatible object storage
- SFTP / FTPS / FTP hosting
- Local static server (`serve web/dist`) for air-gapped operation (or manual copy of web page)

## 7. Security model
- Admin console not publicly exposed, air-gapped service only started on demand from local endpoints
- Admin paths are not indexable by default (no sitemap references + robots.txt deny in admin route).
- Public content is static, no secrets shipped.
- Authentication with bcrypt session cookie and brute-force middleware.
- Supports local-only admin bind by setting host to `127.0.0.1`.

## 8. Migration / fallback
- Less than one-hour migration is possible by shipping `web/dist` and `news-vault/` to another host and replacing DNS A/CNAME to parallel domain.
- No third-party services in the critical path.

### 8.1 For migration, please ensure you have built and successfully run the admin application as per section `4. Setup and usage` first

### 8.2 Connecting server / hosting target
- Once the application is running, please log on to the admin application in the same local machine
  - You can find the login link from application startup console, example ➜  Local:   http://localhost:5173/ 
- Please start by setting a password to protect your server / hosting target secrets
  - Note that you cannot recover a forgotten password and can reinitiate the application password only by deleting the password 
    along with the secrets by removing folder `.admin/`
- To initiate a new server connection / hosting target, please click on Server (upper right side of the header)
  - Once configured, try with "Test" (test status will inform of issues/success) and Deploy once ready to publish and start editing on a connection
  - Click "+ Add Server" for adding additional connections; "Edit" or "Delete" for modifying or removing a connection

## 9. FAQ
- `Q: Can the public site work if admin is down?`
  - Yes. Public output is static build; admin is separate.
- `Q: Can the admin application upload to multiple hosting targets at teh same time?`
  - Yes. It is possible to deploy to multiple S3, FTPS (TLS), SFTP (SSH), FTP connections simultaneously.
- `Q: Can multiple journalists/editors work on the content simultaneously?`
  - Yes. Soft lock warns of simultaneous editing on an article, but the remaining functionality can be used by a team.
- `Q: How to add a new article manually?`
  - Add markdown/JSON in the source folder and run build.

## 11. Notes
- Admin application fills all assignment requirements (public, static, portable, secure, low risk).
- Focus on clarity and simplicity over complexity.
- Includes a minimal working admin console and a performant static site. Local front end application for local deployment or live development added.
