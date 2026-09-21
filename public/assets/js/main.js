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

  function messageFor(input) {
    if (input.validity.valueMissing) {
      return input.type === "date" ? "Pick a date that suits you."
        : input.type === "time" ? "Pick a rough time."
        : "This one's needed.";
    }
    if (input.validity.typeMismatch && input.type === "email") return "That email doesn't look right.";
    return "Please check this.";
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
          showStatus("Something's missing on this step. Take a look above.", false);
          return;
        }
      }

      var original = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending\u2026";

      var fd = new FormData(form);
      var payload = {
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
          showStatus(r.data.message || "Thanks! We'll be in touch shortly to confirm.", true);
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
            : "Something went wrong sending that. Please try again in a moment.", false);
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
