# Delfi EOD Portal — Presentation Guide
## Code walkthrough · Architecture · Decision rationale

> Use this document to prepare the **first 15 minutes** of the presentation:
> introducing the problem, walking through the system, and showing how it works.

---

## 1. The problem this solves

Delfi is an online news publisher. Its primary infrastructure — AWS, Cloudflare, CDN edges — could fail during a major crisis, which is exactly when readers most need news. The EOD (Emergency Operation Delfi) portal is a parallel, completely independent website that editors can keep publishing updates to, from a hardware-encrypted USB stick, even if the main infrastructure is down.

The design goal is: **two minutes from "USB plugged in" to "article live on the internet".**

---

## 2. System overview

```
┌──────────────────────────────────────────────┐
│               USB stick                       │
│                                               │
│  ┌──────────────┐    ┌───────────────────┐   │
│  │  Admin CMS   │    │  Public site      │   │
│  │  (Express)   │───▶│  (Astro static)   │   │
│  │  port 3001   │    │  port 4321        │   │
│  └──────┬───────┘    └───────────────────┘   │
│         │                                     │
│         ▼  writes markdown                    │
│  ┌──────────────┐                             │
│  │  news-vault/ │                             │
│  │  (raw files) │                             │
│  └──────────────┘                             │
└──────────────────────────────────────────────┘
        │ deploy (S3 / SFTP / FTP)
        ▼
┌──────────────────────┐
│  Hosting target       │
│  (S3, SFTP, etc.)     │
│  Public website live  │
└──────────────────────┘
```

- The **admin** is a local-only Express server. It is never accessible from the network.
- The **public site** is pure static HTML/CSS/JS built by Astro. No server needed to serve it.
- Content is stored as plain markdown files in `news-vault/`. No database.

---

## 3. Repository layout

```
.
├── admin/
│   ├── be/          Express backend (Node.js, port 3001)
│   │   ├── auth/    Password hashing, session, encryption
│   │   ├── data/    Article CRUD — reads/writes news-vault/
│   │   ├── routes/  REST API: articles, images, alert, server
│   │   └── utils/   Soft locks, slugify, markdown parse/serialize
│   └── fe/          Vue 3 + TypeScript SPA (admin UI)
│       └── src/
│           ├── views/   Dashboard, ArticleEdit, ServerConnection, Login
│           ├── api.ts   Axios instance with CSRF header
│           ├── useDeploy.ts       Deploy trigger + toast feedback
│           └── useActiveServer.ts Shared reactive server selection
├── web/             Astro static site (public portal)
│   └── src/
│       ├── content.config.ts  Glob loader for news-vault/
│       ├── consts.ts          Alert message, site title, date format
│       ├── pages/             index.astro, [...slug].astro, contact.astro
│       ├── layouts/           NewsPost.astro
│       └── components/        Header, Footer, AlertBanner, SocialLinks
├── scripts/
│   ├── build-runtime.mjs      Packages everything for USB distribution
│   └── runtime/
│       ├── site-server.mjs    Tiny Node HTTP server for public site preview
│       ├── start.bat          Windows launcher
│       ├── start.command      macOS launcher
│       └── start.sh           Linux launcher
└── news-vault/                Article content (one folder per article)
    └── YYYY-MM-DD-slug/
        ├── live.md            Published version
        ├── draft.md           Unpublished edits (optional)
        └── media/             Article images (auto-resized)
```

---

## 4. The backend (`admin/be/`)

### `index.js` — Express app entry point

The entry point wires up all middleware and routes:

- **`BASE_DIR` detection:** Uses `process.pkg` to detect if running from the USB runtime (a packaged binary) vs. development. This controls where `news-vault/` and `.admin/` are resolved from. In dev that is two levels up from `admin/be/`; on USB it is next to the executable.
- **CORS:** Only allows `127.0.0.1:3001` and `127.0.0.1:5173`. This isn't really a security boundary (the server only listens on loopback anyway) — it mainly prevents accidental cross-origin calls during development.
- **Session:** `express-session` with a random 32-byte secret generated at startup. Sessions live in memory and disappear when the server stops. Cookie is `httpOnly`, `SameSite=lax`, 30-minute expiry.
- **Static file serving:** If a built admin frontend exists at `admin/fe/dist/`, it is served as a static SPA. If not (dev mode) it falls through to the separate Vite dev server at port 5173.
- **Route order matters:** Auth routes are public. All other API routes require the `requireAuth` middleware. The `requireStateChangingRequestHeader` middleware runs globally before sessions — it rejects any `POST/PUT/PATCH/DELETE` to `/api/` that does not carry the `x-eod-requested-by: delfi-eod-admin` header.

### `auth/crypto.js` — Password and credential security

This is the most security-sensitive file. Three operations:

