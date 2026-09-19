/* Coral Auto Spa — site interactions */
(function () {
  "use strict";

  var header = document.getElementById("siteHeader");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Sticky header ---------- */
  function onScroll() {
    header.classList.toggle("is-stuck", window.scrollY > 30);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Full-screen mobile menu ---------- */
  var menu = document.getElementById("mobileMenu");
  var openBtn = document.getElementById("navToggle");
  var closeBtn = document.getElementById("navClose");

  function openMenu() {
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    openBtn.setAttribute("aria-expanded", "true");
    document.body.classList.add("is-locked");
    // The panel is visibility:hidden until styles flush, and a hidden element
    // cannot take focus — wait two frames before moving focus into it.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { closeBtn.focus(); });
    });
  }

  function closeMenu(restoreFocus) {
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    openBtn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("is-locked");
    // Always hand focus back to the control that opens the menu; a mouse click
    // does not reliably focus a button, so a remembered element is unreliable.
    if (restoreFocus) openBtn.focus();
  }

  openBtn.addEventListener("click", openMenu);
  closeBtn.addEventListener("click", function () { closeMenu(true); });

  menu.addEventListener("click", function (e) {
    if (e.target.closest("a")) closeMenu(false);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !menu.classList.contains("is-open")) return;
    closeMenu(true);
  });

  // Keep focus inside the menu while it is open.
  menu.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    var items = menu.querySelectorAll("a[href], button");
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 980 && menu.classList.contains("is-open")) closeMenu(false);
  });

  /* ---------- Desktop nav: sliding pill ---------- */
  var navList = document.getElementById("navList");
  var pill = navList ? navList.querySelector(".nav-pill") : null;
  var navLinks = navList ? Array.prototype.slice.call(navList.querySelectorAll("a")) : [];
  var activeLink = null;

  function placePill(link, isActive) {
    if (!pill || !link) return;
    var r = link.getBoundingClientRect();
    var base = navList.getBoundingClientRect();
    pill.style.width = r.width + "px";
    pill.style.transform = "translateX(" + (r.left - base.left) + "px)";
    pill.classList.add("is-on");
    pill.classList.toggle("is-active-pill", !!isActive);
  }

  function resetPill() {
    if (!pill) return;
    if (activeLink) {
      placePill(activeLink, true);
    } else {
      pill.classList.remove("is-on", "is-active-pill");
    }
  }

  navLinks.forEach(function (link) {
    link.addEventListener("mouseenter", function () { placePill(link, false); });
    link.addEventListener("focus", function () { placePill(link, false); });
  });
  if (navList) {
    navList.addEventListener("mouseleave", resetPill);
    navList.addEventListener("focusout", function (e) {
      if (!navList.contains(e.relatedTarget)) resetPill();
    });
  }
  window.addEventListener("resize", resetPill);

  /* ---------- Scroll spy ---------- */
  var sections = navLinks
    .map(function (a) {
      var id = a.getAttribute("href");
      return id && id.charAt(0) === "#" ? document.querySelector(id) : null;
    })
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (a) {
          var current = a.getAttribute("href") === "#" + entry.target.id;
          if (current) {
            a.setAttribute("aria-current", "true");
            activeLink = a;
          } else {
            a.removeAttribute("aria-current");
          }
        });
        if (!navList.matches(":hover")) resetPill();
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ---------- Reveal on scroll ---------- */
  var revealables = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var revealer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        setTimeout(function () { entry.target.classList.add("is-in"); }, i * 70);
        obs.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
    revealables.forEach(function (el) { revealer.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ---------- FAQ accordion ---------- */
  var faqList = document.getElementById("faqList");
  if (faqList) {
    faqList.addEventListener("click", function (e) {
      var btn = e.target.closest(".faq-q");
      if (!btn) return;
      var item = btn.closest(".faq-item");
      var willOpen = !item.classList.contains("is-open");

      faqList.querySelectorAll(".faq-item").forEach(function (other) {
        other.classList.remove("is-open");
        other.querySelector(".faq-q").setAttribute("aria-expanded", "false");
      });

      if (willOpen) {
        item.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  }

  /* ---------- Booking form ---------- */
  var form = document.getElementById("bookForm");
  var status = document.getElementById("formStatus");

  function showStatus(message, ok) {
    status.textContent = message;
    status.className = "form-status is-visible " + (ok ? "is-ok" : "is-error");
  }

  // Package buttons preselect the service dropdown.
  document.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-package]");
    if (!trigger || !form) return;
    var wanted = trigger.getAttribute("data-package");
    var select = form.elements.service;
    if (!select) return;
    Array.prototype.forEach.call(select.options, function (opt) {
      if (opt.value === wanted || opt.text === wanted) select.value = opt.value || opt.text;
    });
  });

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      if (!form.checkValidity()) {
        showStatus("Please fill in your name, phone, email and package.", false);
        var firstInvalid = form.querySelector(":invalid");
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      var original = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";

      var payload = {};
      new FormData(form).forEach(function (value, key) { payload[key] = value; });

      fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
        .then(function (r) {
          if (!r.ok) throw new Error(r.data && r.data.error ? r.data.error : "Request failed");
          showStatus(r.data.message || "Thanks! We'll be in touch shortly to confirm.", true);
          form.reset();
        })
        .catch(function () {
          showStatus("Something went wrong. Please call (555) 012-7278 and we'll get you booked.", false);
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.innerHTML = original;
        });
    });
  }

  /* ---------- Footer year ---------- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
