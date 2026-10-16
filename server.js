/**
 * Coral Auto Spa — static site server.
 * Zero dependencies so it runs on Replit with no install step.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const admin = require("./lib/admin");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
const ROOT = path.join(__dirname, "public");
const BOOKINGS_FILE = path.join(__dirname, "bookings.log");

const db = require("./lib/db");
const i18n = require("./lib/i18n");
const pricing = require("./lib/pricing");
const scheduling = require("./lib/scheduling");
const reminders = require("./lib/reminders");
const booking = require("./lib/booking");
const qr = require("./lib/qr");
const UPLOADS_DIR = path.join(__dirname, "uploads");

// Upload limits, kept in step with the client-side checks in main.js.
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = 30 * 1024 * 1024;   // 5 photos + fields, with headroom
const PHOTO_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ "X-Content-Type-Options": "nosniff" }, headers));
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { "Content-Type": MIME[".json"] });
}

/** Resolve a URL path to a file inside ROOT, or null if it escapes. */
function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const rel = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const full = path.resolve(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

function serveStatic(req, res) {
  let file = resolveFile(req.url);
  if (!file) return send(res, 403, "Forbidden", { "Content-Type": MIME[".txt"] });

  fs.stat(file, (err, stat) => {
    if (!err && stat.isDirectory()) file = path.join(file, "index.html");

    fs.readFile(file, (readErr, data) => {
      if (readErr) {
        // Unknown path: fall back to the single page.
        return fs.readFile(path.join(ROOT, "index.html"), (fallbackErr, html) => {
          if (fallbackErr) return send(res, 404, "Not found", { "Content-Type": MIME[".txt"] });
          send(res, 404, html, { "Content-Type": MIME[".html"] });
        });
      }

      const ext = path.extname(file).toLowerCase();

      // Inject language + business config into the page so the client has both
      // dictionaries before first paint. No extra request, no flash of the
      // wrong language.
      if (ext === ".html") {
        data = Buffer.from(injectBoot(data.toString("utf8"), req));
      }

      // Media is immutable enough to cache hard; markup, CSS and JS revalidate
      // so a redeploy is picked up immediately.
      const isMedia = /\.(webp|png|jpe?g|svg|ico|woff2)$/.test(ext);
      send(res, 200, data, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": isMedia ? "public, max-age=604800" : "no-cache",
        "Last-Modified": stat && stat.mtime ? stat.mtime.toUTCString() : new Date().toUTCString()
      });
    });
  });
}

/**
 * Decode the data: URLs the form sends and write them into uploads/.
 * Returns the saved filenames. Anything that fails validation is skipped
 * rather than failing the whole booking — the enquiry matters more.
 */
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

    const mime = match[1].toLowerCase();
    const ext = PHOTO_TYPES[mime];
    if (!ext) return;

    let buf;
    try {
      buf = Buffer.from(match[2], "base64");
    } catch {
      return;
    }
    if (!buf.length || buf.length > MAX_PHOTO_BYTES) return;

    // Name the file ourselves; never trust the client's filename.
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


/** Business contact details the public page may show. Empty fields stay hidden. */
function publicBusiness() {
  const b = db.getSettings().business || {};
  return {
    phone: b.phone || "",
    smsNumber: b.smsNumber || b.phone || "",
    email: b.email || "",
    instagram: b.instagram || "",
    serviceArea: b.serviceArea || ""
  };
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  let found = "";
  raw.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) found = decodeURIComponent(rest.join("="));
  });
  return found;
}

/** Which language to render first: ?lang= wins, then the cookie, then English. */
function langFor(req) {
  const url = new URL(req.url, "http://localhost");
  const q = url.searchParams.get("lang");
  if (q && i18n.LANGS.includes(q)) return q;
  const cookie = readCookie(req, "coral_lang");
  return i18n.LANGS.includes(cookie) ? cookie : i18n.DEFAULT_LANG;
}

