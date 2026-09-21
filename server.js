/**
 * Coral Auto Spa — static site server.
 * Zero dependencies so it runs on Replit with no install step.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
const ROOT = path.join(__dirname, "public");
const BOOKINGS_FILE = path.join(__dirname, "bookings.log");
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

function handleBooking(req, res) {
  const chunks = [];
  let received = 0;
  let tooBig = false;

  req.on("data", (chunk) => {
    received += chunk.length;
    if (received > MAX_BODY_BYTES) {
      tooBig = true;
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on("end", () => {
    if (tooBig) return sendJson(res, 413, { error: "Those photos are too large. Try fewer, or smaller ones." });

    let data;
    try {
      data = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      return sendJson(res, 400, { error: "Invalid request" });
    }

    const clean = (v, max = 400) => String(v == null ? "" : v).trim().slice(0, max);

    const addons = Array.isArray(data.addons)
      ? data.addons.map((a) => clean(a, 40)).filter(Boolean).slice(0, 10)
      : [];

    const booking = {
      receivedAt: new Date().toISOString(),
      name: clean(data.name, 120),
      phone: clean(data.phone, 40),
      email: clean(data.email, 160),
      vehicle: clean(data.vehicle, 120),
      address: clean(data.address, 240),
      date: clean(data.date, 20),
      time: clean(data.time, 20),
      addons,
      seats: clean(data.seats, 4),
      notes: clean(data.notes, 1500)
    };

    const missing = ["name", "phone", "email", "vehicle", "address", "date", "time"]
      .filter((k) => !booking[k]);
    if (missing.length) {
      return sendJson(res, 400, { error: "Please fill in your name, phone, email, vehicle, address, date and time." });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(booking.email)) {
      return sendJson(res, 400, { error: "Please enter a valid email address." });
    }

    const ref = Date.now().toString(36);
    booking.ref = ref;
    booking.photos = savePhotos(data.photos, ref);

    // Append to a local log. Swap this for email/CRM when one is connected.
    fs.appendFile(BOOKINGS_FILE, JSON.stringify(booking) + "\n", (err) => {
      if (err) console.error("Could not record booking:", err.message);
      console.log(
        `[booking ${ref}] ${booking.name} — ${booking.vehicle} — ${booking.phone}` +
        (booking.addons.length ? ` — add-ons: ${booking.addons.join(", ")}` : "") +
        (booking.photos.length ? ` — ${booking.photos.length} photo(s)` : "")
      );
      sendJson(res, 200, {
        ok: true,
        message: `Thanks ${booking.name.split(" ")[0]}! Your request is in. We'll confirm your time and your price shortly.`
      });
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.url.split("?")[0] === "/api/booking") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
    return handleBooking(req, res);
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Coral Auto Spa running at http://${HOST}:${PORT}`);
});
