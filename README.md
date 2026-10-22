# Site Builder — Multi-Website Builder Platform

Create, customize, publish, and manage multiple independent client websites
from one central dashboard. Each website gets its own content, theme,
sections, and public URL (`/s/<slug>`), and edits in the dashboard appear on
the published site as soon as you save — no rebuild or redeploy needed.

## Features

- **Dashboard** (`/admin`): create, edit, duplicate, publish/unpublish,
  archive, and delete websites; search + status filter; copy/open public URL.
- **Visual editor** (`/admin/sites/[id]/edit`): section library (header,
  carousel, video, icon rows, contact), drag-to-reorder + move up/down,
  duplicate/delete/enable-disable per section, live preview in
  Desktop/Tablet/Mobile widths, undo/redo, and a full theme editor
  (solid/gradient backgrounds, colors, typography, radius, widths, spacing).
- **Sections** (all optional, all conditional — empty or disabled sections
  render *nothing* on the public site, no placeholders):
  - Header image/logo (transparent PNGs preserved; background color shows
    behind transparency)
  - Promotional image carousel (autoplay, slide/fade, arrows, dots, pause
    on hover, no image stretching)
  - Optional video (upload or YouTube embed; never autoplays with sound)
  - Icon rows: unlimited rows, any icon count per row, per-row
    columns/align/size/gaps, per-icon image/label/URL/shape/size
    (circle, square, rounded, custom radius, unframed)
  - Contact Us: Call (`tel:`), Copy number (clipboard + fallback),
    WhatsApp (`wa.me` with optional prefilled message) — any subset, or none
- **Public sites** (`/s/<slug>`): render only when `status === "published"`.
  Draft/archived sites return 404. Sites are fully isolated — editing one
  never touches another.
- **Auth**: single-admin login (`/admin/login`) with an httpOnly signed
  session cookie. All `/admin/*` pages (except login) and all `/api/*` routes
  (except `/api/auth/*`) require the session.

## Tech stack

Next.js (App Router) + TypeScript + Tailwind CSS. Minimal dependencies:
`@vercel/blob` for storage. No component library, no drag-and-drop library
(HTML5 drag + move buttons).

## Storage layout

All persistence goes through **one module: `src/lib/store.ts`**.

### Production: Vercel Blob (requires `BLOB_READ_WRITE_TOKEN`)

```
sites/index.json            SiteSummary[]  {id, name, slug, status, updatedAt}
sites/<id>.json             SiteConfig (full configuration)
media/<siteId>/<file>       Uploaded images/videos (public URLs)
```

### Local development fallback (NO token set)

The same layout on disk under `data/` (gitignored; override with
`SITE_BUILDER_DATA_DIR`). Uploaded media is served by
`GET /api/media/<siteId>/<file>`. **Never use the local fallback in
production** — it does not persist across Vercel deployments.

The app never seeds sample client sites: a fresh store starts empty.
Browser `localStorage` is never used as a database.

## Environment variables

See `.env.example`. Required in production:

| Variable | Purpose |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob read/write token |
| `SESSION_SECRET` | Long random secret signing the session cookie |
| `ADMIN_PASSWORD_HASH` | SHA-256 hex of the admin password (never the password itself) |

Generate values:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').createHash('sha256').update('YOUR_PASSWORD').digest('hex'))"
```

**Local dev only:** if `ADMIN_PASSWORD_HASH` is unset and
`NODE_ENV=development`, the login accepts `admin123` and prints a loud
warning. In production without a hash, login always fails (fail closed).

## Local development

```bash
npm install
npm run dev        # http://localhost:3000 -> redirects to /admin
```

Open `/admin/login` (dev password `admin123` unless you set
`ADMIN_PASSWORD_HASH`). Create a site, edit it, publish it, and open
`/s/<slug>`. Data is stored under `data/` (gitignored).

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel (Framework Preset: Next.js).
3. Create a Blob store in the Vercel dashboard (Storage tab) and connect
   it to the project — this provides `BLOB_READ_WRITE_TOKEN`.
4. Set environment variables: `BLOB_READ_WRITE_TOKEN` (from the store),
   `SESSION_SECRET`, `ADMIN_PASSWORD_HASH` (see above).
5. Deploy. No domain is configured by this repo itself — your Vercel
   project URL is the app URL, and public client sites live at
   `<your-app-url>/s/<slug>`. Custom domains/subdomains can be added in
   Vercel later; the slug system already isolates sites, so a future
   custom-domain mapping only needs a slug lookup by host.

## Testing

```bash
npm run build      # must pass with zero TypeScript errors
npm run smoke      # exercises the real store + renderer (see TESTING.md)
```

Acceptance criteria are mapped to verification steps in `TESTING.md`.

## Security notes

- Secrets (`BLOB_READ_WRITE_TOKEN`, `SESSION_SECRET`,
  `ADMIN_PASSWORD_HASH`) live only in server-side env vars — never in
  browser code.
- Uploads are validated server-side (type + size) before storage.
- External link URLs must be `http(s)`; anything else renders as plain
  content, never as a link.
- WhatsApp links are built server-side from digits only; the visitor
  reviews any prefilled message before sending — nothing is auto-sent.
- Middleware enforces auth on admin pages and API routes; public pages
  read published configs directly from the store (no public write API).
