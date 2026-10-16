/**
 * Coral Auto Spa — appointment times, availability and the clock.
 *
 * Everything the customer sees is wall-clock time in Southwest Florida.
 * Everything we store and compare is a UTC instant. This module is the only
 * place that converts between the two, because getting it wrong means a
 * reminder lands at 3am or an appointment moves an hour when the clocks do.
 */
const db = require("./db");
const pricing = require("./pricing");

const TZ = process.env.CORAL_TZ || "America/New_York";

/** Minutes between bookable start times. */
const SLOT_STEP = 30;

/** No same-day-of reminder earlier than this, local time. */
const EARLIEST_REMINDER = { hour: 7, minute: 30 };

/**
 * How far a given instant is from UTC in a zone, in milliseconds.
 * Reads the zone's own rendering of the instant and diffs it, which is the
 * only dependency-free way to get a correct, DST-aware offset.
 */
function offsetMs(date, tz) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const p = {};
  fmt.formatToParts(date).forEach((part) => { p[part.type] = part.value; });
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second)
  );
  return asUtc - date.getTime();
}

/**
 * "2026-03-08" + "02:30" in the zone -> the UTC instant.
 * Two passes, because the offset we need depends on the answer we are
 * computing: the first guess lands us close enough to read the right offset.
 */
function toUtc(dateStr, timeStr, tz) {
  const zone = tz || TZ;
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const [hh, mm] = String(timeStr || "00:00").split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh)) return null;

  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let instant = naive - offsetMs(new Date(naive), zone);
  const corrected = naive - offsetMs(new Date(instant), zone);
  if (corrected !== instant) instant = corrected;
  return new Date(instant);
}

/** The zone's wall-clock pieces for an instant. */
function parts(date, tz) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz || TZ,
    hour12: false,
    weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
  const p = {};
  fmt.formatToParts(date).forEach((part) => { p[part.type] = part.value; });
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`,
    weekday: p.weekday,
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour) % 24, minute: Number(p.minute)
  };
}

/** Human date and time in the customer's language. */
function formatFor(date, lang, tz) {
  const locale = lang === "es" ? "es-US" : "en-US";
  const zone = tz || TZ;
  return {
    date: new Intl.DateTimeFormat(locale, {
      timeZone: zone, weekday: "long", month: "long", day: "numeric"
    }).format(date),
    time: new Intl.DateTimeFormat(locale, {
      timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true
    }).format(date)
  };
}

/* ---------- business hours ---------- */

function hours() {
  const s = db.getSettings();
  const h = (s.schedule && s.schedule.hours) || null;
  // Default: Monday to Saturday, 8am to 6pm, closed Sunday.
  return h || {
    sun: null,
    mon: ["08:00", "18:00"],
    tue: ["08:00", "18:00"],
    wed: ["08:00", "18:00"],
    thu: ["08:00", "18:00"],
    fri: ["08:00", "18:00"],
    sat: ["08:00", "18:00"]
  };
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function dayKeyFor(dateStr) {
  // Noon avoids any DST edge when asking which weekday a date falls on.
  const noon = toUtc(dateStr, "12:00");
  if (!noon) return null;
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(noon);
  return wd.toLowerCase().slice(0, 3);
}

function minutesOf(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

function hhmmOf(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** How long an unconfirmed request keeps holding its slot. */
const SOFT_HOLD_MS = 48 * 60 * 60 * 1000;

/**
 * Appointments blocking a date, as busy minute ranges.
 *
 * Confirmed work always blocks. A request that nobody has confirmed yet holds
 * its slot too, so two people cannot ask for the same time, but only for a
 * couple of days — otherwise an abandoned request would wall off that slot
 * forever with no sign of why.
 */
function busyRanges(dateStr) {
  const now = Date.now();
  return db.list("appointments")
    .filter((a) => {
      if (a.date !== dateStr) return false;
      if (a.status === "cancelled" || a.status === "declined") return false;
      if (a.status === "requested") {
        const age = now - new Date(a.createdAt || 0).getTime();
        return age < SOFT_HOLD_MS;
      }
      return true;
    })
    .map((a) => {
      const start = minutesOf(a.time);
      return [start, start + (a.minutes || 180)];
    });
}

/**
 * Bookable start times for a date, given how long the job runs.
 * A slot has to fit entirely inside opening hours and not touch an existing
 * appointment. Slots in the past are dropped.
 */
function slotsFor(dateStr, planKey) {
  const key = dayKeyFor(dateStr);
  if (!key) return [];

  const window = hours()[key];
  if (!window) return [];                     // closed that day

  const duration = pricing.durationFor(planKey);
  const open = minutesOf(window[0]);
  const close = minutesOf(window[1]);
  const busy = busyRanges(dateStr);
  const nowParts = parts(new Date());
  const isToday = nowParts.date === dateStr;
  const nowMins = nowParts.hour * 60 + nowParts.minute;

  const out = [];
  for (let m = open; m + duration <= close; m += SLOT_STEP) {
    if (isToday && m < nowMins + 60) continue;             // need an hour's notice
    const clashes = busy.some(([s, e]) => m < e && s < m + duration);
    if (!clashes) out.push(hhmmOf(m));
  }
  return out;
}

/** Is this exact start time still bookable? */
function isAvailable(dateStr, timeStr, planKey) {
  return slotsFor(dateStr, planKey).includes(timeStr);
}

/** Move a local calendar date by whole days, staying a plain YYYY-MM-DD. */
function shiftDays(dateStr, delta) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/**
 * When the three reminders for an appointment should fire.
 *
 * The week and two-day reminders are computed in wall-clock terms — the same
 * local time, N calendar days earlier — not by subtracting fixed milliseconds.
 * Subtracting milliseconds across a daylight-saving change drags the reminder
 * an hour off, so a 10am appointment would get its "one week before" ping at
 * 9am. Calendar arithmetic keeps it at 10am either side of the switch.
 *
 * The day-of reminder is three hours ahead, floored at 7:30am local so an
 * early job never pings someone at dawn, and kept at least half an hour before
 * the appointment itself.
 */
function reminderTimesFor(startUtc, tz) {
  const zone = tz || TZ;
  const local = parts(startUtc, zone);

  const week = toUtc(shiftDays(local.date, -7), local.time, zone);
  const twoDay = toUtc(shiftDays(local.date, -2), local.time, zone);

  const apptMins = local.hour * 60 + local.minute;
  const floorMins = EARLIEST_REMINDER.hour * 60 + EARLIEST_REMINDER.minute;
  let dayOfMins = Math.max(apptMins - 180, floorMins);
  // Never schedule the day-of reminder at or after the appointment.
  if (dayOfMins >= apptMins) dayOfMins = Math.max(0, apptMins - 30);
  const dayOf = toUtc(local.date, hhmmOf(dayOfMins), zone);

  return { week, twoDay, dayOf };
}

module.exports = {
  TZ,
  SLOT_STEP,
  SOFT_HOLD_MS,
  EARLIEST_REMINDER,
  offsetMs,
  toUtc,
  parts,
  formatFor,
  hours,
  dayKeyFor,
  slotsFor,
  isAvailable,
  reminderTimesFor,
  shiftDays,
  minutesOf,
  hhmmOf,
  DAY_KEYS
};
