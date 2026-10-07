/**
 * Coral Auto Spa — admin portal API.
 *
 * Mounted under /api/admin. Password login with an HttpOnly session cookie,
 * then a small REST surface over the JSON store in lib/db.js.
 *
 * Set ADMIN_PASSWORD in the environment (Replit: Secrets tab). Without it the
 * server falls back to a development password and shouts about it on boot.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");

const DEV_PASSWORD = "coral-admin";
const PASSWORD = process.env.ADMIN_PASSWORD || DEV_PASSWORD;
const COOKIE = "cas_admin";
const SESSION_DAYS = 30;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
const BOOKINGS_FILE = path.join(__dirname, "..", "bookings.log");

if (!process.env.ADMIN_PASSWORD) {
  console.warn(
    "\n  WARNING: ADMIN_PASSWORD is not set. The admin portal is using the\n" +
    `  development password "${DEV_PASSWORD}". Set ADMIN_PASSWORD before deploying.\n`
  );
}

/* ---------- helpers ---------- */

function sendJson(res, status, obj, extraHeaders) {
  res.writeHead(status, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store"
  }, extraHeaders || {}));
  res.end(JSON.stringify(obj));
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error("Request too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve({});
      try { resolve(JSON.parse(text)); }
      catch { reject(Object.assign(new Error("Invalid JSON"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function isSecure(req) {
  return (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function cookieHeader(req, value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` + (isSecure(req) ? "; Secure" : "");
}

function clientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";
}

/* ---------- sessions ---------- */

function pruneSessions() {
  const sessions = db.sessions();
  const t = Date.now();
  let changed = false;
  Object.keys(sessions).forEach((token) => {
    if (!sessions[token] || sessions[token].expiresAt < t) { delete sessions[token]; changed = true; }
  });
  if (changed) db.save();
}

function currentSession(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const s = db.sessions()[token];
  if (!s || s.expiresAt < Date.now()) return null;
  return { token, session: s };
}

function createSession(req) {
  pruneSessions();
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions()[token] = {
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DAYS * 86400000,
    ua: String(req.headers["user-agent"] || "").slice(0, 200),
    ip: clientIp(req)
  };
  db.save();
  return token;
}

function destroySession(token) {
  delete db.sessions()[token];
  db.save();
}

function passwordMatches(input) {
  const a = Buffer.from(String(input || ""));
  const b = Buffer.from(PASSWORD);
  if (a.length !== b.length) {
    // Still do a comparison so timing does not leak the length.
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// Login throttle: 10 failures per IP per 15 minutes.
const attempts = new Map();
function throttled(ip) {
  const rec = attempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > 15 * 60000) { attempts.delete(ip); return false; }
  return rec.count >= 10;
}
function recordFailure(ip) {
  const rec = attempts.get(ip);
  if (!rec || Date.now() - rec.first > 15 * 60000) attempts.set(ip, { first: Date.now(), count: 1 });
  else rec.count += 1;
}

/* ---------- lead intake from the public booking form ---------- */

function normalisePhone(p) {
  return String(p || "").replace(/\D/g, "");
}

function findCustomer(email, phone) {
  const e = String(email || "").trim().toLowerCase();
  const p = normalisePhone(phone);
  return db.list("customers").find((c) =>
    (e && String(c.email || "").toLowerCase() === e) ||
    (p && normalisePhone(c.phone) === p)
  ) || null;
}

/**
 * Turn a booking from the public site into a customer (matched or new)
 * plus a job in the "new" column of the pipeline.
 */
function recordBooking(booking) {
  let customer = findCustomer(booking.email, booking.phone);
  const vehicle = booking.vehicle || "";

  if (!customer) {
    customer = db.insert("customers", {
      name: booking.name,
      phone: booking.phone,
      email: booking.email,
      address: booking.address || "",
      vehicles: vehicle ? [vehicle] : [],
      tags: ["New"],
      source: "Website",
      notes: ""
    });
    db.logActivity("customer", `New customer ${customer.name} from the website`, { type: "customer", id: customer.id });
  } else {
    const patch = {};
    if (vehicle && !(customer.vehicles || []).includes(vehicle)) patch.vehicles = (customer.vehicles || []).concat(vehicle);
    if (!customer.address && booking.address) patch.address = booking.address;
    if (Object.keys(patch).length) customer = db.update("customers", customer.id, patch);
  }

  const settings = db.getSettings();
  const service = (settings.services[0] && settings.services[0].name) || "Full Interior & Exterior Detail";
  const basePrice = (settings.services[0] && settings.services[0].basePrice) || 100;

  const job = db.insert("jobs", {
    customerId: customer.id,
    customerName: customer.name,
    phone: booking.phone,
    email: booking.email,
    vehicle,
    address: booking.address || "",
    date: booking.date || "",
    time: booking.time || "",
    status: "new",
    service,
    addons: booking.addons || [],
    seats: booking.seats || "",
    price: basePrice,
    paid: false,
    paymentMethod: "",
    source: "Website",
    notes: booking.notes || "",
    photos: booking.photos || [],
    leadRef: booking.ref || null,
    receivedAt: booking.receivedAt || db.now()
  });
  db.logActivity("lead", `New booking request from ${customer.name}${vehicle ? ` — ${vehicle}` : ""}`, { type: "job", id: job.id });
  return { customer, job };
}

/**
 * One-time catch-up: pull any bookings.log lines that are not in the store
 * yet (matched on ref, or on receivedAt for the oldest entries that had
 * no ref). Safe to run on every boot.
 */
function importBookingLog() {
  let text;
  try { text = fs.readFileSync(BOOKINGS_FILE, "utf8"); }
  catch { return 0; }

  const jobs = db.list("jobs");
  const seen = new Set(jobs.map((j) => j.leadRef || j.receivedAt));
  let count = 0;

  text.split("\n").forEach((line) => {
    if (!line.trim()) return;
    let b;
    try { b = JSON.parse(line); } catch { return; }
    const key = b.ref || b.receivedAt;
    if (!key || seen.has(key)) return;
    if (!b.name) return;
    recordBooking(b);
    seen.add(key);
    count += 1;
  });

  if (count) console.log(`[admin] imported ${count} booking(s) from bookings.log`);
  return count;
}

/* ---------- routes ---------- */

const JOB_STATUSES = ["new", "quoted", "scheduled", "in_progress", "completed", "paid", "cancelled"];

function clean(obj) {
  // Only plain objects through the door; drop anything that is not JSON-ish.
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  return JSON.parse(JSON.stringify(obj));
}

function describe(collection, doc) {
  switch (collection) {
    case "customers": return doc.name || "customer";
    case "jobs": return `${doc.customerName || "job"}${doc.vehicle ? ` — ${doc.vehicle}` : ""}`;
    case "directory": return doc.name || "listing";
    case "posts": return doc.title || "post";
    case "expenses": return `${doc.vendor || "expense"} $${Number(doc.amount || 0).toFixed(2)}`;
    case "inventory": return doc.name || "item";
    case "tasks": return doc.title || "task";
    default: return collection;
  }
}

const LABEL = {
  customers: "Customer", jobs: "Job", directory: "Directory listing", posts: "Social post",
  expenses: "Expense", inventory: "Inventory item", tasks: "Task"
};

async function handle(req, res, urlPath) {
  const method = req.method;
  const parts = urlPath.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean);
  const [head, second, third] = parts;

  /* --- public: auth --- */
  if (head === "login" && method === "POST") {
    const ip = clientIp(req);
    if (throttled(ip)) return sendJson(res, 429, { error: "Too many attempts. Try again in 15 minutes." });
    let body;
    try { body = await readJson(req, 4096); } catch (e) { return sendJson(res, e.status || 400, { error: e.message }); }
    if (!passwordMatches(body.password)) {
      recordFailure(ip);
      return sendJson(res, 401, { error: "Wrong password." });
    }
    attempts.delete(ip);
    const token = createSession(req);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": cookieHeader(req, token, SESSION_DAYS * 86400) });
  }

  const auth = currentSession(req);

  if (head === "me" && method === "GET") {
    if (!auth) return sendJson(res, 401, { error: "Not signed in" });
    return sendJson(res, 200, { ok: true, business: db.getSettings().business, devPassword: !process.env.ADMIN_PASSWORD });
  }

  if (!auth) return sendJson(res, 401, { error: "Not signed in" });

  if (head === "logout" && method === "POST") {
    destroySession(auth.token);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": cookieHeader(req, "", 0) });
  }

  /* --- authenticated --- */
  if (head === "bootstrap" && method === "GET") {
    return sendJson(res, 200, db.snapshot());
  }

  if (head === "settings") {
    if (method === "GET") return sendJson(res, 200, db.getSettings());
    if (method === "PUT" || method === "PATCH") {
      let body;
      try { body = clean(await readJson(req, MAX_JSON_BYTES)); } catch (e) { return sendJson(res, e.status || 400, { error: e.message }); }
      const s = db.setSettings(body);
      db.logActivity("settings", "Settings updated");
      return sendJson(res, 200, s);
    }
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  if (head === "export" && method === "GET") {
    const stamp = new Date().toISOString().slice(0, 10);
    return sendJson(res, 200, Object.assign({ exportedAt: db.now() }, db.snapshot()), {
      "Content-Disposition": `attachment; filename="coral-auto-spa-backup-${stamp}.json"`
    });
  }

  if (head === "import" && method === "POST") {
    let body;
    try { body = clean(await readJson(req, MAX_IMPORT_BYTES)); } catch (e) { return sendJson(res, e.status || 400, { error: e.message }); }
    const snap = db.restore(body);
    db.logActivity("settings", "Data restored from a backup file");
    return sendJson(res, 200, snap);
  }

  if (head === "uploads" && method === "GET" && second) {
    const name = path.basename(second);
    if (!/^[a-z0-9-]+\.(jpg|png|webp)$/i.test(name)) return sendJson(res, 404, { error: "Not found" });
    const file = path.join(UPLOADS_DIR, name);
    return fs.readFile(file, (err, data) => {
      if (err) return sendJson(res, 404, { error: "Not found" });
      const ext = path.extname(name).toLowerCase();
      const type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
      res.end(data);
    });
  }

  /* --- generic collections --- */
  if (!db.COLLECTIONS.includes(head) || head === "activity" && method !== "GET") {
    return sendJson(res, 404, { error: "Unknown endpoint" });
  }
  const collection = head;

  if (!second) {
    if (method === "GET") return sendJson(res, 200, db.list(collection));
    if (method === "POST") {
      let body;
      try { body = clean(await readJson(req, MAX_JSON_BYTES)); } catch (e) { return sendJson(res, e.status || 400, { error: e.message }); }
      if (collection === "jobs") {
        if (!JOB_STATUSES.includes(body.status)) body.status = "new";
        if (body.customerId && !body.customerName) {
          const c = db.get("customers", body.customerId);
          if (c) body.customerName = c.name;
        }
      }
      const doc = db.insert(collection, body);
      db.logActivity(collection, `${LABEL[collection] || collection} added: ${describe(collection, doc)}`, { type: collection, id: doc.id });
      return sendJson(res, 201, doc);
    }
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const docId = second;

  // Special action: convert a lead / move pipeline status with a log line.
  if (collection === "jobs" && third === "status" && method === "POST") {
    let body;
    try { body = clean(await readJson(req, 4096)); } catch (e) { return sendJson(res, e.status || 400, { error: e.message }); }
    if (!JOB_STATUSES.includes(body.status)) return sendJson(res, 400, { error: "Unknown status" });
    const before = db.get("jobs", docId);
    if (!before) return sendJson(res, 404, { error: "Not found" });
    const patch = { status: body.status };
    if (body.status === "paid") { patch.paid = true; patch.paidAt = before.paidAt || db.now(); }
    if (body.status === "completed" && !before.completedAt) patch.completedAt = db.now();
    const doc = db.update("jobs", docId, patch);
    db.logActivity("jobs", `${describe("jobs", doc)} moved to ${body.status.replace("_", " ")}`, { type: "jobs", id: doc.id });
    return sendJson(res, 200, doc);
  }

  if (method === "GET") {
    const doc = db.get(collection, docId);
    return doc ? sendJson(res, 200, doc) : sendJson(res, 404, { error: "Not found" });
  }

  if (method === "PATCH" || method === "PUT") {
    let body;
    try { body = clean(await readJson(req, MAX_JSON_BYTES)); } catch (e) { return sendJson(res, e.status || 400, { error: e.message }); }
    const before = db.get(collection, docId);
    if (!before) return sendJson(res, 404, { error: "Not found" });
    if (collection === "jobs" && body.status && !JOB_STATUSES.includes(body.status)) delete body.status;
    if (collection === "jobs" && body.status === "paid" && !before.paid) { body.paid = true; body.paidAt = body.paidAt || db.now(); }
    const doc = db.update(collection, docId, body);
    // Keep the denormalised customer name on jobs in sync with renames.
    if (collection === "customers" && body.name && body.name !== before.name) {
      db.list("jobs").forEach((j) => { if (j.customerId === docId) db.update("jobs", j.id, { customerName: body.name }); });
    }
    if (collection === "jobs" && body.status && body.status !== before.status) {
      db.logActivity("jobs", `${describe("jobs", doc)} moved to ${body.status.replace("_", " ")}`, { type: "jobs", id: doc.id });
    } else if (collection === "tasks" && typeof body.done === "boolean" && body.done !== before.done) {
      if (body.done) db.logActivity("tasks", `Task done: ${doc.title}`, { type: "tasks", id: doc.id });
    } else {
      db.logActivity(collection, `${LABEL[collection] || collection} updated: ${describe(collection, doc)}`, { type: collection, id: doc.id });
    }
    return sendJson(res, 200, doc);
  }

  if (method === "DELETE") {
    const before = db.get(collection, docId);
    if (!before) return sendJson(res, 404, { error: "Not found" });
    db.remove(collection, docId);
    db.logActivity(collection, `${LABEL[collection] || collection} deleted: ${describe(collection, before)}`);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { error: "Method not allowed" });
}

module.exports = { handle, recordBooking, importBookingLog, JOB_STATUSES };
