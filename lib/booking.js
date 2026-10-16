/**
 * Coral Auto Spa — booking and membership requests from the public site.
 *
 * Two things arrive here: a one-time detail request, or a membership request.
 * Both are REQUESTS. Neither becomes a confirmed appointment until someone at
 * Coral says so in the admin portal, because a preferred time has to be
 * checked against the real calendar first.
 *
 * Nothing in this file takes a payment. Card details never touch this server.
 * A membership request is recorded as "requested" and stays that way until
 * billing is genuinely set up — see MEMBERSHIP STATUS in the README.
 */
const fs = require("fs");
const path = require("path");
const db = require("./db");
const pricing = require("./pricing");
const i18n = require("./i18n");
const scheduling = require("./scheduling");
const reminders = require("./reminders");

const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

const VALID_PLANS = ["membership", "combo", "interiorOnly", "exteriorOnly"];

function clean(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max || 400);
}

/** Same photo handling as before: our filename, our directory, never theirs. */
function savePhotos(photos, ref) {
  if (!Array.isArray(photos) || !photos.length) return [];
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch (err) {
    console.error("Could not create uploads dir:", err.message);
    return [];
  }

  const saved = [];
  photos.slice(0, MAX_PHOTOS).forEach((photo, i) => {
    if (!photo || typeof photo.data !== "string") return;
    const match = /^data:([a-z]+\/[a-z+.-]+);base64,(.+)$/i.exec(photo.data);
    if (!match) return;
    const ext = PHOTO_TYPES[match[1].toLowerCase()];
    if (!ext) return;

    let buf;
    try { buf = Buffer.from(match[2], "base64"); } catch { return; }
    if (!buf.length || buf.length > MAX_PHOTO_BYTES) return;

    const filename = `${ref}-${i + 1}${ext}`;
    try {
      fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
      saved.push(filename);
    } catch (err) {
      console.error("Could not save photo:", err.message);
    }
  });
  return saved;
}

/** Find an existing customer by phone or email, or make one. */
function upsertCustomer(fields) {
  const phone = fields.phone.replace(/\D/g, "");
  const existing = db.list("customers").find((c) => {
    const cp = String(c.phone || "").replace(/\D/g, "");
    return (cp && cp === phone) ||
      (c.email && fields.email && c.email.toLowerCase() === fields.email.toLowerCase());
  });

  if (existing) {
    return db.update("customers", existing.id, {
      name: fields.name || existing.name,
      email: fields.email || existing.email,
      phone: fields.phone || existing.phone,
      address: fields.address || existing.address,
      vehicle: fields.vehicle || existing.vehicle,
      lang: fields.lang || existing.lang,
      smsOptIn: fields.smsOptIn
    });
  }

  return db.insert("customers", {
    name: fields.name,
    email: fields.email,
    phone: fields.phone,
    address: fields.address,
    vehicle: fields.vehicle,
    lang: fields.lang,
    smsOptIn: fields.smsOptIn,
    source: "Website"
  });
}

/**
 * Handle a submitted booking or membership request.
 * Returns { status, body } ready to send as JSON.
 */