1. **`setup(password, serverCredentials)`** — First-time setup. Generates a random 32-byte salt. Hashes the password with bcrypt (cost 12). Derives a 256-bit encryption key from the password + salt using scrypt (`N=16384, r=8, p=1` — the standard "interactive" parameters). Encrypts the server credentials object with AES-256-GCM using a random 12-byte IV. Stores the bcrypt hash, scrypt salt, GCM IV, and GCM auth tag in `.admin/config.json`. Stores only the ciphertext in `.admin/credentials.enc`.

2. **`verifyPassword(password)`** — Just bcrypt compare. Fast to call on login.

3. **`decryptCredentials(password)`** — Re-derives the scrypt key from the entered password and salt, then attempts AES-256-GCM decryption. The GCM auth tag is verified automatically by the cipher — if the password is wrong, decryption throws. Returns the plaintext credentials and the hex key for the session.

**Why two hashes?** bcrypt is used for the login check because it is designed for password verification. scrypt is used for key derivation because it produces a fixed-length key suitable for AES. Both are intentionally slow to resist brute force.

**Where do credentials live?** Only in `.admin/credentials.enc` (encrypted) and in `req.session.serverCredentials` (decrypted, in-memory, per-session). They never touch the filesystem in plaintext.

### `auth/middleware.js` — Auth and CSRF

- **`requireAuth`** — Checks `req.session.authenticated`. Returns 401 if false.
- **`requireStateChangingRequestHeader`** — Custom CSRF protection via a fixed-value header. Because the admin never sets `CORS: *` and only allows known origins, a browser cross-origin request cannot add this custom header. This means a malicious page cannot trigger state-changing actions even if the cookie is present. Brute-force and rate limiting are deliberately omitted — the admin only listens on loopback; there is no remote attack surface.

### `auth/routes.js` — Auth API

Three endpoints:
- `GET /api/auth/status` — Returns `{ setupRequired, authenticated }`. The frontend uses this to decide which screen to show on load.
- `POST /api/auth/setup` — Only works before `.admin/config.json` exists. Hashes password, encrypts credentials, creates session.
- `POST /api/auth/login` — Verifies bcrypt hash, re-derives scrypt key, decrypts credentials, stores both in session.
- `POST /api/auth/logout` — Destroys session.

### `data/store.js` — Article storage

No database. Each article lives in its own folder: `news-vault/YYYY-MM-DD-slug/`. Inside:
- `live.md` — the published version (frontmatter + markdown body)
- `draft.md` — unpublished edits; exists alongside `live.md` when the article has unsaved changes

The `toListArticle()` function determines the article state shown in the dashboard:
- `live.md` only → Published, no pending changes
- `draft.md` only → Draft
- Both exist, identical content → Published (draft is cleaned up)
- Both exist, different content → Published + Changes Pending

**Slug generation:** `YYYY-MM-DD-<title-slugified>`. The slugify utility handles Estonian characters (ä→a, ö→o, ü→u, š→s, etc.) before converting to URL-safe lowercase.

**Image paths:** Images are stored relative to the article (`./media/filename.jpg`) in markdown. When served to the editor they are rewritten to `http://127.0.0.1:3001/uploads/<slug>/media/filename.jpg`. When the Astro build reads them, they are resolved as local file paths. `markdown.js` handles both conversions.

### `routes/articles.js` — Article REST API

Standard CRUD with extra locking logic:

- `GET /api/articles` — Lists all articles with computed `hasPendingChanges`, `published`, lock state.
- `GET/POST/PUT/DELETE /api/articles/:id` — Individual article operations. PUT requires a valid lock token in the `x-article-lock-token` header.
- `POST /api/articles/:id/publish` — Calls `moveArticleFolder(slug, "published")` which promotes draft to live and removes draft.md, then saves with `published: true`.
- `POST /api/articles/:id/unpublish` — Moves live to draft.
- Lock sub-routes: `/lock`, `/lock/acquire`, `/lock/refresh`, `/lock/release` — Delegate to the locking utility.

### `routes/server.js` — Server configuration and deploy

This is the largest file. It handles:
- Storing/loading server configurations (encrypted in the session)
- Testing connections (S3 `ListObjectsV2`, SFTP connect, FTP connect)
- Deploy: build Astro with `astro build`, then upload `web/dist/` to the remote target
- Pull Content: download `news-vault/` from `.content/` on the remote target
- Build Preview: build Astro locally only (no upload)

Deploy uploads `web/dist/` recursively plus syncs `news-vault/` to `.content/` for the Pull Content workflow. For S3, it additionally optionally issues a CloudFront invalidation (`/*`). FTP warnings are shown in the UI when plain FTP is selected.

### `routes/alert.js` — Critical alert banner

The alert banner state is stored directly in `web/src/consts.ts` as TypeScript constants:
```typescript
export const ALERT = { active: true, message: "..." };
```

