/*
 * Builds docs/ (what GitHub Pages serves) from src/ and assets/.
 *
 * Each page's markup is encrypted with the access key, so the published files
 * contain ciphertext instead of content. Nothing is written to docs/ that
 * reveals the key.
 *
 *   ACCESS_KEY="the key" node build.mjs
 */

import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src");
const out = join(root, "docs");

const ITERATIONS = 250000;

const accessKey = process.env.ACCESS_KEY;
if (!accessKey) {
  console.error(
    "ACCESS_KEY is not set.\n\n" +
      '  ACCESS_KEY="your access key" node build.mjs\n'
  );
  process.exit(1);
}

/* ---------- shared snippets ---------- */

const icon = (body, size = 16, extra = "") =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;

const LOGO_MARK = `<svg class="logo__mark" viewBox="0 0 830 818" fill="currentColor" aria-hidden="true"><rect x="0" y="0" width="830" height="47"/><rect x="0" y="0" width="45" height="818"/><rect x="784" y="0" width="46" height="818"/><rect x="0" y="775" width="543" height="43"/><rect x="255" y="223" width="288" height="56"/><rect x="485" y="135" width="58" height="108"/><path d="M487 226L487 135L257 226Z"/><path fill-rule="evenodd" d="M384 270H543V818H384ZM504 530A30 30 0 1 1 444 530A30 30 0 1 1 504 530Z"/></svg>`;

const SILHOUETTE = `<svg width="150" height="160" viewBox="0 0 150 160" fill="currentColor" aria-hidden="true"><circle cx="75" cy="52" r="34"/><path d="M75 96c30 0 52 21 52 47v17H23v-17c0-26 22-47 52-47Z"/></svg>`;

const tokens = {
  LOGO_MARK,
  SIL: SILHOUETTE,
  ARROW_RIGHT: icon('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),
  ARROW_LEFT: icon('<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>'),
  CHEVRON_RIGHT: icon('<path d="m9 18 6-6-6-6"/>'),
  CHEVRON_DOWN: icon('<path d="m6 9 6 6 6-6"/>', 18),
  MAIL: icon(
    '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-9.1 5.8a2 2 0 0 1-2.2 0L2 7"/>',
    22
  ),
  SEND: icon('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
  LOCK: icon(
    '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    14
  ),
  LOCK_LG: icon(
    '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    30
  ),
  /* Balance scale — the mockup's "handshake" glyph, redrawn from shapes that
     read at 24px instead of turning to mush. */
  SCALE: icon(
    '<path d="M12 4v16"/><path d="M6 8h12"/><path d="m6 8-3.5 7h7Z"/><path d="m18 8-3.5 7h7Z"/><path d="M8 20h8"/>',
    24
  ),
  LANDMARK: icon(
    '<path d="M3 21h18"/><path d="M5 21V10"/><path d="M12 21V10"/><path d="M19 21V10"/><path d="m3 10 9-6 9 6Z"/>',
    17
  ),
  BUILDING: icon(
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M2 22h20"/><path d="M10 7h4"/><path d="M10 12h4"/><path d="M10 17h4"/>',
    17
  ),
  HANDSHAKE: icon(
    '<path d="M7 11 3.5 7.5a2.1 2.1 0 0 1 3-3L10 8"/><path d="m17 11 3.5-3.5a2.1 2.1 0 0 0-3-3L14 8"/><path d="M8 9.5 12 13l4-3.5"/><path d="M12 13v6"/><path d="M8 19h8"/>',
    17
  ),
  DASHED: icon('<circle cx="12" cy="12" r="9" stroke-dasharray="4 3.4"/>', 17),
};

const applyTokens = (html, extra = {}) => {
  const all = { ...tokens, ...extra };
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(all, name) ? all[name] : match
  );
};

/* ---------- encryption ---------- */

function encrypt(plaintext) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(accessKey, salt, ITERATIONS, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    v: 1,
    iterations: ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    // WebCrypto expects the GCM tag appended to the ciphertext.
    content: Buffer.concat([body, cipher.getAuthTag()]).toString("base64"),
  };
}

/* ---------- pages ---------- */

const pages = [
  { file: "index.html", title: "RoomOne Ventures — the embedded venture firm", chrome: true },
  { file: "faq.html", title: "FAQ — RoomOne Ventures", chrome: true },
  { file: "team.html", title: "Our story — RoomOne Ventures", chrome: true },
  { file: "admin.html", title: "Admin — RoomOne Ventures", chrome: false },
];

const layout = await readFile(join(src, "layout.html"), "utf8");
const navPartial = await readFile(join(src, "partials", "nav.html"), "utf8");
const footerPartial = await readFile(join(src, "partials", "footer.html"), "utf8");

/* Content hashes for styles.css / app.js / gate.js. GitHub Pages serves assets
   with a ten minute cache, so without these a redeploy can leave a visitor on
   old JavaScript against a new payload. */
const assetVersions = {};
for (const file of ["styles.css", "app.js", "gate.js"]) {
  const body = await readFile(join(src, file));
  assetVersions[file] = createHash("sha256").update(body).digest("hex").slice(0, 8);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const page of pages) {
  const isHome = page.file === "index.html";
  const homeTokens = {
    // On the one-pager the section links must stay same-document fragments,
    // or the browser reloads the page (and re-locks it) on every nav click.
    HOME: isHome ? "" : "index.html",
    HOME_HREF: isHome ? "#top" : "index.html",
  };

  let content = await readFile(join(src, "pages", page.file), "utf8");
  content = content
    .replace("{{NAV}}", page.chrome ? navPartial : "")
    .replace("{{FOOTER}}", page.chrome ? footerPartial : "");
  content = applyTokens(content, homeTokens);

  const payload = encrypt(content.trim());
  const html = applyTokens(layout, {
    TITLE: page.title,
    PAYLOAD: JSON.stringify(payload),
    V_CSS: assetVersions["styles.css"],
    V_APP: assetVersions["app.js"],
    V_GATE: assetVersions["gate.js"],
  });

  await writeFile(join(out, page.file), html, "utf8");
  console.log(
    `${page.file.padEnd(12)} ${(payload.content.length / 1024).toFixed(1)} KB encrypted`
  );
}

/* ---------- static files ---------- */

for (const file of ["styles.css", "app.js", "gate.js"]) {
  await cp(join(src, file), join(out, file));
}

await cp(join(root, "assets"), join(out, "assets"), { recursive: true });

// Unknown paths land on the gate rather than a GitHub 404.
await cp(join(out, "index.html"), join(out, "404.html"));

await writeFile(join(out, ".nojekyll"), "", "utf8");
await writeFile(
  join(out, "robots.txt"),
  "User-agent: *\nDisallow: /\n",
  "utf8"
);

const assets = await readdir(join(out, "assets"));
console.log(`\nassets       ${assets.length} files`);
console.log(`output       docs/`);
