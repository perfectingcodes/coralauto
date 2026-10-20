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
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
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

/** The single page, used for unknown paths. */
function sendIndexFallback(req, res) {
  fs.readFile(path.join(ROOT, "index.html"), (err, html) => {
    if (err) return send(res, 404, "Not found", { "Content-Type": MIME[".txt"] });
    send(res, 404, Buffer.from(injectBoot(html.toString("utf8"), req)), { "Content-Type": MIME[".html"] });
  });
}

/**
 * Stream a byte range straight off disk.
 *
 * Video is never read into memory whole. A browser playing a clip issues a
 * string of range requests, and buffering an 8MB file for each one is how you
 * run a small container out of memory — which is exactly what made the videos
 * fail to load on the deployed app while working fine locally.
 */
function streamFile(req, res, file, size, headers, isVideo) {
  let start = 0;
  let end = size - 1;
  let status = 200;
  const out = Object.assign({}, headers);

  if (isVideo) {
    out["Accept-Ranges"] = "bytes";
    const match = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range.trim());
    if (match) {
      let from = match[1] === "" ? null : Number(match[1]);
      let to = match[2] === "" ? null : Number(match[2]);

      // "bytes=-500" means the last 500 bytes.
      if (from === null) {
        if (to === null || to === 0) {
          return send(res, 416, "", { "Content-Range": `bytes */${size}` });
        }
        from = Math.max(0, size - to);
        to = size - 1;
      } else if (to === null || to >= size) {
        to = size - 1;
      }

      if (from >= size || from > to) {
        return send(res, 416, "", { "Content-Range": `bytes */${size}` });
      }

      start = from;
      end = to;
      status = 206;
      out["Content-Range"] = `bytes ${start}-${end}/${size}`;
    }
  }

  out["Content-Length"] = String(end - start + 1);
  res.writeHead(status, Object.assign({ "X-Content-Type-Options": "nosniff" }, out));

  if (req.method === "HEAD") return res.end();

  const stream = fs.createReadStream(file, { start, end });
  stream.on("error", () => res.destroy());
  // A viewer who scrubs or navigates away aborts mid-response; tear the read
  // down with it rather than leaking a file handle per abandoned request.
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}

function serveStatic(req, res) {
  let file = resolveFile(req.url);
  if (!file) return send(res, 403, "Forbidden", { "Content-Type": MIME[".txt"] });

  fs.stat(file, (err, stat) => {
    if (err) return sendIndexFallback(req, res);
    if (stat.isDirectory()) file = path.join(file, "index.html");

    fs.stat(file, (err2, stat2) => {
      if (err2 || !stat2.isFile()) return sendIndexFallback(req, res);

      const ext = path.extname(file).toLowerCase();
      // Media is immutable enough to cache hard; markup, CSS and JS revalidate
      // so a redeploy is picked up immediately.
      const isMedia = /\.(webp|png|jpe?g|svg|ico|woff2|mp4|m4v|webm|mov)$/.test(ext);
      const isVideo = /\.(mp4|m4v|webm|mov)$/.test(ext);
      const headers = {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": isMedia ? "public, max-age=604800" : "no-cache",
        "Last-Modified": stat2.mtime.toUTCString()
      };

      // HTML is the one thing read whole, because the language dictionaries
      // and business config are injected into it before it goes out.
      if (ext === ".html") {
        return fs.readFile(file, (readErr, html) => {
          if (readErr) return sendIndexFallback(req, res);
          send(res, 200, Buffer.from(injectBoot(html.toString("utf8"), req)), headers);
        });
      }

      streamFile(req, res, file, stat2.size, headers, isVideo);
    });
  });
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
  db.migrateAppointments();
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