function submit(data) {
  const lang = i18n.normalize(data.lang);
  const plan = VALID_PLANS.includes(data.plan) ? data.plan : "combo";
  const isMembership = plan === "membership";

  const fields = {
    name: clean(data.name, 120),
    phone: clean(data.phone, 40),
    email: clean(data.email, 160),
    vehicle: clean(data.vehicle, 120),
    address: clean(data.address, 240),
    date: clean(data.date, 20),
    time: clean(data.time, 20),
    notes: clean(data.notes, 1500),
    seats: clean(data.seats, 4),
    lang,
    smsOptIn: data.smsOptIn === true || data.smsOptIn === "yes",
    addons: Array.isArray(data.addons)
      ? data.addons.map((a) => clean(a, 40)).filter(Boolean).slice(0, 12)
      : []
  };

  const required = ["name", "phone", "email", "vehicle", "address", "date", "time"];
  if (required.some((k) => !fields[k])) {
    return { status: 400, body: { error: i18n.t(lang, "book.errStep") } };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fields.email)) {
    return { status: 400, body: { error: i18n.t(lang, "book.errEmail") } };
  }

  // Enrolling is a financial commitment, so the agreement is not optional.
  if (isMembership && !(data.memberAgree === true || data.memberAgree === "yes")) {
    return { status: 400, body: { error: i18n.t(lang, "member.agree") } };
  }

  const ref = db.id();
  const photos = savePhotos(data.photos, ref);
  const customer = upsertCustomer(fields);

  // The time they asked for is a preference until we check the calendar.
  const stillOpen = scheduling.isAvailable(fields.date, fields.time, plan);

  const appointment = db.insert("appointments", {
    ref,
    customerId: customer.id,
    name: fields.name,
    phone: fields.phone,
    email: fields.email,
    vehicle: fields.vehicle,
    address: fields.address,
    date: fields.date,
    time: fields.time,
    minutes: pricing.durationFor(plan),
    plan,
    quotedPrice: pricing.priceFor(plan),
    addons: fields.addons,
    seats: fields.seats,
    notes: fields.notes,
    photos,
    lang,
    smsOptIn: fields.smsOptIn,
    // "requested" until a human confirms it. Reminders only fire on "confirmed".
    status: "requested",
    slotWasOpen: stillOpen
  });

  let membership = null;
  if (isMembership) {
    membership = db.insert("memberships", {
      customerId: customer.id,
      appointmentId: appointment.id,
      vehicle: fields.vehicle,
      monthlyPrice: pricing.PRICES.membership,
      lang,
      agreedAt: new Date().toISOString(),
      agreedPrice: pricing.PRICES.membership,
      alreadyPaidToday: data.alreadyPaidToday === true || data.alreadyPaidToday === "yes",
      // No payment method exists yet. This is a request, not a subscription.
      status: "requested",
      billingStatus: "not_set_up"
    });
    db.update("customers", customer.id, { membershipId: membership.id, isMember: false });
  }

  db.logActivity(
    isMembership ? "membership" : "booking",
    `${isMembership ? "Membership request" : "Booking request"} from ${fields.name} — ${fields.vehicle}`,
    appointment.id
  );

  const firstName = fields.name.split(/\s+/)[0];
  return {
    status: 200,
    body: {
      ok: true,
      ref,
      plan,
      slotWasOpen: stillOpen,
      message: i18n.t(lang, isMembership ? "book.okMember" : "book.ok", { name: firstName })
    }
  };
}

/**
 * Confirm a requested appointment. This is the moment it becomes real and
 * reminders get scheduled.
 */
function confirm(appointmentId, opts) {
  const appt = db.get("appointments", appointmentId);
  if (!appt) return null;

  const date = (opts && opts.date) || appt.date;
  const time = (opts && opts.time) || appt.time;

  const updated = db.update("appointments", appointmentId, {
    date, time, status: "confirmed",
    confirmedAt: new Date().toISOString()
  });

  reminders.scheduleFor(updated);
  db.logActivity("appointment", `Confirmed ${updated.name} for ${date} ${time}`, appointmentId);
  return updated;
}

function reschedule(appointmentId, date, time) {
  const appt = db.get("appointments", appointmentId);
  if (!appt) return null;
  const updated = db.update("appointments", appointmentId, { date, time });
  // Rebuild reminders from the new time; the old ones are cancelled inside.
  if (updated.status === "confirmed") reminders.scheduleFor(updated);
  db.logActivity("appointment", `Moved ${updated.name} to ${date} ${time}`, appointmentId);
  return updated;
}

function cancel(appointmentId, reason) {
  const appt = db.get("appointments", appointmentId);
  if (!appt) return null;
  const updated = db.update("appointments", appointmentId, { status: "cancelled", cancelReason: reason || "" });
  reminders.cancelFor(appointmentId, "appointment cancelled");
  db.logActivity("appointment", `Cancelled ${updated.name}`, appointmentId);
  return updated;
}

module.exports = { submit, confirm, reschedule, cancel, VALID_PLANS, savePhotos };
