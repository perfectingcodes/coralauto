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
    if (!status) return;
    status.textContent = message;
    status.className = "form-status is-visible " + (ok ? "is-ok" : "is-error");
  }

  /* Seat count only matters when a seat shampoo is requested. */
  var seatCount = document.getElementById("seatCount");
  if (form && seatCount) {
    var seatBox = form.querySelector('input[value="Seat shampoo"]');
    var syncSeats = function () {
      seatCount.hidden = !seatBox.checked;
      if (!seatBox.checked) seatCount.querySelector("input").value = "";
    };
    seatBox.addEventListener("change", syncSeats);
    syncSeats();
  }

  /* ---------- Photo attachments ---------- */
  var MAX_FILES = 5;
  var MAX_BYTES = 5 * 1024 * 1024;
  var ALLOWED = ["image/jpeg", "image/png", "image/webp"];

  var fileInput = document.getElementById("photos");
  var previews = document.getElementById("photoPreviews");
  var dropzone = fileInput ? fileInput.closest(".dropzone") : null;
  var photos = [];   // { file, dataUrl }
  var photoError;

  function setPhotoError(msg) {
    if (!photoError) {
      photoError = document.createElement("p");
      photoError.className = "photo-error";
      photoError.setAttribute("role", "status");
      previews.insertAdjacentElement("afterend", photoError);
    }
    photoError.textContent = msg || "";
  }

  function renderPhotos() {
    previews.textContent = "";
    photos.forEach(function (p, i) {
      var li = document.createElement("li");
      var img = document.createElement("img");
      img.src = p.dataUrl;
      img.alt = p.file.name;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "photo-remove";
      btn.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-close"/></svg>';
      btn.setAttribute("aria-label", "Remove " + p.file.name);
      btn.addEventListener("click", function () {
        photos.splice(i, 1);
        renderPhotos();
        setPhotoError("");
      });
      li.appendChild(img);
      li.appendChild(btn);
      previews.appendChild(li);
    });
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error("read failed")); };
      reader.readAsDataURL(file);
    });
  }

  function addFiles(fileList) {
    var incoming = Array.prototype.slice.call(fileList);
    var problems = [];

    var queue = incoming.filter(function (f) {
      if (ALLOWED.indexOf(f.type) === -1) { problems.push(f.name + " is not a JPG, PNG or WebP."); return false; }
      if (f.size > MAX_BYTES) { problems.push(f.name + " is over 5MB."); return false; }
      return true;
    });

    if (photos.length + queue.length > MAX_FILES) {
      queue = queue.slice(0, Math.max(0, MAX_FILES - photos.length));
      problems.push("Up to " + MAX_FILES + " photos.");
    }

    Promise.all(queue.map(function (f) {
      return readFile(f).then(function (dataUrl) { photos.push({ file: f, dataUrl: dataUrl }); });
    })).then(function () {
      renderPhotos();
      setPhotoError(problems.join(" "));
    }).catch(function () {
      setPhotoError("One of those images could not be read. Try another.");
    });
  }

  if (fileInput && previews) {
    fileInput.addEventListener("change", function () {
      addFiles(fileInput.files);
      fileInput.value = "";   // allow re-picking the same file
    });

    ["dragenter", "dragover"].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        dropzone.classList.add("is-dragging");
      });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        dropzone.classList.remove("is-dragging");
      });
    });
    dropzone.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });
  }

  /* ---------- Step wizard ---------- */
  var steps = form ? Array.prototype.slice.call(form.querySelectorAll(".form-step")) : [];
  var dots = form ? Array.prototype.slice.call(form.querySelectorAll(".step-dot")) : [];
  var backBtn = document.getElementById("stepBack");
  var nextBtn = document.getElementById("stepNext");
  var submitBtn = document.getElementById("stepSubmit");
  var current = 0;
  var furthest = 0;

  function fieldOf(input) {
    return input.closest(".field") || input.parentElement;
  }

  function clearError(input) {
    var wrap = fieldOf(input);
    if (!wrap) return;
    wrap.classList.remove("has-error");
    var msg = wrap.querySelector(".field-error");
    if (msg) msg.remove();
    input.removeAttribute("aria-invalid");
  }

  function setError(input, message) {
    var wrap = fieldOf(input);
    if (!wrap) return;
    clearError(input);
    wrap.classList.add("has-error");
    input.setAttribute("aria-invalid", "true");
    var msg = document.createElement("span");
    msg.className = "field-error";
    msg.textContent = message;
    wrap.appendChild(msg);
  }

  /** Translated string with a hard-coded English fallback. */
  function tr(key, fallback, vars) {
    if (window.coral && window.coral.t) {
      var v = window.coral.t(key, vars);
      if (v && v !== key) return v;
    }
    return fallback;
  }

  function messageFor(input) {
    if (input.validity.valueMissing) {
      if (input.type === "date") return tr("book.errDate", "Pick a date that suits you.");
      if (input.name === "time") return tr("book.errTime", "Pick a rough time.");
      if (input.type === "checkbox") return tr("member.agree", "Please agree to continue.");
      return tr("book.errRequired", "This one is needed.");
    }
    if (input.validity.typeMismatch && input.type === "email") {
      return tr("book.errEmail", "That email does not look right.");
    }
    return tr("book.errRequired", "Please check this.");
  }

  /* Validate one step; returns true when it can be left.
     focusFirst is skipped when checking a step that is not on screen. */
  function validateStep(index, focusFirst) {
    var step = steps[index];
    var inputs = Array.prototype.slice.call(
      step.querySelectorAll("input, select, textarea")
    ).filter(function (el) { return el.type !== "file" && !el.disabled; });

    var firstBad = null;
    inputs.forEach(function (input) {
      // Skip fields inside a hidden wrapper (e.g. the seat count), but not
      // the step itself, which is hidden whenever it is not the current one.
      var hiddenWrap = input.closest("[hidden]");
      if (hiddenWrap && hiddenWrap !== step) { clearError(input); return; }

      if (input.checkValidity()) {
        clearError(input);
      } else {
        setError(input, messageFor(input));
        if (!firstBad) firstBad = input;
      }
    });

    if (firstBad) {
      if (focusFirst !== false) firstBad.focus();
      return false;
    }
    return true;
  }

  function paintDots() {
    dots.forEach(function (dot, i) {
      dot.classList.toggle("is-current", i === current);
      dot.classList.toggle("is-done", i < furthest && i !== current);
      var btn = dot.querySelector(".step-dot-btn");
      if (i === current) {
        dot.setAttribute("aria-current", "step");
      } else {
        dot.removeAttribute("aria-current");
      }
      // Only completed steps are navigable.
      btn.disabled = i > furthest;
    });
  }

  function goTo(index, focusTitle) {
    current = Math.max(0, Math.min(steps.length - 1, index));
    furthest = Math.max(furthest, current);

    steps.forEach(function (step, i) {
      var on = i === current;
      step.hidden = !on;
      step.classList.toggle("is-active", on);
      if (on) {
        step.classList.remove("is-entering");
        void step.offsetWidth;          // restart the enter animation
        step.classList.add("is-entering");
      }
    });

    backBtn.hidden = current === 0;
    nextBtn.hidden = current === steps.length - 1;
    submitBtn.hidden = current !== steps.length - 1;

    paintDots();

    if (focusTitle) {
      var title = steps[current].querySelector(".form-step-title");
      if (title) title.focus({ preventScroll: true });
    }
  }

  if (form && steps.length) {
    nextBtn.addEventListener("click", function () {
      if (!validateStep(current)) return;
      goTo(current + 1, true);
    });

    backBtn.addEventListener("click", function () { goTo(current - 1, true); });

    dots.forEach(function (dot, i) {
      dot.querySelector(".step-dot-btn").addEventListener("click", function () {
        if (i > furthest) return;
        // Moving forward through the bar still has to pass validation.
        if (i > current && !validateStep(current)) return;
        goTo(i, true);
      });
    });

    // Clear an error as soon as the person fixes it.
    form.addEventListener("input", function (e) {
      var el = e.target;
      if (el.matches("input, select, textarea") && fieldOf(el) &&
          fieldOf(el).classList.contains("has-error") && el.checkValidity()) {
        clearError(el);
      }
    });

    // Enter should advance rather than submit while steps remain.
    form.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      if (e.target.tagName === "TEXTAREA") return;
      if (current < steps.length - 1) {
        e.preventDefault();
        nextBtn.click();
      }
    });

    goTo(0, false);
  }

  /* ---------- Submit ---------- */
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      // Re-check every step, not just the visible one.
      for (var i = 0; i < steps.length; i++) {
        if (!validateStep(i, false)) {
          goTo(i, false);
          validateStep(i, true);   // now on screen, so focus can land
          showStatus(tr("book.errStep", "Something is missing on this step."), false);
          return;
        }
      }

      var original = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.textContent = tr("book.sending", "Sending\u2026");

      var fd = new FormData(form);
      var payload = {
        plan: fd.get("plan") || "combo",
        smsOptIn: fd.get("smsOptIn") === "yes",
        memberAgree: fd.get("memberAgree") === "yes",
        lang: (window.coral && window.coral.lang && window.coral.lang()) || "en",
        name: fd.get("name"),
        phone: fd.get("phone"),
        email: fd.get("email"),
        vehicle: fd.get("vehicle"),
        address: fd.get("address"),
        date: fd.get("date"),
        time: fd.get("time"),
        seats: fd.get("seats") || "",
        notes: fd.get("notes") || "",
        addons: fd.getAll("addons"),
        photos: photos.map(function (p) {
          return { name: p.file.name, type: p.file.type, data: p.dataUrl };
        })
      };

      fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
        .then(function (r) {
          if (!r.ok) throw new Error(r.data && r.data.error ? r.data.error : "Request failed");
          showStatus(r.data.message || tr("book.ok", "Thanks! We will be in touch shortly."), true);
          form.reset();
          photos = [];
          renderPhotos();
          setPhotoError("");
          if (seatCount) seatCount.hidden = true;
          furthest = 0;
          goTo(0, false);
        })
        .catch(function (err) {
          showStatus(err.message && err.message !== "Request failed"
            ? err.message
            : tr("book.errGeneric", "Something went wrong sending that."), false);
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.innerHTML = original;
        });
    });
  }

  /* ---------- Plan selection ---------- */
  /* Any "Join & book" or "Book a one-time detail" button anywhere on the page
     carries its choice into the form, so nobody has to explain it twice. */
  var planInputs = form ? Array.prototype.slice.call(form.querySelectorAll('input[name="plan"]')) : [];
  var memberTerms = document.getElementById("memberTerms");
  var memberAgree = document.getElementById("memberAgree");
  var submitLabel = document.getElementById("submitLabel");

  function selectedPlan() {
    var hit = planInputs.find(function (i) { return i.checked; });
    return hit ? hit.value : "combo";
  }

  function syncPlan() {
    var isMember = selectedPlan() === "membership";

    if (memberTerms) memberTerms.hidden = !isMember;
    if (memberAgree) {
      // Only required when they are actually enrolling.
      memberAgree.required = isMember;
      if (!isMember) {
        memberAgree.checked = false;
        clearError(memberAgree);
      }
    }
    if (submitLabel) {
      submitLabel.setAttribute("data-i18n", isMember ? "book.submitMember" : "book.submit");
      submitLabel.textContent = tr(
        isMember ? "book.submitMember" : "book.submit",
        isMember ? "Request Membership & Booking" : "Request Booking"
      );
    }
    // Slot length differs by plan, so the open times can change with it.
    loadSlots();
  }

  planInputs.forEach(function (input) {
    input.addEventListener("change", syncPlan);
  });

  /* The two half-vehicle options stay tucked away until asked for, so the form
     opens with two choices instead of four. */
  var choiceMore = document.getElementById("choiceMore");
  var halfChoices = form ? Array.prototype.slice.call(form.querySelectorAll(".choice-half")) : [];

  function showHalves(show) {
    halfChoices.forEach(function (el) { el.hidden = !show; });
    if (choiceMore) choiceMore.hidden = show;
  }

  if (choiceMore) {
    choiceMore.addEventListener("click", function () {
      showHalves(true);
      var first = halfChoices[0] && halfChoices[0].querySelector("input");
      if (first) first.focus();
    });
  }

  document.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-choice]");
    if (!trigger || !form) return;
    var wanted = trigger.getAttribute("data-choice");
    var input = planInputs.find(function (i) { return i.value === wanted; });
    if (!input) return;
    input.checked = true;
    if (wanted === "interiorOnly" || wanted === "exteriorOnly") showHalves(true);
    syncPlan();
    // The anchor still scrolls to #book; just make sure step one is showing.
    if (typeof goTo === "function") goTo(0, false);
  });

  /* ---------- Live availability ---------- */
  /* The time dropdown only ever offers slots that are genuinely open, so a
     preferred time is checked against the calendar before it is requested. */
  var dateInput = form ? form.elements.date : null;
  var timeSelect = document.getElementById("timeSelect");
  var slotNote = document.getElementById("slotNote");
  var slotToken = 0;

  function setSlotNote(text, warn) {
    if (!slotNote) return;
    slotNote.textContent = text || "";
    slotNote.classList.toggle("is-warn", Boolean(warn));
  }

  function loadSlots() {
    if (!dateInput || !timeSelect) return;
    var date = dateInput.value;
    if (!date) {
      timeSelect.innerHTML = '<option value=""></option>';
      setSlotNote("");
      return;
    }

    var mine = ++slotToken;
    setSlotNote(tr("slot.checking", "Checking open times…"));

    fetch("/api/availability?date=" + encodeURIComponent(date) + "&plan=" + encodeURIComponent(selectedPlan()))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (mine !== slotToken) return;   // a newer request has started
        var previous = timeSelect.value;
        timeSelect.innerHTML = "";
        var blank = document.createElement("option");
        blank.value = "";
        timeSelect.appendChild(blank);

        (data.slots || []).forEach(function (slot) {
          var opt = document.createElement("option");
          opt.value = slot;
          opt.textContent = formatSlot(slot);
          timeSelect.appendChild(opt);
        });

        if (previous && (data.slots || []).indexOf(previous) !== -1) timeSelect.value = previous;

        if (!data.slots || !data.slots.length) {
          setSlotNote(data.closed
            ? tr("slot.closed", "We are closed that day. Try another date.")
            : tr("slot.full", "That day is full. Try another date."), true);
        } else {
          setSlotNote("");
        }
      })
      .catch(function () {
        if (mine !== slotToken) return;
        setSlotNote("");
      });
  }

  /** 14:30 -> 2:30 PM, in whichever language is showing. */
  function formatSlot(hhmm) {
    var bits = hhmm.split(":");
    var d = new Date(2000, 0, 1, Number(bits[0]), Number(bits[1]));
    try {
      return new Intl.DateTimeFormat(
        (window.coral && window.coral.lang() === "es") ? "es-US" : "en-US",
        { hour: "numeric", minute: "2-digit", hour12: true }
      ).format(d);
    } catch (err) {
      return hhmm;
    }
  }

  if (dateInput) {
    // Nothing in the past.
    dateInput.min = new Date().toISOString().slice(0, 10);
    dateInput.addEventListener("change", loadSlots);
  }
  document.addEventListener("coral:lang", loadSlots);

  /* ---------- Business contact details ---------- */
  /* Call, text and Instagram only appear once a real number or handle is set
     in the admin portal. No dead links, no placeholder numbers. */
  try { (function wireContacts() {
    var biz = (window.__CORAL__ && window.__CORAL__.biz) || {};
    var tel = String(biz.phone || "").replace(/[^\d+]/g, "");
    var smsNum = String(biz.smsNumber || biz.phone || "").replace(/[^\d+]/g, "");
    var ig = String(biz.instagram || "").trim().replace(/^@/, "");

    if (tel) {
      document.querySelectorAll("[data-biz-tel]").forEach(function (el) { el.href = "tel:" + tel; });
    }
    if (smsNum) {
      document.querySelectorAll("[data-biz-sms]").forEach(function (el) { el.href = "sms:" + smsNum; });
    }
    if (ig) {
      var url = /^https?:/i.test(biz.instagram) ? biz.instagram : "https://instagram.com/" + ig;
      document.querySelectorAll("[data-biz-instagram]").forEach(function (el) {
        el.href = url;
        el.target = "_blank";
        el.rel = "noopener";
      });
    }

    var anything = Boolean(tel || smsNum || ig);
    document.querySelectorAll("[data-biz-contact]").forEach(function (el) {
      // A group with nothing to link to stays hidden entirely; otherwise hide
      // just the individual buttons that have no destination.
      el.hidden = !anything;
      if (!anything) return;
      if (!tel) el.querySelectorAll("[data-biz-tel]").forEach(function (n) { n.hidden = true; });
      if (!smsNum) el.querySelectorAll("[data-biz-sms]").forEach(function (n) { n.hidden = true; });
      if (!ig) el.querySelectorAll("[data-biz-instagram]").forEach(function (n) { n.hidden = true; });
    });
  })(); } catch (err) { console.error("Contact links could not be wired:", err); }

  if (form) syncPlan();

  /* ---------- Job clips ---------- */
  /* Nothing is fetched until someone asks for it: each tile is a poster image
     until tapped, at which point the video replaces it in place. Only one
     plays at a time. */
  (function wireClips() {
    var rail = document.getElementById("clipsRail");
    if (!rail) return;

    var playing = null;
    var prev = document.getElementById("clipsPrev");
    var next = document.getElementById("clipsNext");
    var count = document.getElementById("clipsCount");
    var tiles = Array.prototype.slice.call(rail.querySelectorAll(".clip"));

    /* Tile positions measured against the rail itself.
       offsetLeft is relative to the nearest positioned ancestor, which here is
       .clips-wrap, not the scroll container — using it put the rail at the
       wrong scroll offset. Measuring rectangles avoids the whole question. */
    function tileOffset(i) {
      if (!tiles[i]) return 0;
      return rail.scrollLeft + (tiles[i].getBoundingClientRect().left - rail.getBoundingClientRect().left);
    }

    /** How far one tile is, including the gap. */
    function step() {
      if (tiles.length < 2) return rail.clientWidth;
      return Math.round(tiles[1].getBoundingClientRect().left - tiles[0].getBoundingClientRect().left);
    }

    function visibleCount() {
      var s = step();
      return s > 0 ? Math.max(1, Math.round(rail.clientWidth / s)) : 1;
    }

    /* The index we are heading to. Kept as state rather than re-derived from
       scrollLeft on every click: while a smooth scroll is still animating,
       scrollLeft is somewhere in between, so deriving from it made repeated
       clicks recompute the same target and the carousel stalled. */
    var index = 0;

    /** Where the rail has actually settled, for the counter and the arrows. */
    function settledIndex() {
      var s = step();
      return s > 0 ? Math.max(0, Math.round(rail.scrollLeft / s)) : 0;
    }

    function update() {
      var per = visibleCount();
      var first = settledIndex();
      var from = Math.min(first + 1, tiles.length);
      var to = Math.min(first + per, tiles.length);

      if (count) {
        count.textContent = tr("video.count", from + "-" + to + " of " + tiles.length, {
          from: from, to: to, total: tiles.length
        });
      }
      // A 2px tolerance: browsers round fractional scroll positions.
      if (prev) prev.disabled = rail.scrollLeft <= 2;
      if (next) next.disabled = rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 2;
    }

    /* Scroll to an absolute tile position rather than by a relative amount.
       Relative scrollBy compounds rounding errors and can be swallowed when a
       previous smooth scroll is still running. */
    function move(dir) {
      var maxIndex = Math.max(0, tiles.length - visibleCount());
      index = Math.max(0, Math.min(maxIndex, index + dir));
      var smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      rail.scrollTo({ left: tileOffset(index), behavior: smooth ? "smooth" : "auto" });
    }

    if (prev) prev.addEventListener("click", function () { move(-1); });
    if (next) next.addEventListener("click", function () { move(1); });

    var settleTimer = null;
    rail.addEventListener("scroll", function () {
      window.requestAnimationFrame(update);
      // Once scrolling stops, trust the real position again — the person may
      // have swiped rather than used the arrows.
      clearTimeout(settleTimer);
      settleTimer = setTimeout(function () { index = settledIndex(); }, 140);
    }, { passive: true });

    // Arrow keys when the rail has focus.
    rail.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
    });

    window.addEventListener("resize", function () {
      index = settledIndex();
      update();
    });
    document.addEventListener("coral:lang", update);
    update();

    function stop(btn) {
      if (!btn) return;
      var v = btn.querySelector("video");
      if (v) {
        v.pause();
        v.remove();
      }
      var img = btn.querySelector("img");
      if (img) img.hidden = false;
      btn.classList.remove("is-playing");
    }

    rail.addEventListener("click", function (e) {
      var btn = e.target.closest(".clip-btn");
      if (!btn) return;

      // Tapping the one already running just stops it.
      if (btn === playing) {
        stop(btn);
        playing = null;
        return;
      }

      stop(playing);
      playing = btn;

      var poster = btn.querySelector("img");
      var video = document.createElement("video");

      // These have to be set before the source: the autoplay policy is
      // evaluated against them, and a muted inline video is allowed to start
      // without a further gesture.
      video.muted = true;
      video.setAttribute("muted", "");
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.loop = true;
      video.controls = true;
      video.preload = "auto";
      if (poster) video.poster = poster.getAttribute("src");

      video.src = btn.getAttribute("data-video");

      if (poster) poster.hidden = true;
      btn.classList.add("is-playing");
      btn.appendChild(video);

      /* Try now, and again once there is actually something to play. Calling
         play() the instant the source is set loses the race on slower
         connections, which left the clip sitting paused on its poster. */
      function attempt() {
        var p = video.play();
        if (p && typeof p.catch === "function") {
          p.catch(function () {
            // Still refused: the controls are there for them to press.
          });
        }
      }
      video.addEventListener("canplay", function () {
        if (video.paused) attempt();
      }, { once: true });
      attempt();
    });
  })();

  /* ---------- Footer year ---------- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
