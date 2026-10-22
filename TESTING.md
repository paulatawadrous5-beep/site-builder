# Testing — acceptance criteria mapping

How each of the 25 acceptance criteria from the build brief was verified,
and what still needs a manual (browser) check. Automated evidence:
`npm run build` (zero TypeScript errors) and `npm run smoke` (21 checks,
all passing — see `scripts/smoke.mjs`, which exercises the real store
module and renders the real `SiteRenderer` with `react-dom/server`).
Live HTTP evidence: dev-server curl checks run 2026-10-22 (see below).

## Automated + live-verified

| # | Criterion | Verification |
|---|---|---|
| 1 | Create three separate client websites | Smoke: creates 3 sites via the real store (unique ids, all draft). Live: created a site via `POST /api/sites` (201). |
| 2 | Each website has a unique public URL | Slug uniqueness enforced server-side: smoke (409 on duplicate slug) + live curl (409). Public URL = `/s/<slug>`. |
| 3 | Editing one website does not change others | Smoke: rename site A, sites B and C verified unchanged. |
| 4 | Transparent PNG logo preserves transparency | Renderer serves the uploaded file as-is (`<img>`, never flattened) with the header `bgColor` behind it. Upload accepts PNG. *Manual check remaining: view a transparent PNG on a published page.* |
| 5 | Upload and reorder multiple promotional images | Editor carousel: add/remove/reorder (move up/down) + upload via `/api/upload`. *Manual UI check remaining.* |
| 6 | Add a video and verify it appears | Renderer: YouTube watch URLs convert to embeds; uploads render `<video controls>` (never autoplay with sound). *Manual UI check remaining.* |
| 7 | Remove the video → entire video section disappears | Smoke: video section without a URL renders nothing (no `<video>`, no `<iframe>`, no container). |
| 8 | Rows of 1, then 2, then 4 icons | Editor allows arbitrary rows; renderer grids any icon count. Smoke renders a 2-icon row. *Manual UI check for the 1→2→4 sequence.* |
| 9 | Another 1-icon row after the 4-icon row | Same mechanism (rows are an ordered array, no fixed sequence). *Manual UI check.* |
| 10 | Independently change shape, image, label, URL per icon | Editor per-icon controls (image, label, URL, shape, size, toggles). *Manual UI check.* |
| 11 | Clicking an icon opens the correct destination | Smoke: valid URL renders `<a href="…">`; renderer uses `target="_blank"` when configured. *Manual click check.* |
| 12 | Contact Us with only WhatsApp | Editor allows any action subset; renderer renders only configured actions. Smoke: WhatsApp link verified (`wa.me` digits-only). *Manual UI check for WhatsApp-only.* |
| 13 | Add Call and Copy actions later | Editor add-action (call/copy/whatsapp). *Manual UI check.* |
| 14 | Call button initiates a call (`tel:`) | Renderer builds `tel:` links from the configured number. *Manual device check.* |
| 15 | Copy button copies the correct number | Renderer uses `navigator.clipboard` with a textarea+`execCommand` fallback and success/failure text. *Manual browser check.* |
| 16 | WhatsApp button opens the correct conversation | Smoke: `https://wa.me/<digits-only>` verified in rendered HTML. |
| 17 | Remove the entire Contact Us section | Delete/disable a section; smoke: contact with no actions renders nothing. *Manual UI check.* |
| 18 | Change background to a custom gradient | Theme editor: gradient stops + direction; renderer emits `linear-gradient(...)`. *Manual UI check.* |
| 19 | Reorder sections; published site reflects the order | Editor drag/move; renderer renders `sections` in saved order. *Manual UI check.* |
| 20 | Save a change → appears on the existing public URL | Public page reads the latest saved config from the store on every request (no rebuild). Live: publish/unpublish toggled public rendering (200/404). *Manual content-edit check.* |
| 21 | Refreshing the public page keeps content | Public page is server-rendered from the store; no client-side state. *Manual check.* |
| 22 | Public URL in another browser is not empty | Server-rendered from the store; live curl returned 200 for a published site; smoke renders real content (header image, contact) into HTML. |
| 23 | Unpublished sites are not exposed | Live curl: draft site → 404; after unpublish → 404 again. Smoke: draft/archived status cycle. |
| 24 | Unauthorized visitors cannot edit | Live curl: `/admin` → 307 to `/admin/login` when logged out; unauthenticated API write and read → 401. Middleware protects `/admin` and `/api/*`. |
| 25 | Works on mobile and desktop | Mobile-first responsive renderer + editor preview widths (Desktop/Tablet/Mobile). *Manual device check remaining.* |

## Live HTTP checks run 2026-10-22 (dev server, local backend)

```
/admin (logged out)            -> 307 -> /admin/login
POST /api/sites (no auth)      -> 401
GET  /api/sites (no auth)      -> 401
POST /api/auth/login (dev pw)  -> 200 (cookie set)
POST /api/sites (authed)       -> 201 (full SiteConfig JSON)
/s/smoke-shop (draft)          -> 404
POST publish -> published       -> 200 ; /s/smoke-shop -> 200
POST /api/sites duplicate slug -> 409
POST /api/upload (text file as image) -> 400
GET  /admin (authed)           -> 200
POST publish -> draft          -> 200 ; /s/smoke-shop -> 404
DELETE /api/sites/[id]         -> 200 (test site removed; store left empty)
```

## Bugs found and fixed during verification

1. **Edge runtime vs Node `crypto` (critical, fixed):** the first
   `lib/auth.ts` used Node's `crypto` module, which the Edge runtime
   (middleware) does not support — authed requests crashed with a 500.
   Rewrote auth on the Web Crypto API (`crypto.subtle`), which works in
   both runtimes. Re-verified by the live checks above.
2. **Middleware matcher missed exact `/admin`** (fixed): the matcher only
   covered `/admin/:path*`, so `/admin` itself rendered without auth.
   Matcher now includes `/admin`.

## Known limitations (honest)

- **Vercel Blob path is implemented but not live-tested here:** this
  environment has no `BLOB_READ_WRITE_TOKEN`, so all storage tests ran
  against the local JSON backend. The Blob code path (same `store.ts`
  interface) needs one live check after Vercel deploy: create a site,
  upload an image, reload — data must persist.
- **No automated browser E2E tests:** the build environment has no
  browser; editor interactions (drag reorder, uploads via UI, clipboard,
  video playback, mobile rendering) are manual checks listed above.
- **Editor undo granularity:** undo steps back per keystroke in text
  inputs (acceptable for v1; keystroke coalescing is a follow-up).
- **Sticky panel offset** in the editor assumes a ~53px top bar; cosmetic
  only on very narrow screens.
- **Concurrency:** index updates serialize with an in-process mutex
  (fine for a single admin; not a distributed lock).
- **Custom domains:** not configured (by design). Public sites live at
  `<app-url>/s/<slug>`; a future host→slug mapping can be added without
  changing the data model.
