/*
 * Site behaviour. Everything runs from R1.init(), which the gate calls once
 * the page content has been decrypted and inserted — so nothing here may
 * assume the markup exists at load time.
 */

window.R1 = (function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initScrollDirection() {
    var lastY = window.scrollY;
    var root = document.documentElement;
    root.setAttribute("data-scroll-dir", "down");

    window.addEventListener(
      "scroll",
      function () {
        var y = window.scrollY;
        if (Math.abs(y - lastY) < 6) return;
        root.setAttribute("data-scroll-dir", y > lastY ? "down" : "up");
        lastY = y;
      },
      { passive: true }
    );
  }

  /* Reveal on the way down, hide again on the way back up. The observer
     toggles both ways on purpose — sections re-animate every pass. */
  function initReveal() {
    var targets = document.querySelectorAll("[data-reveal]");
    if (!targets.length) return;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) {
        el.classList.add("is-in");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) entry.target.classList.add("is-in");
          else entry.target.classList.remove("is-in");
        });
      },
      { rootMargin: "-6% 0px -10% 0px", threshold: 0.06 }
    );

    targets.forEach(function (el) {
      observer.observe(el);
    });
  }

  function initNav() {
    var nav = document.querySelector("[data-nav]");
    if (!nav) return;

    var hero = document.querySelector(".hero");
    var toggle = nav.querySelector("[data-nav-toggle]");

    function update() {
      var y = window.scrollY;
      var navHeight = nav.offsetHeight;

      if (hero) {
        var overHero = y < hero.offsetHeight - navHeight - 8;
        nav.classList.toggle("nav--over-hero", overHero);
        nav.classList.toggle("nav--solid", !overHero && y > 8);
      } else {
        nav.classList.toggle("nav--solid", y > 8);
      }
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    if (toggle) {
      toggle.addEventListener("click", function () {
        var open = nav.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });

      nav.querySelectorAll(".nav__links a").forEach(function (link) {
        link.addEventListener("click", function () {
          nav.classList.remove("is-open");
          toggle.setAttribute("aria-expanded", "false");
        });
      });
    }
  }

  /* Highlight the nav link for whichever section owns the viewport. */
  function initActiveSection() {
    var links = document.querySelectorAll("[data-nav-link]");
    var sections = document.querySelectorAll("[data-section]");
    if (!links.length || !sections.length || !("IntersectionObserver" in window)) return;

    var visible = {};

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          visible[entry.target.getAttribute("data-section")] = entry.isIntersecting
            ? entry.intersectionRatio
            : 0;
        });

        var best = null;
        var bestRatio = 0;
        Object.keys(visible).forEach(function (name) {
          if (visible[name] > bestRatio) {
            bestRatio = visible[name];
            best = name;
          }
        });

        links.forEach(function (link) {
          link.classList.toggle("is-active", link.getAttribute("data-nav-link") === best);
        });
      },
      { threshold: [0, 0.25, 0.5, 0.75] }
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  /* Scroll a section into view, allowing for the fixed nav.
     The easing is done by hand rather than with behavior:"smooth" — native
     smooth scrolling is silently ignored in some environments, and a nav link
     that does nothing is worse than one that jumps. */
  function scrollToEl(el, instant) {
    var nav = document.querySelector("[data-nav]");
    var offset = nav ? nav.offsetHeight : 0;
    var target = el.getBoundingClientRect().top + window.scrollY - offset;
    var max = document.documentElement.scrollHeight - window.innerHeight;

    if (target < 0) target = 0;
    if (target > max) target = max;

    // document.hidden: a background tab gets no animation frames, so tween
    // there and the page would sit at the wrong offset until it is focused.
    if (instant || reduceMotion || document.hidden) {
      window.scrollTo(0, target);
      return;
    }

    var start = window.scrollY;
    var distance = target - start;
    if (Math.abs(distance) < 2) return;

    var duration = Math.min(900, Math.max(340, Math.abs(distance) * 0.5));
    var startTime = null;
    var cancelled = false;

    function stop() {
      cancelled = true;
    }

    // A wheel or touch gesture during the animation hands control back.
    window.addEventListener("wheel", stop, { once: true, passive: true });
    window.addEventListener("touchstart", stop, { once: true, passive: true });

    function step(now) {
      if (startTime === null) startTime = now;
      var t = Math.min(1, (now - startTime) / duration);
      // easeInOutCubic
      var eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      window.scrollTo(0, start + distance * eased);

      if (t < 1 && !cancelled) requestAnimationFrame(step);
      else {
        window.removeEventListener("wheel", stop);
        window.removeEventListener("touchstart", stop);
      }
    }

    requestAnimationFrame(step);
  }

  /* In-page links are handled here rather than left to the browser: the
     native behaviour does nothing when the fragment already matches the URL,
     so clicking "Contact" a second time after scrolling away felt broken. */
  function initAnchors() {
    document.addEventListener("click", function (event) {
      var link = event.target.closest ? event.target.closest("a[href]") : null;
      if (!link) return;

      var href = link.getAttribute("href");
      var hashIndex = href.indexOf("#");
      if (hashIndex < 0) return;

      // Only same-document links: "#about", or "index.html#about" while on index.
      var path = href.slice(0, hashIndex);
      var onSamePage =
        path === "" ||
        path === location.pathname.split("/").pop() ||
        (path === "index.html" && /(^|\/)(index\.html)?$/.test(location.pathname));
      if (!onSamePage) return;

      var id = href.slice(hashIndex + 1);
      if (!id) return;

      var target = document.getElementById(id);
      if (!target) return;

      event.preventDefault();
      scrollToEl(target, false);
      history.pushState(null, "", "#" + id);
    });
  }

  function initSelect() {
    var select = document.querySelector("[data-select]");
    if (!select) return;

    var button = select.querySelector("[data-select-btn]");
    var valueEl = select.querySelector("[data-select-value]");
    var input = select.querySelector("[data-select-input]");
    var options = select.querySelectorAll(".select__opt");

    function close() {
      select.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
    }

    button.addEventListener("click", function (event) {
      event.stopPropagation();
      var open = select.classList.toggle("is-open");
      button.setAttribute("aria-expanded", open ? "true" : "false");
    });

    options.forEach(function (option) {
      option.addEventListener("click", function () {
        options.forEach(function (other) {
          other.setAttribute("aria-selected", "false");
        });
        option.setAttribute("aria-selected", "true");
        valueEl.textContent = option.getAttribute("data-value");
        button.setAttribute("data-chosen", "true");
        input.value = option.getAttribute("data-value");
        close();
      });
    });

    document.addEventListener("click", function (event) {
      if (!select.contains(event.target)) close();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") close();
    });
  }

  /* Submissions go to the Sheet Monkey endpoint on the form's action, which
     appends a row to the Google Sheet. Posted with fetch so the visitor stays
     on the page; if that is blocked, fall back to a normal form post, which
     always gets through but navigates away to Sheet Monkey's confirmation. */
  function initContactForm() {
    var form = document.querySelector("[data-contact-form]");
    if (!form) return;

    var note = form.querySelector("[data-form-note]");
    var submit = form.querySelector('button[type="submit"]');
    var submitLabel = submit ? submit.querySelector("[data-submit-label]") : null;
    var sending = false;

    function setNote(text) {
      if (note) note.textContent = text;
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (sending) return;

      if (typeof form.reportValidity === "function" && !form.reportValidity()) return;

      sending = true;
      if (submit) submit.disabled = true;
      if (submitLabel) submitLabel.textContent = "Sending…";
      setNote("Sending your message…");

      try {
        var response = await fetch(form.action, {
          method: "POST",
          body: new FormData(form),
          headers: { Accept: "application/json" },
        });

        if (!response.ok) throw new Error("HTTP " + response.status);

        form.reset();
        var chosen = form.querySelector("[data-select-value]");
        if (chosen) chosen.textContent = "Select one…";
        var chooser = form.querySelector("[data-select-btn]");
        if (chooser) chooser.removeAttribute("data-chosen");

        if (submitLabel) submitLabel.textContent = "Message sent";
        setNote("Thank you — we've got it, and one of us will come back to you personally.");
      } catch (err) {
        // Cross-origin or offline: let the browser post the form itself.
        setNote("Finishing up…");
        form.removeAttribute("data-contact-form");
        form.submit();
        return;
      } finally {
        sending = false;
      }
    });
  }

  function init() {
    initScrollDirection();
    initNav();
    initActiveSection();
    initAnchors();
    initSelect();
    initContactForm();
    // One frame later, so the first paint has the pre-reveal state to animate from.
    requestAnimationFrame(initReveal);
  }

  return { init: init, scrollToEl: scrollToEl };
})();
