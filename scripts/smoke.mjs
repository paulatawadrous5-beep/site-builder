/**
 * Smoke test for the site-builder app.
 *
 * Runs WITHOUT a dev server: it compiles src/lib + the public renderer with
 * the project's own TypeScript compiler, then exercises the REAL store
 * module against a throwaway local data directory, and renders the REAL
 * SiteRenderer with react-dom/server to prove empty/disabled sections are
 * omitted from the public HTML.
 *
 * Usage: npm run smoke
 * Exit code 0 = all checks passed, 1 = any check failed.
 */

import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, ".smoke-src");
const OUT = path.join(ROOT, ".smoke-build");

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) {
    console.log(`PASS: ${name}`);
  } else {
    failures++;
    console.log(`FAIL: ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
async function expectThrow(name, fn, status) {
  try {
    await fn();
    check(name, false, "expected an error but none was thrown");
  } catch (err) {
    check(name, err && err.status === status, `got ${err && err.status}: ${err && err.message}`);
  }
}

function main() {
  // ---- Stage 1: compile real sources -------------------------------------
  fs.rmSync(SRC, { recursive: true, force: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(SRC, "lib"), { recursive: true });
  fs.mkdirSync(path.join(SRC, "components"), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, "src", "lib"))) {
    if (f.endsWith(".ts")) {
      let src = fs.readFileSync(path.join(ROOT, "src", "lib", f), "utf-8");
      src = src.replace(/@\/lib\//g, "./");
      fs.writeFileSync(path.join(SRC, "lib", f), src);
    }
  }
  let renderer = fs.readFileSync(path.join(ROOT, "src", "components", "SiteRenderer.tsx"), "utf-8");
  renderer = renderer.replace(/@\/lib\//g, "../lib/");
  fs.writeFileSync(path.join(SRC, "components", "SiteRenderer.tsx"), renderer);

  execSync(
    `npx tsc --outDir ${OUT} --rootDir ${SRC} --module commonjs --moduleResolution node ` +
      `--target es2022 --jsx react-jsx --esModuleInterop --skipLibCheck --strict false ${SRC}/lib/*.ts ${SRC}/components/*.tsx`,
    { cwd: ROOT, stdio: "pipe" },
  );

  // ---- Stage 2: run checks against a throwaway local store ---------------
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "site-builder-smoke-"));
  process.env.SITE_BUILDER_DATA_DIR = tmp;
  delete process.env.BLOB_READ_WRITE_TOKEN;

  const store = require(path.join(OUT, "lib", "store.js"));
  const React = require("react");
  const { renderToString } = require("react-dom/server");
  const SiteRenderer = require(path.join(OUT, "components", "SiteRenderer.js")).default;

  return (async () => {
    // 1. Fresh store starts empty — no seeded sample sites.
    const fresh = await store.listSites();
    check("fresh store starts with zero sites (no seeded data)", fresh.length === 0, `got ${fresh.length}`);

    // 2. Create three sites.
    const a = await store.createSite({ name: "Restaurant A", slug: "restaurant-a" });
    const b = await store.createSite({ name: "Shop B", slug: "shop-b" });
    const c = await store.createSite({ name: "Clinic C", slug: "clinic-c" });
    check(
      "create 3 sites with unique ids, all draft",
      new Set([a.id, b.id, c.id]).size === 3 && [a, b, c].every((s) => s.status === "draft"),
    );

    // 3. Slug uniqueness is enforced.
    await expectThrow("duplicate slug rejected with 409", () => store.createSite({ name: "Copy", slug: "restaurant-a" }), 409);
    await expectThrow(
      "renaming onto another site's slug rejected with 409",
      () => store.updateSite(b.id, { slug: "restaurant-a" }),
      409,
    );

    // 4. Editing one site does not change the others.
    await store.updateSite(a.id, { name: "Restaurant A Renamed" });
    const bAfter = await store.getSite(b.id);
    const cAfter = await store.getSite(c.id);
    check("editing one site leaves others untouched", bAfter.name === "Shop B" && cAfter.name === "Clinic C");

    // 5. Duplicate works and is independent.
    const dup = await store.duplicateSite(a.id);
    check(
      "duplicate gets a new id, '<slug>-copy' slug, draft status",
      dup && dup.id !== a.id && dup.slug === "restaurant-a-copy" && dup.status === "draft" && dup.name.includes("(copy)"),
      dup ? `slug=${dup.slug}` : "null",
    );

    // 6. Publish / unpublish / archive cycle.
    await store.updateSite(b.id, { status: "published" });
    check("publish works", (await store.getSite(b.id)).status === "published");
    await store.updateSite(b.id, { status: "draft" });
    check("unpublish works", (await store.getSite(b.id)).status === "draft");
    await store.updateSite(b.id, { status: "archived" });
    check("archive works", (await store.getSite(b.id)).status === "archived");

    // 7. Slug change keeps working.
    await store.updateSite(a.id, { slug: "restaurant-a-new" });
    check("slug change resolves by new slug", (await store.getSiteBySlug("restaurant-a-new"))?.id === a.id);
    check("old slug no longer resolves", (await store.getSiteBySlug("restaurant-a")) === null);

    // 8. Delete works.
    check("delete removes the site", (await store.deleteSite(c.id)) === true && (await store.getSite(c.id)) === null);

    // 9. Renderer omits empty/disabled sections — no containers, no placeholders.
    const base = await store.getSite(a.id);
    const emptyConfig = {
      ...base,
      theme: base.theme,
      sections: [
        { id: "h-disabled", type: "header", enabled: false, imageUrl: "https://example.com/should-not-appear.png", align: "center" },
        { id: "h-noimg", type: "header", enabled: true, align: "center" },
        { id: "car-empty", type: "carousel", enabled: true, images: [], autoplay: false, durationMs: 4000, transition: "slide", showArrows: true, showDots: true },
        { id: "vid-empty", type: "video", enabled: true, provider: "youtube", aspectRatio: "16/9" },
        { id: "contact-empty", type: "contact", enabled: true, heading: "Contact us", actions: [] },
        { id: "rows-empty", type: "iconRows", enabled: true, rows: [{ id: "row-empty", icons: [] }] },
        {
          id: "rows-one",
          type: "iconRows",
          enabled: true,
          rows: [
            {
              id: "row-one",
              icons: [
                { id: "ic-1", imageUrl: "https://example.com/fb.png", label: "Facebook", labelEnabled: true, url: "https://facebook.com/x", urlEnabled: true, openInNewTab: true, shape: "circle" },
                { id: "ic-2", imageUrl: "https://example.com/ig.png", label: "NoLink", labelEnabled: true, url: "", urlEnabled: false, openInNewTab: false, shape: "square" },
              ],
            },
          ],
        },
      ],
    };
    const html = renderToString(React.createElement(SiteRenderer, { config: emptyConfig }));
    check("disabled header image does not render", !html.includes("should-not-appear.png"));
    check("header without image renders nothing", !html.includes("Business header"));
    check("empty carousel renders nothing", !html.includes("Promotional offers"));
    check("video without URL renders nothing", !html.includes("<video") && !html.includes("<iframe"));
    check("contact with no actions renders nothing", !html.includes("Contact us"));
    check("icon row with content renders (label + link)", html.includes("Facebook") && html.includes("https://facebook.com/x"));
    check("icon without URL is not a link (exactly one <a> href: the Facebook link)", (html.match(/<a[^>]*href="/g) || []).length === 1);

    // 10. Positive render: real content appears.
    const fullConfig = {
      ...base,
      sections: [
        { id: "h1", type: "header", enabled: true, imageUrl: "https://example.com/logo.png", alt: "Logo", align: "center" },
        { id: "c1", type: "contact", enabled: true, heading: "Get in touch", actions: [{ id: "a1", kind: "whatsapp", phone: "+1 555 123 4567", label: "WhatsApp", shape: "rounded" }] },
      ],
    };
    const html2 = renderToString(React.createElement(SiteRenderer, { config: fullConfig }));
    check("real header image renders", html2.includes("https://example.com/logo.png"));
    check("whatsapp link uses digits-only wa.me URL", html2.includes("https://wa.me/15551234567"));

    console.log(failures === 0 ? "\nSMOKE: ALL CHECKS PASSED" : `\nSMOKE: ${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  })();
}

main();
