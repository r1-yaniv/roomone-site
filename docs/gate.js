/*
 * Access gate.
 *
 * The page content is not in this document as markup — it ships as an
 * AES-256-GCM ciphertext and is only turned back into HTML in the browser,
 * with a key derived from the access key the visitor types. Viewing source,
 * disabling JavaScript or fetching the file directly yields ciphertext,
 * which is the point: on a static host there is no server to ask.
 *
 * Build the payload with build.mjs — the access key itself is never stored
 * in this repository or in the deployed files.
 */

(function () {
  "use strict";

  var STORAGE_KEY = "r1.access.v1";
  var payloadEl = document.getElementById("payload");
  var siteEl = document.getElementById("site");
  var gateEl = document.getElementById("gate");
  var panelEl = gateEl.querySelector(".gate__panel");
  var formEl = document.getElementById("gate-form");
  var inputEl = document.getElementById("gate-input");
  var msgEl = document.getElementById("gate-msg");

  var payload = JSON.parse(payloadEl.textContent);

  function fromBase64(value) {
    var raw = atob(value);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  function setMessage(text, state) {
    msgEl.textContent = text || "";
    if (state) msgEl.setAttribute("data-state", state);
    else msgEl.removeAttribute("data-state");
  }

  async function unlock(accessKey) {
    var keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(accessKey),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    var derived = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: fromBase64(payload.salt),
        iterations: payload.iterations,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    var plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(payload.iv) },
      derived,
      fromBase64(payload.content)
    );

    return new TextDecoder().decode(plain);
  }

  function reveal(html) {
    // The content appears long after load, so a browser-restored scroll
    // position would land in the wrong place — take it over.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";

    siteEl.innerHTML = html;
    siteEl.hidden = false;
    gateEl.hidden = true;
    document.body.classList.remove("is-locked");

    if (window.R1 && typeof window.R1.init === "function") window.R1.init();

    // Honour a deep link (index.html#contact) once the content exists. The jump
    // must be explicit: the target did not exist when the browser handled the
    // fragment, and "auto" would inherit the stylesheet's smooth scrolling and
    // animate 3000px on load.
    if (location.hash.length > 1) {
      var target = document.getElementById(location.hash.slice(1));
      if (target) {
        var jump = function () {
          // Not requestAnimationFrame: a page opened in a background tab gets
          // no frames, and the jump has to be done by the time it is looked at.
          window.R1.scrollToEl(target, true);
        };

        // Wait for the webfonts, or the text reflows under us and the jump
        // lands a hundred-odd pixels short.
        if (document.fonts && document.fonts.ready) {
          var settled = false;
          document.fonts.ready.then(function () {
            if (!settled) {
              settled = true;
              jump();
            }
          });
          setTimeout(function () {
            if (!settled) {
              settled = true;
              jump();
            }
          }, 1200);
        } else {
          jump();
        }
      }
    }
  }

  function showGate() {
    gateEl.hidden = false;
    document.body.classList.add("is-locked");
    setTimeout(function () {
      inputEl.focus();
    }, 120);
  }

  async function attempt(accessKey, remember) {
    var html;
    try {
      html = await unlock(accessKey);
    } catch (err) {
      return false;
    }
    if (remember) {
      try {
        localStorage.setItem(STORAGE_KEY, accessKey);
      } catch (err) {
        /* private browsing — fine, they re-enter it next time */
      }
    }
    reveal(html);
    return true;
  }

  formEl.addEventListener("submit", async function (event) {
    event.preventDefault();
    var value = inputEl.value.trim();
    if (!value) return;

    setMessage("Checking…");
    var ok = await attempt(value, true);
    if (!ok) {
      setMessage("That key doesn't work", "error");
      panelEl.classList.remove("is-wrong");
      void panelEl.offsetWidth;
      panelEl.classList.add("is-wrong");
      inputEl.select();
    }
  });

  // Already unlocked in this browser? Go straight in.
  var stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    stored = null;
  }

  if (stored) {
    attempt(stored, false).then(function (ok) {
      if (!ok) {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch (err) {
          /* ignore */
        }
        showGate();
      }
    });
  } else {
    showGate();
  }
})();
