/**
 * Coral Auto Spa — the single source of truth for what we sell.
 *
 * Every surface reads from here: the public page, the booking form, the
 * membership flow, the admin portal and the SMS copy. Change a price in this
 * file and it changes everywhere. Nothing else should hard-code a dollar
 * figure.
 *
 * House rules baked into this file, because getting them wrong misleads a
 * customer:
 *   - There is ONE detailing package. Interior-only and exterior-only are the
 *     same work on half the vehicle, not a cheaper grade of service.
 *   - Shampooing, extraction and stain treatments are NEVER included in a
 *     base detail. They are add-ons, always.
 *   - Spray wax IS included on the exterior. It is a spray-wax finish, not
 *     polishing, paint correction or a ceramic coating.
 *   - Published prices are starting prices. Size and condition can move them,
 *     and that gets confirmed with the customer before any work starts.
 */

const PRICES = {
  /** One-time, the whole vehicle inside and out. */
  combo: 120,
  /** One-time, half the vehicle. */
  interiorOnly: 80,
  exteriorOnly: 65,
  /** Recurring: one combo detail per month, one enrolled vehicle. */
  membership: 100
};

/** Booking the two halves separately costs this much more than the combo. */
const SEPARATE_TOTAL = PRICES.interiorOnly + PRICES.exteriorOnly;  // 145
const COMBO_SAVING = SEPARATE_TOTAL - PRICES.combo;                // 25
/** What a member saves on every visit against the one-time starting price. */
const MEMBER_SAVING = PRICES.combo - PRICES.membership;            // 20

/** What the exterior always includes. */
const EXTERIOR_INCLUDED = [
  "exterior.wash",
  "exterior.wheels",
  "exterior.windows",
  "exterior.trim",
  "exterior.tires",
  "exterior.sprayWax"
];

/** What the interior always includes. */
const INTERIOR_INCLUDED = [
  "interior.trash",
  "interior.vacuum",
  "interior.dash",
  "interior.vents",
  "interior.glass",
  "interior.brushes"
];

/**
 * Work that is never part of a base detail or a membership visit.
 * `price` null means it depends on the vehicle, so we quote it.
 */
const ADDONS = [
  { key: "seatShampoo",  price: 15,   unit: "perSeat" },
  { key: "carpetShampoo", price: null },
  { key: "stainRemoval",  price: null },
  { key: "clayBar",       price: null },
  { key: "petHair",       price: null },
  { key: "sand",          price: null },
  { key: "odor",          price: null },
  { key: "heavyClean",    price: null }
];

/** The three ways to book a one-time detail. */
const SERVICES = [
  { key: "combo",        price: PRICES.combo,        minutes: 180, includes: ["exterior", "interior"] },
  { key: "interiorOnly", price: PRICES.interiorOnly, minutes: 120, includes: ["interior"] },
  { key: "exteriorOnly", price: PRICES.exteriorOnly, minutes: 90,  includes: ["exterior"] }
];

const MEMBERSHIP = {
  key: "membership",
  price: PRICES.membership,
  interval: "month",
  /** One visit, one vehicle, every month. */
  visitsPerMonth: 1,
  vehicles: 1,
  minutes: 180,
  includes: ["exterior", "interior"],
  /** Month to month. Cancel any time before the next charge. */
  commitmentMonths: 0
};

/** The service name shown in the admin, keyed by plan. */
const SERVICE_NAMES = {
  combo: "Full Interior & Exterior Detail",
  interiorOnly: "Interior only",
  exteriorOnly: "Exterior only",
  membership: "Monthly membership"
};

function serviceNameFor(key) {
  return SERVICE_NAMES[key] || SERVICE_NAMES.combo;
}

function serviceByKey(key) {
  if (key === "membership") return MEMBERSHIP;
  return SERVICES.find((s) => s.key === key) || null;
}

/** Minutes to hold on the calendar for a given booking type. */
function durationFor(key) {
  const s = serviceByKey(key);
  return s ? s.minutes : 180;
}

/** Price shown for a booking type, in whole dollars. */
function priceFor(key) {
  const s = serviceByKey(key);
  return s ? s.price : null;
}

module.exports = {
  PRICES,
  SERVICE_NAMES,
  serviceNameFor,
  SEPARATE_TOTAL,
  COMBO_SAVING,
  MEMBER_SAVING,
  EXTERIOR_INCLUDED,
  INTERIOR_INCLUDED,
  ADDONS,
  SERVICES,
  MEMBERSHIP,
  serviceByKey,
  durationFor,
  priceFor
};
