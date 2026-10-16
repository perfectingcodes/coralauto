/**
 * Coral Auto Spa — text message sending.
 *
 * Talks to Twilio over plain HTTPS so the project keeps its zero-dependency
 * promise. Credentials come from the environment:
 *
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM          the sending number, E.164 e.g. +12395550142
 *
 * Without all three, nothing is sent and nothing pretends otherwise: the
 * message is recorded with status "simulated" so it shows up in the admin
 * outbox, clearly marked as not delivered. We never report a send we did not
 * make.
 */
const https = require("https");
const querystring = require("querystring");

const SID = process.env.TWILIO_ACCOUNT_SID || "";
const TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const FROM = process.env.TWILIO_FROM || "";

function isConfigured() {
  return Boolean(SID && TOKEN && FROM);
}

/**
 * Normalize a US number to E.164. Returns null if it does not look like one,
 * because sending to a malformed number just burns money and confuses people.
 */
function toE164(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
  const d = digits.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

function post(path, form) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify(form);
    const req = https.request(
      {
        method: "POST",
        hostname: "api.twilio.com",
        path,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
          Authorization: "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64")
        },
        timeout: 15000
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          let parsed = null;
          try { parsed = JSON.parse(data); } catch { /* non-JSON error body */ }
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed || {});
          const msg = (parsed && (parsed.message || parsed.error_message)) || `HTTP ${res.statusCode}`;
          reject(new Error(msg));
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Twilio timed out")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Send one message.
 * Resolves to { status, to, providerId, error } — status is "sent",
 * "simulated" or "failed". It never throws, so one bad number cannot take
 * down a batch of reminders.
 */
async function send(to, body) {
  const number = toE164(to);
  if (!number) {
    return { status: "failed", to: to || "", error: "Not a valid phone number" };
  }

  if (!isConfigured()) {
    return { status: "simulated", to: number, error: null };
  }

  try {
    const res = await post(`/2010-04-01/Accounts/${SID}/Messages.json`, {
      To: number,
      From: FROM,
      Body: body
    });
    return { status: "sent", to: number, providerId: res.sid || null, error: null };
  } catch (err) {
    return { status: "failed", to: number, error: err.message };
  }
}

module.exports = { send, isConfigured, toE164 };
