/**
 * Coral Auto Spa — appointment reminder scheduling.
 *
 * Three texts per confirmed appointment: a week out, two days out, and on the
 * day. Each one is a row in the "reminders" collection with a UTC fire time,
 * so they survive a restart — nothing lives in a setTimeout that a redeploy
 * would quietly lose.
 *
 * A ticker checks once a minute for anything due. If an appointment moves,
 * its pending reminders are cancelled and rebuilt from the new time.
 */
const db = require("./db");
const sms = require("./sms");
const i18n = require("./i18n");
const scheduling = require("./scheduling");

const KINDS = ["week", "twoDay", "dayOf"];
const TICK_MS = 60 * 1000;

/** How late a reminder can be before we drop it instead of sending it. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

let timer = null;

/** Remove every pending reminder for a job. */
function cancelFor(jobId, reason) {
  const pending = db.list("reminders")
    .filter((r) => r.jobId === jobId && r.status === "pending");
  pending.forEach((r) => {
    db.update("reminders", r.id, { status: "cancelled", cancelledReason: reason || "appointment changed" });
  });
  return pending.length;
}

/**
 * Build the three reminders for a confirmed appointment.
 * Anything already in the past is skipped rather than fired immediately —
 * booking for tomorrow should not trigger a "one week to go" text.
 */
function scheduleFor(job) {
  cancelFor(job.id, "rescheduled");

  // Only a booked job gets reminders. A lead nobody has confirmed does not.
  if (!["scheduled", "in_progress"].includes(job.status)) return [];
  if (!job.smsOptIn) return [];
  if (!job.date || !job.time) return [];
  if (!sms.toE164(job.phone)) return [];

  const start = scheduling.toUtc(job.date, job.time);
  if (!start) return [];

  const times = scheduling.reminderTimesFor(start);
  const now = Date.now();
  const made = [];

  KINDS.forEach((kind) => {
    const at = times[kind];
    if (!at || at.getTime() <= now) return;   // already past, nothing to send
    made.push(db.insert("reminders", {
      jobId: job.id,
      customerId: job.customerId || null,
      kind,
      sendAt: at.toISOString(),
      status: "pending",
      lang: job.lang || "en",
      phone: job.phone
    }));
  });

  return made;
}

/** The text itself, in the customer's language. */
function bodyFor(reminder, job) {
  const lang = reminder.lang || job.lang || "en";
  const start = scheduling.toUtc(job.date, job.time);
  const when = scheduling.formatFor(start, lang);
  const firstName = String(job.customerName || job.name || "").trim().split(/\s+/)[0] || "";

  const key = reminder.kind === "week" ? "sms.week"
    : reminder.kind === "twoDay" ? "sms.twoDay"
    : "sms.dayOf";

  return i18n.t(lang, key, {
    name: firstName,
    date: when.date,
    time: when.time,
    address: job.address || ""
  });
}

/** Send everything that is due. Safe to call at any time. */
async function runDue(nowDate) {
  const now = (nowDate || new Date()).getTime();
  const due = db.list("reminders").filter(
    (r) => r.status === "pending" && new Date(r.sendAt).getTime() <= now
  );

  for (const reminder of due) {
    const job = db.get("jobs", reminder.jobId);

    if (!job || !["scheduled", "in_progress"].includes(job.status)) {
      db.update("reminders", reminder.id, { status: "cancelled", cancelledReason: "job no longer booked" });
      continue;
    }

    // If the server was down for hours, do not send a reminder for a slot
    // that has already come and gone.
    if (now - new Date(reminder.sendAt).getTime() > STALE_AFTER_MS) {
      db.update("reminders", reminder.id, { status: "skipped", cancelledReason: "too late to be useful" });
      continue;
    }

    const body = bodyFor(reminder, job);
    const result = await sms.send(reminder.phone || job.phone, body);

    db.update("reminders", reminder.id, {
      status: result.status === "failed" ? "failed" : result.status,
      sentAt: new Date().toISOString(),
      body,
      providerId: result.providerId || null,
      error: result.error || null
    });

    db.logActivity(
      "reminder",
      `${reminder.kind} reminder ${result.status} for ${job.customerName || job.name}`,
      { type: "jobs", id: job.id }
    );
  }

  return due.length;
}

function start() {
  if (timer) return;
  // Catch up on anything that came due while the server was off, then tick.
  runDue().catch((err) => console.error("Reminder catch-up failed:", err.message));
  timer = setInterval(() => {
    runDue().catch((err) => console.error("Reminder tick failed:", err.message));
  }, TICK_MS);
  if (timer.unref) timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** What is queued for an appointment, for the admin view. */
function forJob(jobId) {
  return db.list("reminders")
    .filter((r) => r.jobId === jobId)
    .sort((a, b) => new Date(a.sendAt) - new Date(b.sendAt));
}

module.exports = { KINDS, scheduleFor, cancelFor, runDue, bodyFor, start, stop, forJob };
