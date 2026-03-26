# Delfi EOD Portal — Q&A Preparation
## Anticipated engineering-team questions with prepared answers

> Use this document to prepare for the **second 15 minutes** of the presentation.
> Questions are grouped by topic. Read the short answer first; the longer explanation
> is there if you need to go deeper.

---

## Architecture & design choices

**Q: Why not use a database?**

Short: We don't need one. A database adds an installation requirement, a running process, and migration complexity. For a USB-based tool that may be handed to any machine, files are simpler, more portable, and offline-friendly. Markdown files are also human-readable — an editor can fix content with a text editor if the UI breaks.

Longer: We store one folder per article with a `live.md` and optional `draft.md`. The backend scans the folder on every request (`getAllArticles`). For the article counts involved (tens to hundreds, not millions) this is instantaneous. If the content set grows to tens of thousands, we would add an in-memory index — but that hasn't been the constraint.

---

**Q: Why Astro for the public site?**

Short: Astro is a static site generator — its output is pure HTML/CSS/JS with no JavaScript runtime on the server side. That means you can deploy it to any file host (S3, Nginx, a shared hosting plan) and it keeps working even if the web server crashes, because the files are already there. Astro also has built-in image optimization and TypeScript-checked content schemas.

Longer: The alternative would be a server-side rendered app (Next.js, Express+templates). But that requires a Node process running on the hosting target. If that process crashes or the host goes down, the site goes down. With static files, there's nothing to crash.

---

**Q: Why is the alert stored in `consts.ts` instead of a JSON config file or database?**

Short: The alert is part of the site's source. When you deploy, `consts.ts` goes with it. There's no extra runtime config to manage, no sync issue between the config file and the source.

Longer: The backend reads `consts.ts` as plain text and uses regex replace to update `active` and `message` in-place. It's a bit unconventional but it works reliably for a two-field structure that will never change shape. The alternative — a separate `alert.json` that Astro reads at build time — would work too but adds another file to track and another surface to potentially lose or forget to include in the USB runtime.

---

**Q: Why store the critical alert as a build-time constant rather than fetching it from an API at runtime?**

Short: The public site has no runtime. It's static HTML. There's no JavaScript running on the server side to fetch anything. The alert state is baked into the HTML at build time, which means a deploy is required to change it — that's intentional.

