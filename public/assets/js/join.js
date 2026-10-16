/**
 * Coral Auto Spa — the in-person signup page.
 *
 * Two modes on one URL:
 *   /join          the customer fills this in on their own phone
 *   /join?qr=1     we show a QR code pointing at /join for them to scan
 *
 * This page never asks for card details. A membership request is recorded and
 * billing is set up afterwards, so nothing here can imply a payment was taken.
 */
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var form = document.getElementById("joinForm");
  var status = document.getElementById("formStatus");

  function tr(key, fallback, vars) {
    if (window.coral && window.coral.t) {
      var v = window.coral.t(key, vars);
      if (v && v !== key) return v;
    }
    return fallback;
  }

  /* ---------- QR mode ---------- */
  if (params.get("qr") === "1") {
    var panel = document.getElementById("qrPanel");
    var signup = document.getElementById("signupPanel");
    var frame = document.getElementById("qrFrame");
    var urlOut = document.getElementById("qrUrl");

    var target = location.origin + "/join";
    var lang = params.get("lang");
    if (lang) target += "?lang=" + encodeURIComponent(lang);

    panel.hidden = false;
    signup.hidden = true;
    urlOut.textContent = target;

    fetch("/api/qr?url=" + encodeURIComponent(target))
      .then(function (r) { return r.text(); })
      .then(function (svg) { frame.innerHTML = svg; })
      .catch(function () { frame.textContent = target; });
    return;
  }

  /* ---------- Availability ---------- */
  var dateInput = form.elements.date;
  var timeSelect = document.getElementById("timeSelect");
  var slotNote = document.getElementById("slotNote");
  var token = 0;

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

  function loadSlots() {
    if (!dateInput.value) return;
    var mine = ++token;
    slotNote.textContent = tr("slot.checking", "Checking…");

    fetch("/api/availability?date=" + encodeURIComponent(dateInput.value) + "&plan=membership")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (mine !== token) return;
        timeSelect.innerHTML = '<option value=""></option>';
        (data.slots || []).forEach(function (slot) {
          var opt = document.createElement("option");
          opt.value = slot;
          opt.textContent = formatSlot(slot);
          timeSelect.appendChild(opt);
        });
        slotNote.textContent = (data.slots && data.slots.length)
          ? ""
          : tr(data.closed ? "slot.closed" : "slot.full", "Try another date.");
        slotNote.classList.toggle("is-warn", !(data.slots && data.slots.length));
      })
      .catch(function () { if (mine === token) slotNote.textContent = ""; });
  }

  dateInput.min = new Date().toISOString().slice(0, 10);
  dateInput.addEventListener("change", loadSlots);
  document.addEventListener("coral:lang", function () { if (dateInput.value) loadSlots(); });

  /* ---------- Submit ---------- */
  function showStatus(message, ok) {
    status.textContent = message;
    status.className = "form-status is-visible " + (ok ? "is-ok" : "is-error");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    if (!form.checkValidity()) {
      var bad = form.querySelector(":invalid");
      showStatus(
        bad && bad.name === "memberAgree"
          ? tr("member.agree", "Please agree to the terms to continue.")
          : tr("book.errStep", "Something is missing. Take a look above."),
        false
      );
      if (bad) bad.focus();
      return;
    }

    var btn = form.querySelector('button[type="submit"]');
    var original = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = tr("book.sending", "Sending…");

    var fd = new FormData(form);
    var payload = {
      plan: "membership",
      name: fd.get("name"),
      phone: fd.get("phone"),
      email: fd.get("email"),
      vehicle: fd.get("vehicle"),
      address: fd.get("address"),
      date: fd.get("date"),
      time: fd.get("time"),
      smsOptIn: fd.get("smsOptIn") === "yes",
      memberAgree: fd.get("memberAgree") === "yes",
      alreadyPaidToday: fd.get("alreadyPaidToday") === "yes",
      lang: (window.coral && window.coral.lang()) || "en",
      source: "in-person"
    };

    fetch("/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.data && r.data.error ? r.data.error : "failed");
        showStatus(r.data.message || tr("book.okMember", "Thanks! Your request is in."), true);
        form.reset();
      })
      .catch(function (err) {
        showStatus(
          err.message && err.message !== "failed" ? err.message : tr("book.errGeneric", "Something went wrong."),
          false
        );
      })
      .finally(function () {
        btn.disabled = false;
        btn.innerHTML = original;
      });
  });
})();