function injectBoot(html, req) {
  const lang = langFor(req);
  const boot = {
    lang,
    dicts: { en: i18n.dict("en"), es: i18n.dict("es") },
    biz: publicBusiness(),
    prices: pricing.PRICES
  };
  // </script> inside JSON would end the tag early; escape the only sequence
  // that can do that.
  const json = JSON.stringify(boot).replace(/<\//g, "<\\/");
  const tag =
    '<script>window.__CORAL__=' + json + ';' +
    '(function(){try{var s=localStorage.getItem("coral.lang");' +
    'if(s&&s!=="en"){document.documentElement.lang=s;' +
    'document.documentElement.setAttribute("data-lang-pending","");}}catch(e){}})();' +
    '</script>';
  return html
    .replace("<!--CORAL_BOOT-->", tag)
    .replace('<html lang="en">', '<html lang="' + lang + '">');
}

function readJsonBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        aborted = true;
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (aborted) return reject(Object.assign(new Error("too large"), { code: "TOO_LARGE" }));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(Object.assign(new Error("bad json"), { code: "BAD_JSON" }));
      }
    });
    req.on("error", reject);
  });
}

/** Public booking / membership request. */
async function handleBooking(req, res) {
  let data;
  try {
    data = await readJsonBody(req, 30 * 1024 * 1024);
  } catch (err) {
    if (err.code === "TOO_LARGE") {
      return sendJson(res, 413, { error: "Those photos are too large. Try fewer, or smaller ones." });
    }
    return sendJson(res, 400, { error: "Invalid request" });
  }

  const result = booking.submit(data);

  if (result.status === 200) {
    // Keep the flat log too, so nothing that read it before breaks.
    fs.appendFile(
      BOOKINGS_FILE,
      JSON.stringify({ receivedAt: new Date().toISOString(), ref: result.body.ref, plan: result.body.plan, name: data.name }) + "\n",
      () => {}
    );
    console.log(`[${result.body.plan === "membership" ? "membership" : "booking"} ${result.body.ref}] ${String(data.name || "").slice(0, 60)}`);
  }

  return sendJson(res, result.status, result.body);
}

/** Open start times for a date, so the form only offers real slots. */
function handleAvailability(req, res) {
  const url = new URL(req.url, "http://localhost");
  const date = url.searchParams.get("date") || "";
  const plan = url.searchParams.get("plan") || "combo";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return sendJson(res, 400, { error: "Pass a date as YYYY-MM-DD" });
  }

  const slots = scheduling.slotsFor(date, plan);
  return sendJson(res, 200, {
    date,
    plan,
    slots,
    closed: slots.length === 0 && !scheduling.hours()[scheduling.dayKeyFor(date)]
  });
}

/** QR code pointing at the signup page, for showing a customer in person. */
function handleQr(req, res) {
  const url = new URL(req.url, "http://localhost");
  const target = url.searchParams.get("url") || "";
  if (!/^https?:\/\//i.test(target) || target.length > 400) {
    return sendJson(res, 400, { error: "Pass an absolute http(s) url" });
  }
  let svg;
  try {
    svg = qr.toSvg(target, { ecc: "M", scale: 8, margin: 4, dark: "#07131f", light: "#ffffff" });
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  return send(res, 200, svg, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "no-cache"
  });
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];

  if (urlPath === "/api/availability") {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
    return handleAvailability(req, res);
  }

  if (urlPath === "/api/qr") {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
    return handleQr(req, res);
  }

  if (urlPath === "/api/booking") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
    return handleBooking(req, res).catch(() => sendJson(res, 500, { error: "Server error" }));
  }

  if (urlPath.startsWith("/api/admin")) {
    return admin.handle(req, res, urlPath).catch((err) => {
      console.error("Admin API error:", err);
      if (!res.headersSent) sendJson(res, 500, { error: "Something went wrong" });
    });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  if (JOIN_PATHS.includes(urlPath)) {
    req.url = "/join.html" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
  }

  serveStatic(req, res);
});

admin.importBookingLog();

// Friendly URL for the in-person signup page.
const JOIN_PATHS = ["/join", "/join/", "/unirse", "/unirse/"];

server.listen(PORT, HOST, () => {
  console.log(`Coral Auto Spa running at http://${HOST}:${PORT}`);
  reminders.start();
  const sms = require("./lib/sms");
  if (!sms.isConfigured()) {
    console.log(
      "  Reminders: scheduled and queued, but TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /\n" +
      "  TWILIO_FROM are not set, so nothing is actually texted. Queued messages show\n" +
      "  in the admin outbox marked \"simulated\"."
    );
  }
  console.log(`Admin portal at http://${HOST}:${PORT}/admin`);
});
