# RoomOne Ventures website

Static site built from the Pencil mockup in Marketing/Website/r1-site.pen. No framework, no dependencies — plain HTML, CSS and JavaScript, built by one Node script and served by GitHub Pages out of the docs/ folder.

Home, How it works, About us, FAQ and Contact are one continuous scrolling page (index.html), matching the five frames numbered 1 in the mockup. Admin is the only separate page, matching frame 2. Scroll reveals are deliberately limited to the hero, the how-it-works diagram and the closing band.

The whole site is locked behind an access key until launch. See "How the lock works" below — it is not a cosmetic overlay.

## Layout

    src/layout.html        page shell: head, the access gate, the encrypted payload slot
    src/pages/*.html       page content — this is what gets encrypted
    src/partials/          nav and footer, shared by every page with chrome
    src/styles.css         all styling; design tokens at the top mirror the .pen variables
    src/app.js             nav, scroll reveal, eased in-page scrolling, custom select, contact form
    src/gate.js            access key entry, key derivation, decryption, content injection
    assets/                logo, favicon, hero photo, headshots
    build.mjs              the build
    docs/                  build output — this is what GitHub Pages serves. Do not edit by hand.

## Build

Node 18 or newer, nothing to install.

    ACCESS_KEY="the access key" npm run build

That writes docs/ from scratch every time. The access key is never written into the repo or into the output, so anyone rebuilding needs to be told what it is.

To preview locally:

    python3 -m http.server 8765 --directory docs

then open http://localhost:8765 — note that browsers cache aggressively over plain HTTP, so use a hard reload after a rebuild.

## How the lock works

GitHub Pages has no server-side logic, so a login form that merely hides a div is decoration — the content still sits in the HTML for anyone who views source. Instead:

- Each page's markup is encrypted at build time with AES-256-GCM. The key comes from the access key through PBKDF2-SHA256, 250,000 iterations, with a random salt per page.
- The published file contains only ciphertext, the salt, the initialisation vector and the iteration count. There is no copy of the key and no hash of it to attack offline more cheaply than the derivation allows.
- The browser derives the key from what the visitor types and decrypts in place. A wrong key fails the GCM authentication tag, so there is nothing to bypass by editing the DOM.
- A correct key is remembered in localStorage, so moving between pages does not ask again.

What this does not protect against: anyone who has the key can share it, and anyone who has already loaded a page can save the decrypted HTML. It stops the site from being readable before launch, which is what it is for.

To change the key, rebuild with the new value and redeploy. Visitors holding the old key are dropped back to the gate automatically.

## Deploying

GitHub Pages is configured to serve the main branch, docs/ folder. Deployment is therefore just:

    ACCESS_KEY="the access key" npm run build
    git add -A && git commit -m "Update site" && git push

Pages serves assets with a ten minute cache. styles.css, app.js and gate.js are referenced with a content hash in the query string so a redeploy can never leave a visitor running old JavaScript against a new payload. The HTML itself can still be up to ten minutes stale.

robots.txt disallows everything and every page sends noindex, so nothing is indexed while the site is locked. Both should be relaxed at launch.

## Notes for launch

- The contact form posts to Sheet Monkey, which appends a row to the Google Sheet behind it. The endpoint is the form's action attribute in src/pages/index.html; the submit handler in src/app.js reads it from there, so changing sheets is a one-line edit. Field names are Name, Email, Role and Message, and Sheet Monkey matches those to the sheet's column headers — rename the fields if the headers ever change. Submissions go through fetch so the visitor stays on the page; if that is ever blocked the handler falls back to a normal form post, which lands on Sheet Monkey's own confirmation page instead.
- The hero photograph is from Unsplash. Replace assets/hero-room.jpg with a RoomOne photograph when one exists — the CSS crops to a wide band, so a landscape original works best.
- The founder headshots carry a small RoomOne watermark baked into the source files. Unwatermarked versions would look cleaner behind the name plate.
- The two partner cards are deliberately anonymous silhouettes, as in the mockup.
- Remove the noindex meta from src/layout.html, open up robots.txt, and delete the gate markup and gate.js from src/layout.html when the site goes public. At that point build.mjs can write page content straight through instead of encrypting it.