Longer: A real-time alert via JavaScript fetch would require either a backend (which we've deliberately eliminated from the public side) or a separately managed endpoint. Since a deploy takes under a minute, the tradeoff is acceptable: editors click "Deploy Critical Alert Update" and it's live within 60 seconds.

---

**Q: Why is the admin server local-only (`127.0.0.1`) and why no rate limiting?**

Short: The admin is never reachable from the network. It only binds to the loopback interface, so the only person who can access it is whoever is sitting at the machine. There's no remote attack surface to rate-limit against.

Longer: Rate limiting makes sense when an attacker can make unlimited requests over a network. Here, the admin is only accessible by someone who has physical access to the machine running it (i.e., someone who already has the USB stick). If physical security is compromised you have bigger problems. Brute-force protection on a loopback-only service would be security theatre.

---

## Security

**Q: How are hosting credentials stored? What if someone gets the USB stick?**

Short: Credentials are encrypted with AES-256-GCM using a key derived from the admin password via scrypt. The encrypted blob is in `.admin/credentials.enc`. Without the password, the credentials are unreadable.

Longer: The encryption key is derived from the password and a random 32-byte salt (stored in `.admin/config.json`) using scrypt with standard interactive parameters (`N=16384, r=8, p=1`). AES-256-GCM is authenticated encryption — it provides both confidentiality (the data is encrypted) and integrity (the auth tag confirms the ciphertext hasn't been tampered with). In practice: if you steal the USB without the password, you get meaningless bytes.

---

**Q: Why bcrypt for the password and scrypt for the key? Why not just one?**

Short: They solve different problems. bcrypt is designed for fast password verification with slow hashing. scrypt is designed for key derivation — it produces a fixed-length byte sequence suitable as an AES key. You can't feed a bcrypt hash directly into AES.

Longer: We need to: (1) verify the password quickly at login, and (2) derive an encryption key to decrypt credentials. bcrypt handles (1) — it's a well-understood, purpose-built algorithm for password hashing. scrypt handles (2) — it's a password-based key derivation function (PBKDF) that produces a 32-byte key for AES-256. Both are intentionally slow to resist offline brute force.

---

**Q: What's the CSRF protection mechanism? Why not use a CSRF token?**

Short: We use a fixed-value custom header (`x-eod-requested-by: delfi-eod-admin`) that the frontend attaches to every mutating request. A cross-origin page cannot add custom headers to requests (blocked by CORS preflight). This is equivalent to the "custom header" CSRF mitigation approach.

Longer: Traditional CSRF tokens work by embedding a server-generated token in forms and checking it on the server. This requires state (storing the token) and coordination. For a local-only admin with a known, fixed frontend, the custom header approach is equally effective: browsers block cross-origin custom headers at the preflight stage. Since the admin doesn't set `Access-Control-Allow-Origin: *` and only allows specific origins, a malicious page can't forge requests.

---

**Q: How does the session work? Is it persistent across restarts?**

Short: Sessions are in-memory (`express-session` default store). When the server stops, all sessions are gone. On restart, every user must log in again.

Longer: This is intentional. An in-memory session store means sessions can't be stolen from disk, they expire naturally when the USB is ejected, and there's no session database to maintain. The 30-minute cookie expiry means an unattended machine's session expires on its own. The tradeoff — you have to log in again after every USB restart — is acceptable for a crisis tool. You are never logged in when the USB is not running.

---

## Content & workflow

**Q: How do soft locks work across multiple USB sticks?**

Short: Locks are stored as JSON files on the hosting target (S3/SFTP/FTP) in a `.locks/` directory. Every USB stick talks to the same hosting target, so they share lock state. When editor A opens an article, a lock file is written to `.locks/<slug>.json`. Editor B's dashboard polls for locks and shows "Locked (other device)".

Longer: Each installation gets a UUID stored in `localStorage` (`eod-installation-id`). Each editing session gets a fresh UUID as a lock token. The lock file contains both. When editor B opens the dashboard, the frontend fetches the lock state for each article and compares `installationId` with its own. If they differ and the lock hasn't expired, the Edit button is disabled. Locks expire after 30 minutes and refresh every 5 minutes while the editor has the article open.

---

**Q: What happens to the live site if the USB server crashes while an editor is writing?**

Short: Nothing. The live site is static files on a hosting target. It's completely independent of the USB server. Readers continue to see the last deployed version.

Longer: This is the key benefit of the architecture. The admin is a local tool for building and deploying. Once deployed, the public site has zero dependency on the USB server. The USB server can crash, be ejected, or be unplugged — the site keeps serving.

---

**Q: Can two editors work simultaneously without conflicts?**

Short: Yes, with soft-lock coordination. Each article can only be edited by one device at a time. Other articles remain fully editable. Publishing is per-article and isolated.

Longer: Soft locks prevent two editors from saving conflicting versions of the same article. But they can work on different articles at the same time. The content sync (Pull Content) lets a second USB pull the latest articles from the hosting target so both editors start from the same state. The lock system coordinates who is editing what.

---

**Q: What happens if a deploy fails partway through?**

Short: The live site stays in its previous state. The backend doesn't do partial uploads — it attempts a full upload and reports success or failure. If the dashboard triggered the deploy (via publish/unpublish/delete), the article state is reversed on failure.

Longer: The `triggerDeploy` function returns a typed outcome (`ok: true` or `ok: false` with a classified error type). In `DashboardView.vue`, if a publish triggers a deploy that fails, the article is unpublished again (via the API) and the user sees a `DeployErrorBanner`. This keeps the live site consistent with the article state the editor sees.

---

## Technology

**Q: Why Vue 3 for the admin instead of React?**

Short: Vue 3 with the Composition API has a lighter setup for a small, focused application. No need for Redux/Zustand — module-level reactive refs act as a simple shared store. The team was familiar with Vue. For this scope, the choice is not critical — it could have been React or Svelte with similar results.

---

**Q: Why EasyMDE for the markdown editor?**

Short: EasyMDE is a well-established, dependency-light markdown editor built on CodeMirror 5. It provides a familiar toolbar (bold, italic, headings, lists, links, preview, side-by-side), spell check can be disabled, and it integrates cleanly into a Vue component with minimal boilerplate. It doesn't require a separate build step.

---

**Q: Why not use a headless CMS like Contentful or Sanity?**

Short: Those are cloud services. The entire point of EOD is to work when cloud services are unavailable. Everything must run offline on the USB stick.

---

**Q: The build script installs dependencies per OS. How does that work?**

Short: npm 10+ supports `--os` and `--cpu` flags on `ci`/`install`. This tells npm to fetch native binaries for the specified platform even if it's different from the machine doing the building. So you can run the build script on a Mac and produce a Windows runtime with the correct Windows binaries for `sharp` and `ssh2`.

Longer: Packages with native addons (C++ compiled for a specific OS/CPU) like `sharp` (libvips) and `ssh2-sftp-client` (ssh2 native crypto) publish pre-built binaries to npm for each OS/CPU combination. The `--os win32 --cpu x64` flags cause npm to select the `win32-x64` binary variant. The resulting `node_modules` is then included in the USB runtime folder for that OS.

---

**Q: Why exFAT for the USB stick?**

Short: exFAT is the only filesystem natively supported for read/write on Windows, macOS, and Linux without installing anything. FAT32 has a 4 GB file size limit (Node archives are larger). NTFS requires third-party drivers on macOS. ext4 has no native Windows support.

---

**Q: What are the dependencies of the public site on the client side?**

Short: Zero JavaScript runtime. Astro's default output is HTML and CSS. There's no React, no Vue, no client-side JavaScript framework. The only JavaScript is what Astro might generate for progressive enhancement (none in this case). The site works with JavaScript disabled.

---

## Operational

**Q: How quickly can you switch hosting targets?**

Short: Under two minutes. Configure a new server in the admin → Test → Deploy. The deploy rebuilds the static site and uploads to the new target. The bottleneck is getting credentials from ops, not the technical process.

Longer: The build itself (Astro static build) typically takes 10–30 seconds for this content volume. The upload time depends on content size and connection speed. S3 deploys in testing have averaged 20–30 seconds. SFTP over a local network is similar. The README says "under one minute for build + deploy in all our testing."

---

**Q: What's the recovery process if the USB stick dies?**

Short: Plug in a second USB stick (kept as a backup). Run the start script. If you set up a password on the backup, enter it. If you configured the same hosting target, Pull Content to get the latest articles. If not, the articles that were last deployed are still on the hosting target in `.content/` — pull them from there.

---

**Q: Can you add more deployment targets (e.g. Azure Blob Storage)?**

Short: Yes. The server route has four implementations: S3, SFTP, FTPS, FTP. Adding Azure Blob Storage would mean adding a fifth implementation using the `@azure/storage-blob` SDK. The pattern is already established in `routes/server.js` — add the credential fields to the UI, add the connection/deploy/pull logic on the backend.

---

**Q: Is there a limit on how many articles can be published?**

Short: No hard limit. Practical limit is performance of the Astro build (which reads all `live.md` files) and the deploy upload time. For hundreds of articles this is still well under a minute. For thousands, build time would increase but the architecture would still work.

---

**Q: Can images be served from a CDN?**

Short: Yes. Images are part of the static site output (`web/dist/`). When deployed to S3 + CloudFront, the CloudFront CDN serves them with immutable cache headers (`public, max-age=31536000, immutable` for hashed assets). The static server (`site-server.mjs`) also sets appropriate cache headers.

---

## Code quality & maintainability

**Q: Are there tests?**

Short: There is no automated test suite currently. The codebase is relatively small and the main verification is manual: build the runtime, plug in the USB, run through the workflow. For a crisis tool built under time pressure, tests were deprioritized. Areas where tests would add most value: the `crypto.js` encrypt/decrypt round-trip, `store.js` CRUD operations, and `markdown.js` parse/serialize round-trip.

---

**Q: How would you handle multi-language content?**

Short: The current implementation doesn't have multi-language support. Articles are single-language. The date locale is configured to `et-EE`. To support multiple languages: add a `lang` frontmatter field, use Astro's i18n routing, and add language-specific URL prefixes. The content collection schema would need to be extended.

---

**Q: What would you change if you were to rebuild this from scratch?**

Short (honest answer): The alert state stored via regex-replace in `consts.ts` is the most fragile part. A separate `alert.json` read by Astro at build time would be cleaner. The lock system doing a full connect/disconnect per lock operation is inefficient for SFTP — a connection pool or a local lock file with periodic sync would be better. Otherwise, the architecture is sound for the problem it solves.

---

## Presentation tips

- **Lead with the demo:** Show the USB workflow live if possible. Editors understand "plug in, write, hit deploy" better than architecture diagrams.
- **Emphasize the static public site:** This is the core resilience guarantee. The site stays up even if everything else (the USB server, AWS, Cloudflare) goes down.
- **The 30-minute session:** Roughly 5 minutes intro + problem, 10 minutes code walkthrough (backend security, content workflow, deploy), 15 minutes Q&A.
- **Questions about "why not X?"** — Almost always the answer is: "X requires something to be running on the public serving side, which we've eliminated."
- **Questions about production readiness:** Be honest that the alert regex approach and the absence of tests are known rough edges. The system is demonstrably functional for its intended scenario.
