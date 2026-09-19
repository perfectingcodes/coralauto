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

function handleBooking(req, res) {
  let body = "";
  let tooBig = false;

  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 12_000) {
      tooBig = true;
      req.destroy();
    }
  });

  req.on("end", () => {
    if (tooBig) return sendJson(res, 413, { error: "Request too large" });

    let data;
    try {
      data = JSON.parse(body || "{}");
    } catch {
      return sendJson(res, 400, { error: "Invalid request" });
    }

    const clean = (v, max = 400) => String(v == null ? "" : v).trim().slice(0, max);
    const booking = {
      receivedAt: new Date().toISOString(),
      name: clean(data.name, 120),
      phone: clean(data.phone, 40),
      email: clean(data.email, 160),
      service: clean(data.service, 60),
      vehicle: clean(data.vehicle, 120),
      notes: clean(data.notes, 1000)
    };

    if (!booking.name || !booking.phone || !booking.email || !booking.service) {
      return sendJson(res, 400, { error: "Name, phone, email and service are required." });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(booking.email)) {
      return sendJson(res, 400, { error: "Please enter a valid email address." });
    }

    // Append to a local log. Swap this for email/CRM when one is connected.
    fs.appendFile(BOOKINGS_FILE, JSON.stringify(booking) + "\n", (err) => {
      if (err) console.error("Could not record booking:", err.message);
      console.log(`[booking] ${booking.name} — ${booking.service} — ${booking.phone}`);
      sendJson(res, 200, {
        ok: true,
        message: `Thanks ${booking.name.split(" ")[0]}! Your request is in. We'll confirm shortly.`
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