The backend reads this file as text and uses regular expressions to update the `active` and `message` values in-place. No parsed AST, no file rewrite — just regex replace. This means Astro picks up the new values on the next build.

Why store it in `consts.ts` rather than a separate JSON file? It keeps the public site's alert configuration as part of the site source — there is no runtime config to lose. It also means the alert state is included in whatever gets deployed.

### `utils/locks.js` — Soft lock system

Soft locks prevent two editors from saving conflicting changes to the same article simultaneously. The lock state is stored on the **hosting target** (S3/SFTP/FTP), not on the local USB. This means multiple USB sticks sharing a hosting target see each other's locks.

Each lock is a JSON file at `.locks/<slug>.json` containing:
- `slug`, `installationId` (UUID per browser session stored in localStorage)
- `token` (UUID per editing session)
- `acquiredAt`, `heartbeatAt`, `expiresAt` (30 minutes)

When an editor opens an article, `acquire` is called. If another editor holds a non-expired lock with a different token and installationId, the acquire returns `{ ok: false, reason: "locked" }`. The frontend shows an error and blocks editing.

While editing, the frontend refreshes the lock every 5 minutes via `setInterval`. When the editor navigates away (route leave hook) or the component unmounts, the lock is released by deleting the remote file.

If no server is configured, locking is silently bypassed (`disabled: true`) — single-USB offline workflows still work.

### `utils/markdown.js` — Markdown parse/serialize

- **`articleToMarkdown(article)`** — Converts an article object to YAML frontmatter + Markdown. Uses `gray-matter` for serialization. Image paths are normalized back to `./media/` relative form for storage.
- **`parseMarkdown(content, options)`** — Reads frontmatter with `gray-matter`. Handles a legacy JSON frontmatter format for backwards compatibility. Normalizes image paths back to absolute runtime paths for the editor.

The field name mapping (e.g. `lead`↔`description`, `leadImage`↔`heroImage`, `publishDate`↔`pubDate`) exists because the original Astro blog template uses different names than the admin UI uses. Both sets of names are accepted on read.

### `routes/images.js` — Image upload

Images are uploaded via multipart form with `multer` (in-memory, max 10 MB). `sharp` then:
- Rotates based on EXIF orientation (`.rotate()`)
- Resizes to fit within 1920×1080 (preserving aspect ratio, never upscaling)
- Strips all metadata (`withMetadata(false)`)
- Converts to JPEG at quality 80

Lead images get the fixed filename `lead.jpg`. Body images get sequential names (`1.jpg`, `2.jpg`, …) by scanning existing files in the media directory.

---

## 5. The admin frontend (`admin/fe/`)

### Technology: Vue 3 + TypeScript + Vite

Vue 3 with the Composition API (`<script setup>`). TypeScript throughout. Vite for development server and build. No UI component library — everything is hand-written CSS with custom properties.

### `api.ts` — Axios instance

A single Axios instance preconfigured with:
- `baseURL: http://127.0.0.1:3001/api`
- `withCredentials: true` (sends the session cookie)
- `headers: { 'x-eod-requested-by': 'delfi-eod-admin' }` — the CSRF header, sent on every request

### `useActiveServer.ts` — Module-level reactive state

This is a Vue composable that holds module-level (singleton) reactive refs, not instance refs. This means every component that calls `useActiveServer()` shares the same reactive state — similar to a Pinia store but lighter:
- `activeServerId` — persisted in localStorage
- `workOffline` — persisted in localStorage; allows using the admin without a configured server
- `deployError` — displayed in `DeployErrorBanner.vue` across all views

### `useDeploy.ts` — Deploy trigger

Shared deploy logic: calls `POST /server/{id}/deploy`, shows a toast notification, returns a typed `DeployOutcome`. Any view that needs to trigger a deploy (publish article, unpublish, delete, alert update) uses this composable. On failure, error messages are classified by keyword into `connection` / `access` / `build` types for clearer error display.

### `views/DashboardView.vue`

The main screen. Features:
- Alert banner controls (text field, toggle, deploy button)
- Article list with status badges (Draft / Published / Published + Changes Pending)
- Lock badges (Locked this device / Locked other device)
- Lock state polled every 15 seconds with `setInterval`
- Each article card has Edit / Publish-or-Unpublish / Delete buttons

The deploy reversal pattern: if publish succeeds but deploy fails, the article is unpublished again and the user sees an error. This keeps the live site consistent with what the editor sees.

### `views/ArticleEditView.vue`

The editor. Features:
- **EasyMDE** markdown editor (CodeMirror under the hood) for the body
- Lock acquire on mount, heartbeat refresh every 5 minutes, release on unmount/route-leave
- Image upload for lead image and inline body images
- For inline images, the cursor position is remembered before the file picker opens so the image markdown is inserted at the right location
- The article is always saved as a draft (even for published articles), and the dashboard handles the published/draft reconciliation

