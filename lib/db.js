/**
 * Coral Auto Spa — tiny JSON document store.
 *
 * One file on disk (data/db.json), one object in memory, atomic writes.
 * Zero dependencies so it runs on Replit with no install step. If the
 * business outgrows a single JSON file, swap this module for a real
 * database — the API surface (list / get / insert / update / remove)
 * is deliberately small so nothing else has to change.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

/** Collections the generic CRUD API is allowed to touch. */
const COLLECTIONS = [
  "customers",
  "jobs",
  "directory",
  "posts",
  "expenses",
  "inventory",
  "tasks",
  "activity"
];

function defaultSettings() {
  return {
    business: {
      name: "Coral Auto Spa",
      tagline: "Premium mobile auto detailing",
      phone: "",
      email: "",
      serviceArea: "Southwest Florida",
      hours: "Mon–Sat, 8am–6pm",
      taxRate: 0
    },
    services: [
      { name: "Full Interior & Exterior Detail", basePrice: 100 }
    ],
    addons: [
      { name: "Seat shampoo", price: 15, unit: "per seat" },
      { name: "Carpet shampoo", price: null },
      { name: "Heavy stain removal", price: null },
      { name: "Pet hair", price: null },
      { name: "Excessive sand", price: null },
      { name: "Odor treatment", price: null },
      { name: "Extremely dirty vehicle", price: null }
    ],
    team: [],
    socialPillars: ["Before & After", "Tips", "Offer", "Behind the scenes", "Review", "Community"],
    directoryCategories: ["Supplier", "Vendor", "Referral partner", "Dealership", "Property manager", "Fleet account", "Competitor", "Other"],
    expenseCategories: ["Supplies", "Fuel", "Equipment", "Marketing", "Insurance", "Software", "Vehicle", "Other"],
    leadSources: ["Website", "Referral", "Instagram", "Facebook", "Google", "Walk-up", "Repeat", "Other"]
  };
}

function emptyDb() {
  const db = { version: 1, settings: defaultSettings(), sessions: {} };
  COLLECTIONS.forEach((c) => { db[c] = []; });
  return db;
}

let db = null;
let writeQueued = false;
let writing = false;

function load() {
  if (db) return db;
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    db = Object.assign(emptyDb(), JSON.parse(raw));
    // Make sure every collection exists even if the file predates it.
    COLLECTIONS.forEach((c) => { if (!Array.isArray(db[c])) db[c] = []; });
    db.settings = Object.assign(defaultSettings(), db.settings || {});
    if (!db.sessions || typeof db.sessions !== "object") db.sessions = {};
  } catch (err) {
    if (err.code !== "ENOENT") console.error("Could not read db.json, starting fresh:", err.message);
    db = emptyDb();
    flushNow();
  }
  return db;
}

/** Write the file atomically: temp file, then rename over the old one. */
function flushNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error("Could not write db.json:", err.message);
  }
}

/** Coalesce bursts of writes into one disk write per tick. */
function save() {
  if (writeQueued) return;
  writeQueued = true;
  setImmediate(() => {
    writeQueued = false;
    if (writing) return save();
    writing = true;
    try { flushNow(); } finally { writing = false; }
  });
}

function id() {
  return Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
}

function now() {
  return new Date().toISOString();
}

function list(collection) {
  return load()[collection] || [];
}

function get(collection, docId) {
  return list(collection).find((d) => d.id === docId) || null;
}

function insert(collection, doc) {
  const record = Object.assign({}, doc, { id: doc.id || id(), createdAt: doc.createdAt || now(), updatedAt: now() });
  load()[collection].push(record);
  save();
  return record;
}

function update(collection, docId, patch) {
  const items = list(collection);
  const idx = items.findIndex((d) => d.id === docId);
  if (idx === -1) return null;
  // id and createdAt are immutable.
  const { id: _i, createdAt: _c, ...rest } = patch || {};
  items[idx] = Object.assign({}, items[idx], rest, { updatedAt: now() });
  save();
  return items[idx];
}

function remove(collection, docId) {
  const items = list(collection);
  const idx = items.findIndex((d) => d.id === docId);
  if (idx === -1) return false;
  items.splice(idx, 1);
  save();
  return true;
}

function getSettings() {
  return load().settings;
}

function setSettings(patch) {
  const s = load().settings;
  Object.keys(patch || {}).forEach((k) => { s[k] = patch[k]; });
  save();
  return s;
}

/** Append to the activity feed, keeping the last 500 entries. */
function logActivity(type, text, ref) {
  const entry = { id: id(), at: now(), type, text, ref: ref || null };
  const items = load().activity;
  items.push(entry);
  if (items.length > 500) items.splice(0, items.length - 500);
  save();
  return entry;
}

/** Everything the admin UI needs in one payload. */
function snapshot() {
  const d = load();
  const out = { settings: d.settings };
  COLLECTIONS.forEach((c) => { out[c] = d[c]; });
  return out;
}

/** Replace all business data from a backup. Sessions are kept. */
function restore(payload) {
  const d = load();
  COLLECTIONS.forEach((c) => {
    if (Array.isArray(payload[c])) d[c] = payload[c];
  });
  if (payload.settings && typeof payload.settings === "object") {
    d.settings = Object.assign(defaultSettings(), payload.settings);
  }
  flushNow();
  return snapshot();
}

module.exports = {
  COLLECTIONS,
  load, save, id, now,
  list, get, insert, update, remove,
  getSettings, setSettings,
  logActivity, snapshot, restore,
  sessions: () => load().sessions
};