### `views/ServerConnectionView.vue`

Manages multiple server configurations. Supports S3, SFTP, FTPS, FTP. Each server can be tested, deployed to, and used to pull content. The active server is selected via radio button and persisted to localStorage.

---

## 6. The public site (`web/`)

### Technology: Astro (SSG)

Astro is a static site generator that outputs pure HTML/CSS/JS with zero JavaScript runtime by default. It was chosen because:
- The output is just files — deployable to any hosting that serves files
- No Node.js, no runtime, no database on the serving side
- Image optimization built in (via sharp)
- TypeScript support for content schemas
- Very fast builds for a small content set

### `content.config.ts` — Content Collections

Astro's Content Collections system provides type-safe access to markdown files. The `news` collection uses a `glob` loader pointed at `../news-vault/**/live.md` — every published article is automatically included. The schema validates frontmatter fields (title, description, pubDate, optional heroImage and heroImageAlt).

The `generateId` function derives the URL slug from the article folder name (e.g. `2026-03-19-electricity-price-shock`). An `assertSafeSlug` check enforces that only lowercase alphanumeric + hyphen slugs are allowed, preventing path traversal or unexpected URL shapes.

### `consts.ts` — Site-wide configuration

Single source of truth for:
- `SITE_TITLE` and `SITE_DESCRIPTION`
- `ALERT` — the critical banner active/message state (edited by the backend's regex replace)
- `FOOTER_COPYRIGHT_TEXT`
- `DATE_LOCALE` and `DATE_FORMAT_OPTIONS` — set to Estonian locale (`et-EE`)

### Pages

- **`index.astro`** — Fetches all news collection entries, sorts by `pubDate` descending, renders a grid. The first article gets a full-width 960×420 hero image; subsequent articles get 480×240 thumbnails.
- **`[...slug].astro`** — Dynamic route. `getStaticPaths()` returns one entry per article (with path `news/<slug>`). Renders the `NewsPost` layout with the article's markdown body via Astro's `render()`.
- **`contact.astro`** — Static contact page with a placeholder image.

### `AlertBanner.astro`

A conditional `<aside>` rendered server-side (at build time). If `ALERT.active` is false, nothing is output — no JavaScript, no DOM element. The banner uses a dark red gradient background, white text, `role="status"` and `aria-live="polite"` for accessibility. Responsive: the separator character is hidden on mobile.

### `astro.config.mjs`

Notable settings:
- `site: "https://web.demofoundry.ee/"` — Used for any absolute URLs (sitemap, RSS if added). Update this to the actual production domain.
- `rehypeSanitize` — Applied to markdown rendering. This sanitizes HTML in markdown bodies, preventing any injected `<script>` or event handler attributes from reaching the output HTML.
- `vite.server.fs.allow` — Allows Vite's dev server to read files from `../news-vault`, which sits outside the `web/` directory.

---

## 7. The USB runtime build (`scripts/build-runtime.mjs`)

The build script produces three self-contained runtime folders, one per OS. Each contains:

1. A **portable Node.js binary** downloaded from nodejs.org and verified with SHA-256 checksums. Checksums are cached locally after the first download so subsequent builds work offline.
2. The **admin backend** (`admin/be/`) with OS/CPU-specific `node_modules` (because `sharp` and `ssh2` have native binaries).
3. The **built admin frontend** (`admin/fe/dist/`).
4. The **Astro web source and dist** — source is needed for rebuilds triggered by deploy.
5. **Runtime launcher scripts** that set `PATH` to the bundled Node and start both servers.

The `--os` and `--cpu` flags on `npm ci` are how npm is told to fetch the right native binaries for the target OS even when running the build on a different OS (cross-compilation of npm packages).

After assembly, `validateRuntimeLayout` checks all required paths exist and throws if anything is missing — fail-fast before a broken USB is distributed.

---

## 8. Key architectural decisions (summary for the presentation)

| Decision | Why |
|---|---|
| No database | Files are simpler, offline-friendly, inspectable, and easy to back up |
| Markdown storage | Editors can hand-edit files if needed; Astro reads markdown natively |
| USB-first runtime | No installation on the host machine; works on any OS with the matching folder |
| Local-only admin | No remote attack surface; brute-force protection is unnecessary |
| Password-derived encryption key | Credentials are useless without the password; no separate key management |
| Static public site | Survives hosting outages; deployable to any file host; CDN-compatible |
| Alert state in consts.ts | Config stays with source; no extra runtime config file to lose |
| Remote soft locks | Multiple USBs share a hosting target and can coordinate |
| rehype-sanitize | Prevents XSS in markdown rendered by Astro |
| Vue 3 Composition API | Lightweight, no Vuex/Pinia needed; composables share state cleanly |
