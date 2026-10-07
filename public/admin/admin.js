/* ==========================================================================
   Coral Auto Spa — admin portal
   Single-page app, no build step, no dependencies. Talks to /api/admin.
   ========================================================================== */
(() => {
"use strict";

/* ---------- tiny helpers ---------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (name, cls) => `<svg class="ic ${cls || ""}"><use href="#i-${name}"/></svg>`;
const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const money2 = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = (s) => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const monthKey = (s) => (s || "").slice(0, 7);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtDate = (s, opts) => {
  if (!s) return "";
  const d = s.length === 10 ? parseYmd(s) : new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString("en-US", opts || { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};
const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${pad(m || 0)} ${ampm}`;
};
const relTime = (iso) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(iso);
};
const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const title = (s) => String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const sum = (arr, fn) => arr.reduce((t, x) => t + (Number(fn ? fn(x) : x) || 0), 0);
const by = (key, dir = 1) => (a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0);
const telHref = (p) => "tel:" + String(p || "").replace(/[^\d+]/g, "");
const mapsHref = (a) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(a || "");

const STATUSES = ["new", "quoted", "scheduled", "in_progress", "completed", "paid", "cancelled"];
const STATUS_LABEL = { new: "New lead", quoted: "Quoted", scheduled: "Scheduled", in_progress: "In progress", completed: "Completed", paid: "Paid", cancelled: "Cancelled" };
const PLATFORMS = ["Instagram", "Facebook", "TikTok", "Google", "Nextdoor", "YouTube", "Other"];
const POST_STATUSES = ["idea", "drafted", "scheduled", "posted"];
const PAYMENT_METHODS = ["Cash", "Zelle", "Venmo", "Cash App", "Card", "Check", "Other"];
const CUSTOMER_TAGS = ["New", "Repeat", "VIP", "Fleet", "Needs follow-up", "Referred"];

/* ---------- state ---------- */
const S = {
  data: null,
  me: null,
  route: { name: "dashboard", id: null, sub: null, q: "" },
  ui: {
    jobsView: localStorage.getItem("cas.jobsView") || "board",
    jobsStatus: "all",
    jobsQuery: "",
    calMonth: today().slice(0, 7),
    socialTab: "schedule",
    socialPlatform: "all",
    tasksTab: "open",
    financeMonth: today().slice(0, 7),
    customersTag: "all",
    customersQuery: "",
    directoryCat: "all",
    directoryQuery: ""
  }
};

/* ---------- API ---------- */
async function api(method, path, body) {
  const res = await fetch("/api/admin" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin"
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (res.status === 401 && path !== "/login") { showLogin(); throw new Error("Signed out"); }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

/** Local mutation helpers keep the in-memory copy in step with the server. */
const col = (name) => S.data[name];
async function createDoc(collection, doc) {
  const saved = await api("POST", `/${collection}`, doc);
  col(collection).push(saved);
  return saved;
}
async function patchDoc(collection, id, patch) {
  const saved = await api("PATCH", `/${collection}/${id}`, patch);
  const items = col(collection);
  const i = items.findIndex((d) => d.id === id);
  if (i > -1) items[i] = saved; else items.push(saved);
  // Renames ripple into the denormalised job field.
  if (collection === "customers" && patch.name) col("jobs").forEach((j) => { if (j.customerId === id) j.customerName = patch.name; });
  return saved;
}
async function deleteDoc(collection, id) {
  await api("DELETE", `/${collection}/${id}`);
  const items = col(collection);
  const i = items.findIndex((d) => d.id === id);
  if (i > -1) items.splice(i, 1);
}
async function setJobStatus(id, status) {
  const saved = await api("POST", `/jobs/${id}/status`, { status });
  const items = col("jobs");
  const i = items.findIndex((d) => d.id === id);
  if (i > -1) items[i] = saved;
  return saved;
}
async function refreshActivity() {
  try { S.data.activity = await api("GET", "/activity"); } catch { /* non-fatal */ }
}
const getDoc = (collection, id) => col(collection).find((d) => d.id === id) || null;

/* ---------- toasts ---------- */
function toast(msg, kind) {
  const el = document.createElement("div");
  el.className = "toast" + (kind === "error" ? " toast--error" : "");
  el.innerHTML = icon(kind === "error" ? "alert" : "check") + `<span>${esc(msg)}</span>`;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 320); }, 2800);
}
const fail = (err) => { console.error(err); toast(err.message || "Something went wrong", "error"); };

/* ---------- modal ---------- */
const modal = $("#modal");
function openModal(titleText, html, wide) {
  $("#modal-title").textContent = titleText;
  $("#modal-body").innerHTML = html;
  modal.querySelector(".modal__panel").classList.toggle("modal__panel--wide", !!wide);
  modal.hidden = false;
  document.body.classList.add("is-locked");
  const first = $("#modal-body").querySelector("input:not([type=hidden]):not([disabled]), select, textarea");
  if (first) setTimeout(() => first.focus(), 30);
}
function closeModal() {
  modal.hidden = true;
  document.body.classList.remove("is-locked");
  $("#modal-body").innerHTML = "";
}
modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

function confirmDialog(message, label) {
  return new Promise((resolve) => {
    openModal("Are you sure?", `
      <p style="margin-bottom:18px">${esc(message)}</p>
      <div class="form__actions" style="border:0;margin:0;padding:0">
        <button class="btn btn--ghost" type="button" data-cancel>Cancel</button>
        <button class="btn btn--danger" type="button" data-ok>${esc(label || "Delete")}</button>
      </div>`);
    $("#modal-body [data-cancel]").onclick = () => { closeModal(); resolve(false); };
    $("#modal-body [data-ok]").onclick = () => { closeModal(); resolve(true); };
  });
}

/* ---------- generic form builder ----------
   A field: { key, label, type, options, required, span, placeholder, hint, showIf(values) }
   Types: text tel email url number money date time textarea select chips tags checkbox */
function optionList(opts) {
  return (opts || []).map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

function renderField(f, v) {
  const id = "f-" + f.key;
  const span = f.span === 2 ? " span-2" : "";
  const req = f.required ? "" : "";
  const label = `<span class="field__label">${esc(f.label)}${f.required ? "" : f.optional === false ? "" : " <small>(optional)</small>"}</span>`;
  const hint = f.hint ? `<span class="field__hint">${esc(f.hint)}</span>` : "";
  const err = `<span class="field__error" data-error hidden></span>`;
  let control = "";
  switch (f.type || "text") {
    case "textarea":
      control = `<textarea class="field__textarea" id="${id}" name="${f.key}" placeholder="${esc(f.placeholder || "")}"${f.rows ? ` rows="${f.rows}"` : ""}>${esc(v || "")}</textarea>`;
      break;
    case "select": {
      const opts = optionList(typeof f.options === "function" ? f.options() : f.options);
      const empty = f.required && v ? "" : `<option value="">${esc(f.placeholder || "Select…")}</option>`;
      control = `<select class="field__select" id="${id}" name="${f.key}">${empty}${opts.map((o) => `<option value="${esc(o.value)}"${String(v) === String(o.value) ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
      break;
    }
    case "chips": {
      const opts = optionList(typeof f.options === "function" ? f.options() : f.options);
      const on = new Set(Array.isArray(v) ? v : []);
      control = `<div class="chips" data-chips="${f.key}">${opts.map((o) => `<label class="chip${on.has(o.value) ? " is-on" : ""}" data-value="${esc(o.value)}"><input type="checkbox"${on.has(o.value) ? " checked" : ""}>${esc(o.label)}</label>`).join("")}</div>`;
      break;
    }
    case "tags":
      control = `<input class="field__input" id="${id}" name="${f.key}" data-tags value="${esc(Array.isArray(v) ? v.join(", ") : v || "")}" placeholder="${esc(f.placeholder || "Comma separated")}">`;
      break;
    case "checkbox":
      return `<div class="field field--inline${span}" data-field="${f.key}"><input type="checkbox" id="${id}" name="${f.key}"${v ? " checked" : ""}><label for="${id}" class="field__label">${esc(f.label)}</label></div>`;
    case "money":
      control = `<div class="money"><input class="field__input" id="${id}" name="${f.key}" type="number" step="0.01" min="0" inputmode="decimal" value="${v == null || v === "" ? "" : esc(v)}" placeholder="${esc(f.placeholder || "0")}"></div>`;
      break;
    default:
      control = `<input class="field__input" id="${id}" name="${f.key}" type="${f.type || "text"}" value="${esc(v == null ? "" : v)}" placeholder="${esc(f.placeholder || "")}"${f.type === "number" ? ` step="${f.step || 1}" inputmode="numeric"` : ""}${f.type === "tel" ? ' inputmode="tel" autocomplete="tel"' : ""}${f.type === "email" ? ' autocomplete="email"' : ""}>`;
  }
  return `<label class="field${span}" data-field="${f.key}">${label}${control}${hint}${err}</label>`;
}

function readForm(fields, root) {
  const out = {};
  fields.forEach((f) => {
    const wrap = root.querySelector(`[data-field="${f.key}"]`);
    if (!wrap) return;
    if (f.type === "chips") {
      out[f.key] = $$(".chip.is-on", wrap).map((c) => c.dataset.value);
      return;
    }
    const el = wrap.querySelector("input, select, textarea");
    if (!el) return;
    if (f.type === "checkbox") out[f.key] = el.checked;
    else if (f.type === "tags") out[f.key] = el.value.split(",").map((s) => s.trim()).filter(Boolean);
    else if (f.type === "number" || f.type === "money") out[f.key] = el.value === "" ? null : Number(el.value);
    else out[f.key] = el.value.trim();
  });
  return out;
}

/**
 * Open a modal form. cfg: { title, fields, values, submitLabel, onSubmit, onDelete, deleteLabel, wide, intro }
 * onSubmit receives the values and may throw to keep the dialog open.
 */
function openForm(cfg) {
  const values = cfg.values || {};
  const html = `
    ${cfg.intro ? `<p class="muted" style="margin-bottom:14px">${cfg.intro}</p>` : ""}
    <form class="form" id="mform" novalidate>
      ${cfg.fields.map((f) => renderField(f, values[f.key] != null ? values[f.key] : f.default)).join("")}
      <div class="form__actions">
        ${cfg.onDelete ? `<button class="btn btn--danger" type="button" data-delete>${icon("trash")}${esc(cfg.deleteLabel || "Delete")}</button>` : ""}
        <button class="btn btn--ghost" type="button" data-close>Cancel</button>
        <button class="btn btn--primary" type="submit">${esc(cfg.submitLabel || "Save")}</button>
      </div>
    </form>`;
  openModal(cfg.title, html, cfg.wide);
  const form = $("#mform");

  const applyShowIf = () => {
    const vals = readForm(cfg.fields, form);
    cfg.fields.forEach((f) => {
      if (!f.showIf) return;
      const wrap = form.querySelector(`[data-field="${f.key}"]`);
      if (wrap) wrap.hidden = !f.showIf(vals);
    });
    if (cfg.onChange) cfg.onChange(vals, form);
  };
  form.addEventListener("input", applyShowIf);
  form.addEventListener("change", applyShowIf);
  form.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) { e.preventDefault(); chip.classList.toggle("is-on"); applyShowIf(); }
  });
  applyShowIf();

  if (cfg.onDelete) {
    form.querySelector("[data-delete]").onclick = async () => {
      const ok = await confirmDialog(cfg.deleteMessage || "This cannot be undone.", cfg.deleteLabel || "Delete");
      if (!ok) return;
      try { await cfg.onDelete(); } catch (err) { fail(err); }
    };
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const vals = readForm(cfg.fields, form);
    let valid = true;
    cfg.fields.forEach((f) => {
      const wrap = form.querySelector(`[data-field="${f.key}"]`);
      if (!wrap) return;
      const errEl = wrap.querySelector("[data-error]");
      const visible = !wrap.hidden;
      let msg = "";
      const v = vals[f.key];
      const empty = v == null || v === "" || (Array.isArray(v) && !v.length);
      if (visible && f.required && empty) msg = "Required";
      else if (visible && f.type === "email" && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) msg = "Enter a valid email";
      else if (visible && f.validate) msg = f.validate(v, vals) || "";
      wrap.classList.toggle("has-error", !!msg);
      if (errEl) { errEl.textContent = msg; errEl.hidden = !msg; }
      if (msg) valid = false;
    });
    if (!valid) return;
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      await cfg.onSubmit(vals);
      closeModal();
    } catch (err) {
      fail(err);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------- schemas (one place for every record type's fields) ---------- */
const settings = () => S.data.settings;
const customerOptions = () => col("customers").slice().sort(by("name")).map((c) => ({ value: c.id, label: c.name + (c.phone ? ` · ${c.phone}` : "") }));
const jobOptions = () => col("jobs").slice().sort(by("date", -1)).map((j) => ({ value: j.id, label: `${j.customerName || "Job"} — ${j.vehicle || "vehicle"}${j.date ? ` (${fmtDate(j.date)})` : ""}` }));
const directoryOptions = (cat) => col("directory").filter((d) => !cat || cat.includes(d.category)).sort(by("name")).map((d) => ({ value: d.id, label: d.name }));
const teamOptions = () => (settings().team || []).map((t) => t.name).filter(Boolean);

const FIELDS = {
  customers: () => [
    { key: "name", label: "Full name", required: true },
    { key: "phone", label: "Phone", type: "tel" },
    { key: "email", label: "Email", type: "email" },
    { key: "source", label: "How they found us", type: "select", options: settings().leadSources },
    { key: "address", label: "Service address", span: 2, placeholder: "Street, city" },
    { key: "vehicles", label: "Vehicles", type: "tags", span: 2, placeholder: "2019 Toyota Tacoma, 2021 Honda Civic", hint: "Comma separated" },
    { key: "tags", label: "Tags", type: "chips", options: CUSTOMER_TAGS, span: 2 },
    { key: "notes", label: "Notes", type: "textarea", span: 2, placeholder: "Gate code, preferences, dog in the back seat…" }
  ],
  jobs: (ctx) => [
    { key: "customerId", label: "Customer", type: "select", required: true, options: () => [{ value: "__new", label: "+ New customer" }].concat(customerOptions()), placeholder: "Choose a customer" },
    { key: "newName", label: "Customer name", required: true, showIf: (v) => v.customerId === "__new" },
    { key: "newPhone", label: "Phone", type: "tel", showIf: (v) => v.customerId === "__new" },
    { key: "newEmail", label: "Email", type: "email", showIf: (v) => v.customerId === "__new" },
    { key: "vehicle", label: "Vehicle", required: true, placeholder: "Year, make, model" },
    { key: "status", label: "Status", type: "select", required: true, options: STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })), default: ctx && ctx.status || "scheduled" },
    { key: "date", label: "Date", type: "date", default: ctx && ctx.date },
    { key: "time", label: "Time", type: "time" },
    { key: "address", label: "Service address", span: 2 },
    { key: "service", label: "Service", type: "select", options: () => settings().services.map((s) => s.name), default: settings().services[0] && settings().services[0].name },
    { key: "price", label: "Price", type: "money", default: settings().services[0] && settings().services[0].basePrice, hint: "Confirmed with the customer before work starts" },
    { key: "addons", label: "Add-ons", type: "chips", span: 2, options: () => settings().addons.map((a) => a.name) },
    { key: "seats", label: "Seats to shampoo", type: "number", showIf: (v) => (v.addons || []).some((a) => /seat/i.test(a)) },
    { key: "assignedTo", label: "Assigned to", type: "select", options: teamOptions, showIf: () => teamOptions().length > 0 },
    { key: "paymentMethod", label: "Payment method", type: "select", options: PAYMENT_METHODS },
    { key: "source", label: "Lead source", type: "select", options: settings().leadSources },
    { key: "notes", label: "Notes", type: "textarea", span: 2, placeholder: "Condition, access instructions, anything the crew should know" }
  ],
  directory: () => [
    { key: "name", label: "Business / person", required: true },
    { key: "category", label: "Category", type: "select", required: true, options: settings().directoryCategories },
    { key: "contact", label: "Contact name" },
    { key: "phone", label: "Phone", type: "tel" },
    { key: "email", label: "Email", type: "email" },
    { key: "website", label: "Website", type: "url", placeholder: "https://" },
    { key: "address", label: "Address", span: 2 },
    { key: "rating", label: "Rating", type: "select", options: ["5", "4", "3", "2", "1"].map((r) => ({ value: r, label: "★".repeat(Number(r)) })) },
    { key: "referralFee", label: "Referral / commission", placeholder: "e.g. $10 per booking" },
    { key: "notes", label: "Notes", type: "textarea", span: 2, placeholder: "Account number, pricing, who to ask for…" }
  ],
  posts: (ctx) => [
    { key: "title", label: "Post title", required: true, span: 2, placeholder: "Before & after — Tacoma pet hair rescue" },
    { key: "platform", label: "Platform", type: "select", required: true, options: PLATFORMS, default: "Instagram" },
    { key: "status", label: "Status", type: "select", required: true, options: POST_STATUSES.map((s) => ({ value: s, label: title(s) })), default: ctx && ctx.status || "idea" },
    { key: "date", label: "Publish date", type: "date", default: ctx && ctx.date },
    { key: "time", label: "Time", type: "time" },
    { key: "pillar", label: "Content pillar", type: "select", options: settings().socialPillars },
    { key: "jobId", label: "From job (for photos)", type: "select", options: jobOptions },
    { key: "caption", label: "Caption", type: "textarea", span: 2, rows: 5 },
    { key: "hashtags", label: "Hashtags", span: 2, placeholder: "#capecoral #mobiledetailing #swfl" },
    { key: "assetNote", label: "Media needed", span: 2, placeholder: "3 before/after photos, 15s wash clip" }
  ],
  expenses: () => [
    { key: "date", label: "Date", type: "date", required: true, default: today() },
    { key: "amount", label: "Amount", type: "money", required: true },
    { key: "vendor", label: "Paid to", required: true, placeholder: "Chemical Guys, Shell, Square…" },
    { key: "category", label: "Category", type: "select", required: true, options: settings().expenseCategories },
    { key: "directoryId", label: "Directory listing", type: "select", options: () => directoryOptions() },
    { key: "recurring", label: "Recurring monthly cost", type: "checkbox" },
    { key: "notes", label: "Notes", type: "textarea", span: 2 }
  ],
  inventory: () => [
    { key: "name", label: "Item", required: true, span: 2, placeholder: "All-purpose cleaner 1gal" },
    { key: "category", label: "Category", placeholder: "Chemicals, towels, tools…" },
    { key: "unit", label: "Unit", placeholder: "bottle, gallon, pack" },
    { key: "qty", label: "In stock", type: "number", required: true, default: 0 },
    { key: "reorderAt", label: "Reorder when below", type: "number", default: 1 },
    { key: "cost", label: "Unit cost", type: "money" },
    { key: "supplierId", label: "Supplier", type: "select", options: () => directoryOptions(["Supplier", "Vendor"]) },
    { key: "notes", label: "Notes", type: "textarea", span: 2, placeholder: "Where to buy, dilution ratio…" }
  ],
  tasks: (ctx) => [
    { key: "title", label: "Task", required: true, span: 2, placeholder: "Call back about the quote" },
    { key: "due", label: "Due", type: "date", default: ctx && ctx.due },
    { key: "priority", label: "Priority", type: "select", options: ["low", "medium", "high"].map((p) => ({ value: p, label: title(p) })), default: "medium" },
    { key: "jobId", label: "Related job", type: "select", options: jobOptions, default: ctx && ctx.jobId },
    { key: "customerId", label: "Related customer", type: "select", options: customerOptions, default: ctx && ctx.customerId },
    { key: "assignedTo", label: "Assigned to", type: "select", options: teamOptions, showIf: () => teamOptions().length > 0 },
    { key: "notes", label: "Notes", type: "textarea", span: 2 }
  ]
};

const LABELS = { customers: "customer", jobs: "job", directory: "directory listing", posts: "post", expenses: "expense", inventory: "item", tasks: "task" };

/** Open the standard create/edit dialog for any collection. */
function editRecord(collection, doc, ctx, after) {
  const isNew = !doc;
  const fields = FIELDS[collection](ctx || {});
  const values = Object.assign({}, doc || {});
  openForm({
    title: `${isNew ? "New" : "Edit"} ${LABELS[collection]}`,
    fields,
    values,
    wide: collection === "jobs" || collection === "posts",
    submitLabel: isNew ? `Add ${LABELS[collection]}` : "Save changes",
    onSubmit: async (vals) => {
      let saved;
      if (collection === "jobs") saved = await saveJob(vals, doc);
      else saved = isNew ? await createDoc(collection, vals) : await patchDoc(collection, doc.id, vals);
      toast(isNew ? `${title(LABELS[collection])} added` : "Saved");
      refreshActivity().then(render);
      if (after) after(saved); else render();
    },
    onDelete: isNew ? null : async () => {
      await deleteDoc(collection, doc.id);
      closeModal();
      toast(`${title(LABELS[collection])} deleted`);
      if (S.route.id === doc.id) go(`/${collection}`); else render();
    },
    deleteMessage: `Delete this ${LABELS[collection]}? This cannot be undone.`
  });
}

/** Jobs can create their customer inline. */
async function saveJob(vals, existing) {
  const doc = Object.assign({}, vals);
  if (doc.customerId === "__new") {
    const customer = await createDoc("customers", {
      name: doc.newName, phone: doc.newPhone || "", email: doc.newEmail || "",
      address: doc.address || "", vehicles: doc.vehicle ? [doc.vehicle] : [], tags: ["New"], source: doc.source || "", notes: ""
    });
    doc.customerId = customer.id;
  }
  delete doc.newName; delete doc.newPhone; delete doc.newEmail;
  const customer = getDoc("customers", doc.customerId);
  if (customer) {
    doc.customerName = customer.name;
    doc.phone = customer.phone;
    doc.email = customer.email;
    if (!doc.address && customer.address) doc.address = customer.address;
    if (doc.vehicle && !(customer.vehicles || []).includes(doc.vehicle)) {
      await patchDoc("customers", customer.id, { vehicles: (customer.vehicles || []).concat(doc.vehicle) });
    }
  }
  if (doc.status === "paid") doc.paid = true;
  return existing ? patchDoc("jobs", existing.id, doc) : createDoc("jobs", doc);
}

/* ---------- routing ---------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [pathPart, query] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  const q = new URLSearchParams(query || "");
  return { name: parts[0] || "dashboard", id: parts[1] || null, sub: parts[2] || null, q: q.get("q") || "" };
}
const go = (path) => { location.hash = "#" + path; };
window.addEventListener("hashchange", () => { S.route = parseHash(); render(); window.scrollTo(0, 0); });

const NAV = [
  { group: "Overview" },
  { name: "dashboard", label: "Dashboard", icon: "grid" },
  { name: "leads", label: "Leads", icon: "inbox", badge: () => col("jobs").filter((j) => j.status === "new").length },
  { name: "calendar", label: "Calendar", icon: "calendar" },
  { group: "Operations" },
  { name: "jobs", label: "Jobs", icon: "briefcase" },
  { name: "customers", label: "Customers", icon: "users" },
  { name: "tasks", label: "Tasks", icon: "check-square", badge: () => col("tasks").filter((t) => !t.done && t.due && t.due < today()).length },
  { group: "Growth" },
  { name: "social", label: "Social media", icon: "megaphone" },
  { name: "directory", label: "Directory", icon: "book" },
  { group: "Business" },
  { name: "finance", label: "Finance", icon: "dollar" },
  { name: "inventory", label: "Inventory", icon: "box" },
  { name: "settings", label: "Settings", icon: "settings" }
];
const PAGE_TITLES = { dashboard: "Dashboard", leads: "Leads", calendar: "Calendar", jobs: "Jobs", customers: "Customers", tasks: "Tasks", social: "Social media", directory: "Directory", finance: "Finance", inventory: "Inventory", settings: "Settings", search: "Search" };

function renderNav() {
  $("#nav").innerHTML = NAV.map((n) => {
    if (n.group) return `<div class="nav__group">${n.group}</div>`;
    const count = n.badge ? n.badge() : 0;
    return `<a class="nav__link${S.route.name === n.name ? " is-active" : ""}" href="#/${n.name}">${icon(n.icon)}<span>${n.label}</span>${count ? `<span class="nav__badge">${count}</span>` : ""}</a>`;
  }).join("");
  $("#page-title").textContent = PAGE_TITLES[S.route.name] || "Admin";
}

/* ---------- shell ---------- */
function openNav(open) {
  $("#sidebar").classList.toggle("is-open", open);
  $("#scrim").hidden = !open;
}
$("#nav-open").onclick = () => openNav(true);
$("#nav-close").onclick = () => openNav(false);
$("#scrim").onclick = () => openNav(false);
$("#nav").addEventListener("click", () => openNav(false));

$("#logout").onclick = async () => {
  try { await api("POST", "/logout"); } catch { /* ignore */ }
  S.data = null;
  showLogin();
};

const quickmenu = $("#quickmenu");
$("#quick-add").onclick = (e) => {
  e.stopPropagation();
  if (!quickmenu.hidden) { quickmenu.hidden = true; return; }
  quickmenu.innerHTML = [
    ["jobs", "briefcase", "Job"], ["customers", "users", "Customer"], ["tasks", "check-square", "Task"],
    ["posts", "megaphone", "Social post"], ["expenses", "dollar", "Expense"], ["directory", "book", "Directory listing"], ["inventory", "box", "Inventory item"]
  ].map(([c, i, l]) => `<button type="button" data-new="${c}">${icon(i)}${l}</button>`).join("");
  const r = e.currentTarget.getBoundingClientRect();
  quickmenu.style.top = r.bottom + 6 + "px";
  quickmenu.style.right = Math.max(10, window.innerWidth - r.right) + "px";
  quickmenu.style.left = "auto";
  quickmenu.hidden = false;
};
quickmenu.addEventListener("click", (e) => {
  const b = e.target.closest("[data-new]");
  if (!b) return;
  quickmenu.hidden = true;
  editRecord(b.dataset.new, null, {}, (saved) => {
    if (b.dataset.new === "jobs") go(`/jobs/${saved.id}`);
    else if (b.dataset.new === "customers") go(`/customers/${saved.id}`);
    else render();
  });
});
document.addEventListener("click", () => { quickmenu.hidden = true; });

const searchInput = $("#global-search");
if (window.innerWidth < 600) searchInput.placeholder = "Search";
let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  searchTimer = setTimeout(() => {
    if (q.length >= 2) go("/search?q=" + encodeURIComponent(q));
    else if (!q && S.route.name === "search") go("/dashboard");
  }, 250);
});
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { clearTimeout(searchTimer); const q = searchInput.value.trim(); if (q) go("/search?q=" + encodeURIComponent(q)); } });

/* ---------- login ---------- */
function showLogin() {
  $("#app").hidden = true;
  $("#login").hidden = false;
  setTimeout(() => $("#login-password").focus(), 30);
}
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#login-submit");
  const errEl = $("#login-error");
  btn.disabled = true; errEl.hidden = true;
  try {
    await api("POST", "/login", { password: $("#login-password").value });
    $("#login-password").value = "";
    await boot();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

async function boot() {
  try {
    S.me = await api("GET", "/me");
  } catch {
    return showLogin();
  }
  S.data = await api("GET", "/bootstrap");
  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#dev-banner").hidden = !S.me.devPassword;
  S.route = parseHash();
  render();
}

/* ---------- shared view pieces ---------- */
const pill = (status, label) => `<span class="pill pill--${status}">${esc(label || STATUS_LABEL[status] || title(status))}</span>`;
const emptyState = (iconName, heading, text, action) => `
  <div class="empty">${icon(iconName)}<strong>${esc(heading)}</strong><span>${esc(text || "")}</span>${action ? `<div style="margin-top:14px">${action}</div>` : ""}</div>`;

const jobTotal = (j) => Number(j.price) || 0;
const customerJobs = (id) => col("jobs").filter((j) => j.customerId === id);
const customerValue = (id) => sum(customerJobs(id).filter((j) => j.paid), jobTotal);

function jobCard(j) {
  const addons = (j.addons || []).length;
  return `
    <article class="jobcard" draggable="true" data-id="${j.id}">
      <div class="jobcard__top">
        <div class="jobcard__name">${esc(j.customerName || "Unnamed")}</div>
        <div class="jobcard__price">${money(j.price)}</div>
      </div>
      <div class="jobcard__meta">
        ${j.vehicle ? `<span>${icon("car")}${esc(j.vehicle)}</span>` : ""}
        ${j.date ? `<span>${icon("calendar")}${fmtDate(j.date)}${j.time ? ` · ${fmtTime(j.time)}` : ""}</span>` : `<span class="muted">${icon("calendar")}No date</span>`}
      </div>
      <div class="jobcard__foot">
        ${addons ? `<span class="pill">${addons} add-on${addons > 1 ? "s" : ""}</span>` : ""}
        ${(j.photos || []).length ? `<span class="pill">${icon("image")}${j.photos.length}</span>` : ""}
        <span class="spacer"></span>
        <div class="jobcard__move">
          <button type="button" data-move="-1" title="Move back">${icon("back")}</button>
          <button type="button" data-move="1" title="Move forward">${icon("arrow")}</button>
        </div>
      </div>
    </article>`;
}

/* ==========================================================================
   Views
   ========================================================================== */
const V = {};

/* ---------- dashboard ---------- */
V.dashboard = () => {
  const jobs = col("jobs");
  const t = today();
  const thisMonth = t.slice(0, 7);
  const lastMonth = monthKey(ymd(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)));
  const revenue = (m) => sum(jobs.filter((j) => j.paid && monthKey(j.paidAt ? j.paidAt.slice(0, 10) : j.date) === m), jobTotal);
  const rev = revenue(thisMonth), prev = revenue(lastMonth);
  const weekEnd = addDays(t, 7);
  const upcoming = jobs.filter((j) => ["scheduled", "in_progress", "quoted"].includes(j.status) && j.date && j.date >= t && j.date <= weekEnd).sort(by("date"));
  const leads = jobs.filter((j) => j.status === "new").sort(by("receivedAt", -1));
  const outstanding = jobs.filter((j) => j.status === "completed" && !j.paid);
  const tasks = col("tasks").filter((x) => !x.done).sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1).slice(0, 6);
  const lowStock = col("inventory").filter((i) => Number(i.qty) <= Number(i.reorderAt || 0));
  const posts = col("posts").filter((p) => p.date && p.date >= t && p.date <= weekEnd && p.status !== "posted").sort(by("date"));
  const activity = col("activity").slice(-8).reverse();
  const change = prev ? Math.round(((rev - prev) / prev) * 100) : null;

  // Group upcoming into agenda days.
  const days = {};
  upcoming.forEach((j) => { (days[j.date] = days[j.date] || []).push(j); });

  return `
    <div class="grid grid--4" style="margin-bottom:18px">
      <div class="card stat">${icon("dollar", "stat__icon")}<span class="stat__label">Revenue · ${MONTHS[Number(thisMonth.slice(5)) - 1]}</span><span class="stat__value">${money(rev)}</span>
        <span class="stat__sub ${change == null ? "" : change >= 0 ? "up" : "down"}">${change == null ? `${money(prev)} last month` : `${change >= 0 ? "+" : ""}${change}% vs last month`}</span></div>
      <div class="card stat">${icon("briefcase", "stat__icon")}<span class="stat__label">Jobs next 7 days</span><span class="stat__value">${upcoming.length}</span><span class="stat__sub">${money(sum(upcoming, jobTotal))} booked</span></div>
      <div class="card stat">${icon("inbox", "stat__icon")}<span class="stat__label">New leads</span><span class="stat__value">${leads.length}</span><span class="stat__sub">${leads.length ? "Waiting for a reply" : "Inbox is clear"}</span></div>
      <div class="card stat">${icon("clock", "stat__icon")}<span class="stat__label">Awaiting payment</span><span class="stat__value">${money(sum(outstanding, jobTotal))}</span><span class="stat__sub">${outstanding.length} completed job${outstanding.length === 1 ? "" : "s"}</span></div>
    </div>

    <div class="grid grid--main">
      <div class="stack">
        <section class="card">
          <div class="card__head"><h3>Schedule · next 7 days</h3><span class="spacer"></span><a class="btn btn--ghost btn--sm" href="#/calendar">${icon("calendar")}Calendar</a><button class="btn btn--primary btn--sm" type="button" data-new="jobs">${icon("plus")}Job</button></div>
          <div class="card__body">
            ${upcoming.length ? `<div class="agenda">${Object.keys(days).sort().map((d) => agendaDay(d, days[d].map(jobAgendaItem))).join("")}</div>`
              : emptyState("calendar", "Nothing scheduled this week", "Convert a lead or add a job to fill the calendar.")}
          </div>
        </section>

        <section class="card">
          <div class="card__head"><h3>Leads to reply to</h3><span class="spacer"></span><a class="btn btn--ghost btn--sm" href="#/leads">All leads ${icon("chevron")}</a></div>
          <div class="list">
            ${leads.length ? leads.slice(0, 5).map(leadRow).join("") : emptyState("inbox", "No new leads", "Website booking requests land here automatically.")}
          </div>
        </section>

        <section class="card">
          <div class="card__head"><h3>Recent activity</h3></div>
          <div class="timeline">
            ${activity.length ? activity.map(activityRow).join("") : `<div class="empty">Nothing yet.</div>`}
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card__head"><h3>Tasks</h3><span class="spacer"></span><button class="btn btn--ghost btn--sm" type="button" data-new="tasks">${icon("plus")}Task</button></div>
          <div class="list">
            ${tasks.length ? tasks.map(taskRow).join("") : `<div class="empty">All caught up.</div>`}
          </div>
          ${col("tasks").filter((x) => !x.done).length > 6 ? `<a class="card__foot" href="#/tasks" style="display:block">View all tasks →</a>` : ""}
        </section>

        <section class="card">
          <div class="card__head"><h3>Social · this week</h3><span class="spacer"></span><a class="btn btn--ghost btn--sm" href="#/social">Planner ${icon("chevron")}</a></div>
          <div class="list">
            ${posts.length ? posts.slice(0, 5).map((p) => `
              <div class="list__item is-link" data-open="posts" data-id="${p.id}">
                <div class="list__main"><div class="list__title">${esc(p.title)}</div><div class="list__sub">${platformPill(p.platform)} ${fmtDate(p.date)}${p.time ? " · " + fmtTime(p.time) : ""}</div></div>
                ${pill(p.status, title(p.status))}
              </div>`).join("") : `<div class="empty">No posts planned for this week.</div>`}
          </div>
        </section>

        ${lowStock.length ? `
        <section class="card">
          <div class="card__head"><h3>Low stock</h3><span class="spacer"></span><a class="btn btn--ghost btn--sm" href="#/inventory">Inventory ${icon("chevron")}</a></div>
          <div class="list">
            ${lowStock.map((i) => `<div class="list__item is-link" data-open="inventory" data-id="${i.id}"><div class="list__main"><div class="list__title">${esc(i.name)}</div><div class="list__sub">${i.qty} ${esc(i.unit || "")} left · reorder below ${i.reorderAt}</div></div><span class="pill pill--high">Reorder</span></div>`).join("")}
          </div>
        </section>` : ""}
      </div>
    </div>`;
};

function agendaDay(dateStr, itemsHtml) {
  const d = parseYmd(dateStr);
  const isToday = dateStr === today();
  return `
    <div class="agenda__day${isToday ? " is-today" : ""}">
      <div class="agenda__date"><strong>${d.getDate()}</strong><span>${isToday ? "Today" : DAYS[d.getDay()]}</span></div>
      <div class="card list">${itemsHtml.join("")}</div>
    </div>`;
}

function jobAgendaItem(j) {
  return `
    <div class="list__item is-link" data-open="jobs" data-id="${j.id}">
      <div class="avatar avatar--sm">${initials(j.customerName)}</div>
      <div class="list__main">
        <div class="list__title">${esc(j.customerName)} ${pill(j.status)}</div>
        <div class="list__sub">${icon("car")} ${esc(j.vehicle || "")}${j.address ? ` &nbsp;${icon("pin")} ${esc(j.address)}` : ""}</div>
      </div>
      <div class="list__aside"><strong>${j.time ? fmtTime(j.time) : "—"}</strong>${money(j.price)}</div>
    </div>`;
}

function leadRow(j) {
  return `
    <div class="list__item is-link" data-open="jobs" data-id="${j.id}">
      <div class="avatar avatar--sm">${initials(j.customerName)}</div>
      <div class="list__main">
        <div class="list__title">${esc(j.customerName)}${(j.photos || []).length ? ` <span class="pill">${icon("image")}${j.photos.length}</span>` : ""}</div>
        <div class="list__sub">${esc(j.vehicle || "")}${j.date ? ` · wants ${fmtDate(j.date)}${j.time ? " " + fmtTime(j.time) : ""}` : ""}${(j.addons || []).length ? ` · ${j.addons.join(", ")}` : ""}</div>
      </div>
      <div class="list__aside">${relTime(j.receivedAt || j.createdAt)}</div>
    </div>`;
}

function taskRow(t) {
  const overdue = t.due && t.due < today() && !t.done;
  const job = t.jobId ? getDoc("jobs", t.jobId) : null;
  const cust = t.customerId ? getDoc("customers", t.customerId) : null;
  return `
    <div class="list__item${t.done ? " is-done" : ""}">
      <button class="checkbox${t.done ? " is-on" : ""}" type="button" data-toggle-task="${t.id}" aria-label="Mark done">${icon("check")}</button>
      <div class="list__main is-link" data-open="tasks" data-id="${t.id}" style="cursor:pointer">
        <div class="list__title">${esc(t.title)} ${t.priority === "high" ? pill("high", "High") : ""}</div>
        <div class="list__sub">${t.due ? `<span style="color:${overdue ? "var(--red)" : "inherit"};font-weight:${overdue ? 700 : 400}">${overdue ? "Overdue · " : ""}${fmtDate(t.due)}</span>` : "No due date"}${job ? ` · ${esc(job.customerName)} — ${esc(job.vehicle)}` : cust ? ` · ${esc(cust.name)}` : ""}${t.assignedTo ? ` · ${esc(t.assignedTo)}` : ""}</div>
      </div>
    </div>`;
}

function activityRow(a) {
  const link = a.ref && a.ref.type && a.ref.id;
  const target = link ? (a.ref.type === "customer" ? "customers" : a.ref.type === "job" ? "jobs" : a.ref.type) : null;
  const canOpen = target && ["jobs", "customers"].includes(target) && getDoc(target, a.ref.id);
  return `<div class="timeline__item${canOpen ? " is-link" : ""}" ${canOpen ? `data-open="${target}" data-id="${a.ref.id}" style="cursor:pointer"` : ""}><span class="timeline__dot ${a.type}"></span><span>${esc(a.text)}</span><span class="timeline__time">${relTime(a.at)}</span></div>`;
}

const platformPill = (p) => `<span class="platform platform--${esc(p || "Other")}">${esc(p || "Other")}</span>`;

/* ---------- leads ---------- */
V.leads = () => {
  const leads = col("jobs").filter((j) => j.status === "new").sort(by("receivedAt", -1));
  const quoted = col("jobs").filter((j) => j.status === "quoted").sort(by("updatedAt", -1));
  return `
    <div class="page-head"><h2>New requests</h2><span class="pill pill--new">${leads.length}</span><span class="spacer"></span><button class="btn btn--primary" type="button" data-new="jobs" data-ctx-status="new">${icon("plus")}Add lead</button>
      <p>Booking requests from the website land here. Call or text, confirm the price, then move the job to Quoted or Scheduled.</p></div>
    <div class="stack">
      ${leads.length ? leads.map(leadCard).join("") : `<div class="card">${emptyState("inbox", "No new requests", "You're all caught up. New website bookings appear here the moment they come in.")}</div>`}
    </div>
    ${quoted.length ? `
    <div class="page-head" style="margin-top:30px"><h2>Waiting on the customer</h2><span class="pill pill--quoted">${quoted.length}</span><p>Quotes sent, not yet booked. Follow up after a day or two.</p></div>
    <div class="card list">${quoted.map((j) => `
      <div class="list__item is-link" data-open="jobs" data-id="${j.id}">
        <div class="avatar avatar--sm">${initials(j.customerName)}</div>
        <div class="list__main"><div class="list__title">${esc(j.customerName)}</div><div class="list__sub">${esc(j.vehicle)} · quoted ${money(j.price)} · ${relTime(j.updatedAt)}</div></div>
        <button class="btn btn--ghost btn--sm" type="button" data-status="scheduled" data-id="${j.id}">Mark booked</button>
      </div>`).join("")}</div>` : ""}`;
};

function leadCard(j) {
  const c = j.customerId ? getDoc("customers", j.customerId) : null;
  const previous = c ? customerJobs(c.id).filter((x) => x.id !== j.id && x.status !== "cancelled").length : 0;
  return `
    <article class="card">
      <div class="card__head">
        <div class="avatar">${initials(j.customerName)}</div>
        <div style="min-width:0">
          <h3 style="font-size:16px">${esc(j.customerName)} ${previous ? `<span class="pill pill--tag">Repeat · ${previous} job${previous > 1 ? "s" : ""}</span>` : ""}</h3>
          <div class="muted" style="font-size:13px">Requested ${relTime(j.receivedAt || j.createdAt)} · ${esc(j.source || "Website")}</div>
        </div>
        <span class="spacer"></span>
        <a class="btn btn--ghost btn--sm" href="${telHref(j.phone)}">${icon("phone")}Call</a>
        <a class="btn btn--ghost btn--sm" href="sms:${esc(String(j.phone || "").replace(/[^\d+]/g, ""))}">Text</a>
        <a class="btn btn--ghost btn--sm" href="mailto:${esc(j.email)}">${icon("mail")}Email</a>
      </div>
      <div class="card__body">
        <dl class="kv">
          <dt>Vehicle</dt><dd>${esc(j.vehicle || "—")}</dd>
          <dt>Address</dt><dd>${j.address ? `<a href="${mapsHref(j.address)}" target="_blank" rel="noopener">${esc(j.address)}</a>` : "—"}</dd>
          <dt>Wants</dt><dd>${j.date ? `${fmtDate(j.date, { weekday: "long", month: "long", day: "numeric" })}${j.time ? " at " + fmtTime(j.time) : ""}` : "Flexible"}</dd>
          <dt>Add-ons</dt><dd>${(j.addons || []).length ? j.addons.map((a) => `<span class="pill">${esc(a)}</span>`).join(" ") : "None"}${j.seats ? ` · ${esc(j.seats)} seats` : ""}</dd>
          ${j.notes ? `<dt>Condition</dt><dd>${esc(j.notes)}</dd>` : ""}
          ${(j.photos || []).length ? `<dt>Photos</dt><dd><div class="photos">${j.photos.map((p) => `<a href="/api/admin/uploads/${esc(p)}" target="_blank" rel="noopener"><img src="/api/admin/uploads/${esc(p)}" alt="" loading="lazy"></a>`).join("")}</div></dd>` : ""}
        </dl>
      </div>
      <div class="card__foot" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <strong style="color:var(--ink-900)">${money(j.price)} starting</strong>
        <span class="spacer" style="flex:1"></span>
        <button class="btn btn--ghost btn--sm" type="button" data-open="jobs" data-id="${j.id}">Open</button>
        <button class="btn btn--ghost btn--sm" type="button" data-status="quoted" data-id="${j.id}">Quote sent</button>
        <button class="btn btn--primary btn--sm" type="button" data-schedule="${j.id}">${icon("calendar")}Book it</button>
        <button class="iconbtn iconbtn--danger" type="button" data-status="cancelled" data-id="${j.id}" title="Decline">${icon("x")}</button>
      </div>
    </article>`;
}

/* ---------- jobs ---------- */
V.jobs = () => {
  if (S.route.id && S.route.sub === "invoice") return invoiceView(S.route.id);
  if (S.route.id) return jobDetail(S.route.id);
  const u = S.ui;
  let jobs = col("jobs").slice();
  if (u.jobsQuery) {
    const q = u.jobsQuery.toLowerCase();
    jobs = jobs.filter((j) => [j.customerName, j.vehicle, j.address, j.notes, j.phone].join(" ").toLowerCase().includes(q));
  }
  const head = `
    <div class="toolbar">
      <div class="seg">
        <button type="button" data-jobsview="board" class="${u.jobsView === "board" ? "is-active" : ""}">${icon("columns")}Board</button>
        <button type="button" data-jobsview="list" class="${u.jobsView === "list" ? "is-active" : ""}">${icon("list")}List</button>
      </div>
      ${u.jobsView === "list" ? `<select class="field__select select-sm" data-jobsstatus><option value="all">All statuses</option>${STATUSES.map((s) => `<option value="${s}"${u.jobsStatus === s ? " selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}<option value="unpaid"${u.jobsStatus === "unpaid" ? " selected" : ""}>Unpaid</option></select>` : ""}
      <input class="field__input input-sm" type="search" placeholder="Filter jobs…" value="${esc(u.jobsQuery)}" data-jobsquery>
      <span class="spacer"></span>
      <button class="btn btn--primary" type="button" data-new="jobs">${icon("plus")}New job</button>
    </div>`;

  if (u.jobsView === "board") {
    const cols = STATUSES.filter((s) => s !== "cancelled").concat(jobs.some((j) => j.status === "cancelled") ? ["cancelled"] : []);
    return head + `<div class="board">${cols.map((s) => {
      const items = jobs.filter((j) => j.status === s).sort((a, b) => (a.date || "9999") < (b.date || "9999") ? -1 : 1);
      return `<div class="col" data-col="${s}">
        <div class="col__head"><span class="dot" style="background:${colColor(s)}"></span>${STATUS_LABEL[s]}<span class="col__total">${items.length ? money(sum(items, jobTotal)) : ""}</span><span class="count">${items.length}</span></div>
        ${items.map(jobCard).join("")}
        ${!items.length ? `<div class="muted" style="text-align:center;font-size:12.5px;padding:14px 0">Drop jobs here</div>` : ""}
      </div>`;
    }).join("")}</div>`;
  }

  if (u.jobsStatus === "unpaid") jobs = jobs.filter((j) => !j.paid && ["completed", "in_progress", "scheduled"].includes(j.status));
  else if (u.jobsStatus !== "all") jobs = jobs.filter((j) => j.status === u.jobsStatus);
  jobs.sort((a, b) => (b.date || "") > (a.date || "") ? 1 : (b.date || "") < (a.date || "") ? -1 : (b.createdAt > a.createdAt ? 1 : -1));
  return head + `
    <div class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Customer</th><th>Vehicle</th><th>Date</th><th>Status</th><th>Add-ons</th><th class="num">Price</th><th></th></tr></thead>
      <tbody>${jobs.length ? jobs.map((j) => `
        <tr class="is-link" data-open="jobs" data-id="${j.id}">
          <td><strong>${esc(j.customerName)}</strong><span class="sub">${esc(j.phone || "")}</span></td>
          <td>${esc(j.vehicle)}</td>
          <td>${j.date ? fmtDate(j.date) : "<span class='muted'>—</span>"}<span class="sub">${j.time ? fmtTime(j.time) : ""}</span></td>
          <td>${pill(j.status)}${j.paid ? "" : j.status === "completed" ? ` <span class="pill pill--high">Unpaid</span>` : ""}</td>
          <td class="muted">${(j.addons || []).join(", ") || "—"}</td>
          <td class="num"><strong>${money(j.price)}</strong></td>
          <td class="actions"><button class="iconbtn" type="button" data-edit="jobs" data-id="${j.id}" title="Edit">${icon("edit")}</button></td>
        </tr>`).join("") : `<tr><td colspan="7">${emptyState("briefcase", "No jobs match", "")}</td></tr>`}
      </tbody>
      ${jobs.length ? `<tfoot><tr><td colspan="5">${jobs.length} job${jobs.length === 1 ? "" : "s"}</td><td class="num">${money(sum(jobs, jobTotal))}</td><td></td></tr></tfoot>` : ""}
    </table></div></div>`;
};

const colColor = (s) => ({ new: "var(--sun-400)", quoted: "var(--violet)", scheduled: "var(--cyan-500)", in_progress: "#2552c4", completed: "var(--green)", paid: "var(--navy-900)", cancelled: "var(--ink-300)" }[s]);

function jobDetail(id) {
  const j = getDoc("jobs", id);
  if (!j) return `<div class="card">${emptyState("briefcase", "Job not found", "", `<a class="btn btn--ghost" href="#/jobs">Back to jobs</a>`)}</div>`;
  const c = j.customerId ? getDoc("customers", j.customerId) : null;
  const tasks = col("tasks").filter((t) => t.jobId === id).sort((a, b) => Number(a.done) - Number(b.done));
  const activity = col("activity").filter((a) => a.ref && a.ref.id === id).slice(-10).reverse();
  const flow = STATUSES.filter((s) => s !== "cancelled");
  const idx = flow.indexOf(j.status);
  const seatAddon = settings().addons.find((a) => /seat/i.test(a.name));
  const history = c ? customerJobs(c.id).filter((x) => x.id !== id) : [];

  return `
    <a class="btn btn--ghost btn--sm no-print" href="#/jobs" style="margin-bottom:14px">${icon("back")}All jobs</a>
    <div class="detail-head">
      <div class="avatar avatar--lg">${initials(j.customerName)}</div>
      <div>
        <h2>${esc(j.customerName)} ${pill(j.status)}${j.paid ? pill("paid", "Paid" + (j.paymentMethod ? " · " + j.paymentMethod : "")) : ""}</h2>
        <div class="sub">
          <span>${icon("car")}${esc(j.vehicle || "No vehicle")}</span>
          ${j.date ? `<span>${icon("calendar")}${fmtDate(j.date, { weekday: "short", month: "short", day: "numeric" })}${j.time ? " · " + fmtTime(j.time) : ""}</span>` : ""}
          <span>${icon("dollar")}${money(j.price)}</span>
        </div>
      </div>
      <div class="actions">
        ${j.phone ? `<a class="btn btn--ghost btn--sm" href="${telHref(j.phone)}">${icon("phone")}Call</a>` : ""}
        ${j.address ? `<a class="btn btn--ghost btn--sm" href="${mapsHref(j.address)}" target="_blank" rel="noopener">${icon("pin")}Directions</a>` : ""}
        <a class="btn btn--ghost btn--sm" href="#/jobs/${j.id}/invoice">${icon("print")}Invoice</a>
        <button class="btn btn--dark btn--sm" type="button" data-edit="jobs" data-id="${j.id}">${icon("edit")}Edit</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px"><div class="card__body" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div class="status-steps">${flow.map((s, i) => `<button type="button" data-status="${s}" data-id="${j.id}" class="${s === j.status ? "is-current" : i < idx ? "is-past" : ""}">${STATUS_LABEL[s]}</button>`).join("")}</div>
      <span class="spacer" style="flex:1"></span>
      ${j.status !== "cancelled" ? `<button class="btn btn--ghost btn--sm" type="button" data-status="cancelled" data-id="${j.id}">Cancel job</button>` : `<button class="btn btn--ghost btn--sm" type="button" data-status="new" data-id="${j.id}">Reopen</button>`}
      ${!j.paid && j.status !== "cancelled" ? `<button class="btn btn--primary btn--sm" type="button" data-markpaid="${j.id}">${icon("check")}Mark paid</button>` : ""}
    </div></div>

    <div class="grid grid--main">
      <div class="stack">
        <section class="card"><div class="card__head"><h3>Job details</h3></div><div class="card__body">
          <dl class="kv">
            <dt>Service</dt><dd>${esc(j.service || "—")}</dd>
            <dt>Add-ons</dt><dd>${(j.addons || []).length ? j.addons.map((a) => `<span class="pill">${esc(a)}</span>`).join(" ") : "None"}${j.seats && seatAddon ? ` &nbsp;<span class="muted">${esc(j.seats)} seats${seatAddon.price ? ` ≈ ${money(seatAddon.price * Number(j.seats))}` : ""}</span>` : ""}</dd>
            <dt>Price</dt><dd><strong>${money(j.price)}</strong>${j.paid ? ` · paid ${j.paidAt ? fmtDate(j.paidAt) : ""}${j.paymentMethod ? " by " + esc(j.paymentMethod) : ""}` : " · not yet paid"}</dd>
            <dt>Address</dt><dd>${j.address ? `<a href="${mapsHref(j.address)}" target="_blank" rel="noopener">${esc(j.address)}</a>` : "—"}</dd>
            <dt>When</dt><dd>${j.date ? `${fmtDate(j.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${j.time ? " at " + fmtTime(j.time) : ""}` : "Not scheduled"}</dd>
            ${j.assignedTo ? `<dt>Assigned to</dt><dd>${esc(j.assignedTo)}</dd>` : ""}
            <dt>Source</dt><dd>${esc(j.source || "—")}${j.receivedAt ? ` · requested ${fmtDate(j.receivedAt)}` : ""}</dd>
          </dl>
        </div></section>

        <section class="card"><div class="card__head"><h3>Notes & condition</h3><span class="spacer"></span><button class="btn btn--ghost btn--sm" type="button" data-edit="jobs" data-id="${j.id}">${icon("edit")}Edit</button></div><div class="card__body">
          ${j.notes ? `<div class="notebox">${esc(j.notes)}</div>` : `<p class="muted">No notes yet.</p>`}
        </div></section>

        ${(j.photos || []).length ? `<section class="card"><div class="card__head"><h3>Customer photos</h3></div><div class="card__body"><div class="photos">${j.photos.map((p) => `<a href="/api/admin/uploads/${esc(p)}" target="_blank" rel="noopener"><img src="/api/admin/uploads/${esc(p)}" alt="" loading="lazy"></a>`).join("")}</div></div></section>` : ""}

        <section class="card"><div class="card__head"><h3>Activity</h3></div><div class="timeline">${activity.length ? activity.map(activityRow).join("") : `<div class="empty">No activity yet.</div>`}</div></section>
      </div>

      <div class="stack">
        <section class="card"><div class="card__head"><h3>Customer</h3><span class="spacer"></span>${c ? `<a class="btn btn--ghost btn--sm" href="#/customers/${c.id}">Profile ${icon("chevron")}</a>` : ""}</div><div class="card__body">
          ${c ? `
            <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px"><div class="avatar">${initials(c.name)}</div><div><strong style="color:var(--ink-900)">${esc(c.name)}</strong><div class="muted" style="font-size:13px">${(c.tags || []).map((t) => `<span class="pill pill--tag">${esc(t)}</span>`).join(" ")}</div></div></div>
            <dl class="kv">
              <dt>Phone</dt><dd>${c.phone ? `<a href="${telHref(c.phone)}">${esc(c.phone)}</a>` : "—"}</dd>
              <dt>Email</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : "—"}</dd>
              <dt>Vehicles</dt><dd>${(c.vehicles || []).join(", ") || "—"}</dd>
              <dt>History</dt><dd>${history.length} other job${history.length === 1 ? "" : "s"} · ${money(customerValue(c.id))} lifetime</dd>
            </dl>` : `<p class="muted">No customer linked.</p>`}
        </div></section>

        <section class="card"><div class="card__head"><h3>Tasks</h3><span class="spacer"></span><button class="btn btn--ghost btn--sm" type="button" data-new="tasks" data-ctx-job="${j.id}">${icon("plus")}Task</button></div>
          <div class="list">${tasks.length ? tasks.map(taskRow).join("") : `<div class="empty" style="padding:20px">No tasks for this job.</div>`}</div>
        </section>

        <section class="card"><div class="card__head"><h3>Share it</h3></div><div class="card__body">
          <p class="muted" style="margin-bottom:10px">Turn this job into content.</p>
          <button class="btn btn--ghost btn--sm" type="button" data-new="posts" data-ctx-job="${j.id}">${icon("megaphone")}Plan a before & after post</button>
        </div></section>
      </div>
    </div>`;
}

function invoiceView(id) {
  const j = getDoc("jobs", id);
  if (!j) return jobDetail(id);
  const b = settings().business;
  const c = j.customerId ? getDoc("customers", j.customerId) : null;
  const seatAddon = settings().addons.find((a) => /seat/i.test(a.name));
  const lines = [{ label: j.service || "Detail", amount: null }];
  (j.addons || []).forEach((a) => {
    const def = settings().addons.find((x) => x.name === a);
    let amt = null;
    if (def && def.price && seatAddon && def.name === seatAddon.name && j.seats) amt = def.price * Number(j.seats);
    lines.push({ label: a + (amt != null && j.seats ? ` (${j.seats} seats)` : ""), amount: amt, quoted: amt == null });
  });
  const total = jobTotal(j);
  const tax = Number(b.taxRate) ? total * Number(b.taxRate) / 100 : 0;
  const invoiceNo = "INV-" + (j.id || "").toUpperCase().slice(-6);
  return `
    <div class="toolbar no-print"><a class="btn btn--ghost btn--sm" href="#/jobs/${j.id}">${icon("back")}Back to job</a><span class="spacer"></span><button class="btn btn--primary" type="button" onclick="window.print()">${icon("print")}Print / save PDF</button></div>
    <div class="invoice">
      <div class="invoice__head">
        <div style="display:flex;gap:16px;align-items:center"><img src="/assets/img/logo.webp" alt=""><div><h2 class="display">${esc(b.name)}</h2><div class="muted">${esc(b.tagline || "")}</div></div></div>
        <div class="invoice__meta"><strong>${j.paid ? "RECEIPT" : "INVOICE"}</strong>${invoiceNo}<br>${fmtDate(j.paidAt || j.date || j.createdAt, { month: "long", day: "numeric", year: "numeric" })}</div>
      </div>
      <div class="invoice__parties">
        <div><h4>From</h4><strong style="color:var(--ink-900)">${esc(b.name)}</strong><br>${esc(b.serviceArea || "")}${b.phone ? `<br>${esc(b.phone)}` : ""}${b.email ? `<br>${esc(b.email)}` : ""}</div>
        <div><h4>Bill to</h4><strong style="color:var(--ink-900)">${esc(j.customerName)}</strong>${j.address ? `<br>${esc(j.address)}` : ""}${(c && c.phone) || j.phone ? `<br>${esc((c && c.phone) || j.phone)}` : ""}${(c && c.email) || j.email ? `<br>${esc((c && c.email) || j.email)}` : ""}<br><span class="muted">${esc(j.vehicle || "")}</span></div>
      </div>
      <table>
        <thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
        <tbody>${lines.map((l, i) => `<tr><td>${esc(l.label)}${i === 0 && j.date ? `<br><span class="muted" style="font-size:12.5px">Service date ${fmtDate(j.date, { month: "long", day: "numeric", year: "numeric" })}</span>` : ""}</td><td class="num">${l.amount != null ? money2(l.amount) : i === 0 ? money2(total - sum(lines.slice(1), (x) => x.amount || 0)) : "Included"}</td></tr>`).join("")}
          ${tax ? `<tr><td>Sales tax (${b.taxRate}%)</td><td class="num">${money2(tax)}</td></tr>` : ""}
          <tr class="invoice__total"><td>${j.paid ? "Total paid" : "Total due"}</td><td class="num">${money2(total + tax)}</td></tr>
        </tbody>
      </table>
      <div class="invoice__foot">${j.paid ? `Paid${j.paymentMethod ? " by " + esc(j.paymentMethod) : ""}${j.paidAt ? " on " + fmtDate(j.paidAt, { month: "long", day: "numeric", year: "numeric" }) : ""}. Thank you for choosing ${esc(b.name)}.` : `Payment accepted by ${PAYMENT_METHODS.slice(0, 4).join(", ")} or card. Thank you for choosing ${esc(b.name)}.`}</div>
    </div>`;
}

/* ---------- calendar ---------- */
V.calendar = () => {
  const [y, m] = S.ui.calMonth.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const t = today();
  const jobs = col("jobs"), posts = col("posts"), tasks = col("tasks");
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = ymd(d);
    const dayJobs = jobs.filter((j) => j.date === key && j.status !== "cancelled").sort(by("time"));
    const dayPosts = posts.filter((p) => p.date === key);
    const dayTasks = tasks.filter((x) => x.due === key && !x.done);
    const evs = dayJobs.map((j) => `<div class="cal__ev cal__ev--job cal__ev--${j.status}" data-open="jobs" data-id="${j.id}" title="${esc(j.customerName)} — ${esc(j.vehicle)}">${icon("car")}<span class="label">${j.time ? fmtTime(j.time).replace(":00", "") + " " : ""}${esc(j.customerName)}</span></div>`)
      .concat(dayPosts.map((p) => `<div class="cal__ev cal__ev--post" data-open="posts" data-id="${p.id}" title="${esc(p.title)}">${icon("megaphone")}<span class="label">${esc(p.title)}</span></div>`))
      .concat(dayTasks.map((x) => `<div class="cal__ev cal__ev--task${key < t ? " is-overdue" : ""}" data-open="tasks" data-id="${x.id}" title="${esc(x.title)}">${icon("check-square")}<span class="label">${esc(x.title)}</span></div>`));
    cells.push(`<div class="cal__day${d.getMonth() !== m - 1 ? " is-other" : ""}${key === t ? " is-today" : ""}" data-day="${key}">
      <span class="cal__num">${d.getDate()}</span>${evs.slice(0, 4).join("")}${evs.length > 4 ? `<span class="cal__more">+${evs.length - 4} more</span>` : ""}</div>`);
  }
  const monthJobs = jobs.filter((j) => monthKey(j.date) === S.ui.calMonth && j.status !== "cancelled");
  const next14 = {};
  jobs.filter((j) => j.date && j.date >= t && j.date <= addDays(t, 14) && !["cancelled", "paid", "completed"].includes(j.status)).sort(by("date")).forEach((j) => { (next14[j.date] = next14[j.date] || []).push(j); });

  return `
    <div class="toolbar">
      <button class="iconbtn" type="button" data-cal="-1" aria-label="Previous month">${icon("back")}</button>
      <h2 style="font-size:20px;min-width:190px;text-align:center">${MONTHS[m - 1]} ${y}</h2>
      <button class="iconbtn" type="button" data-cal="1" aria-label="Next month">${icon("arrow")}</button>
      <button class="btn btn--ghost btn--sm" type="button" data-cal="today">Today</button>
      <span class="muted" style="font-size:13px">${monthJobs.length} job${monthJobs.length === 1 ? "" : "s"} · ${money(sum(monthJobs, jobTotal))}</span>
      <span class="spacer"></span>
      <button class="btn btn--ghost" type="button" data-new="posts">${icon("megaphone")}Post</button>
      <button class="btn btn--primary" type="button" data-new="jobs">${icon("plus")}Job</button>
    </div>
    <div class="cal">
      <div class="cal__head">${DAYS.map((d) => `<div>${d}</div>`).join("")}</div>
      <div class="cal__grid">${cells.join("")}</div>
    </div>
    <div class="cal__legend"><span><span class="dot" style="background:var(--cyan-500)"></span>Scheduled job</span><span><span class="dot" style="background:var(--sun-400)"></span>Lead's requested date</span><span><span class="dot" style="background:var(--green)"></span>Completed</span><span><span class="dot" style="background:var(--violet)"></span>Social post</span><span><span class="dot" style="background:var(--ink-300)"></span>Task</span><span class="muted">· Click a day to add something</span></div>

    <div class="page-head" style="margin-top:28px"><h2>Next two weeks</h2></div>
    ${Object.keys(next14).length ? `<div class="agenda">${Object.keys(next14).sort().map((d) => agendaDay(d, next14[d].map(jobAgendaItem))).join("")}</div>` : `<div class="card">${emptyState("calendar", "Nothing booked in the next two weeks", "")}</div>`}`;
};

function dayMenu(day, x, y) {
  quickmenu.innerHTML = `<div class="muted" style="padding:6px 12px 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">${fmtDate(day, { weekday: "short", month: "short", day: "numeric" })}</div>
    <button type="button" data-new="jobs" data-ctx-date="${day}">${icon("briefcase")}Schedule a job</button>
    <button type="button" data-new="posts" data-ctx-date="${day}">${icon("megaphone")}Plan a post</button>
    <button type="button" data-new="tasks" data-ctx-date="${day}">${icon("check-square")}Add a task</button>`;
  quickmenu.style.left = Math.min(x, window.innerWidth - 230) + "px";
  quickmenu.style.right = "auto";
  quickmenu.style.top = Math.min(y, window.innerHeight - 180) + "px";
  quickmenu.hidden = false;
}

/* ---------- customers ---------- */
V.customers = () => {
  if (S.route.id) return customerDetail(S.route.id);
  const u = S.ui;
  let list = col("customers").slice();
  if (u.customersTag !== "all") list = list.filter((c) => (c.tags || []).includes(u.customersTag));
  if (u.customersQuery) { const q = u.customersQuery.toLowerCase(); list = list.filter((c) => [c.name, c.phone, c.email, (c.vehicles || []).join(" "), c.address].join(" ").toLowerCase().includes(q)); }
  const rows = list.map((c) => {
    const js = customerJobs(c.id).filter((j) => j.status !== "cancelled");
    const last = js.filter((j) => j.date).sort(by("date", -1))[0];
    return { c, jobs: js.length, value: customerValue(c.id), last: last ? last.date : "" };
  }).sort((a, b) => b.value - a.value || (b.last > a.last ? 1 : -1));
  const total = col("customers").length;
  const repeat = col("customers").filter((c) => customerJobs(c.id).filter((j) => ["completed", "paid"].includes(j.status)).length > 1).length;

  return `
    <div class="grid grid--3" style="margin-bottom:18px">
      <div class="card stat">${icon("users", "stat__icon")}<span class="stat__label">Customers</span><span class="stat__value">${total}</span></div>
      <div class="card stat">${icon("star", "stat__icon")}<span class="stat__label">Repeat customers</span><span class="stat__value">${repeat}</span><span class="stat__sub">${total ? Math.round(repeat / total * 100) : 0}% have booked twice or more</span></div>
      <div class="card stat">${icon("dollar", "stat__icon")}<span class="stat__label">Avg lifetime value</span><span class="stat__value">${money(total ? sum(rows, (r) => r.value) / total : 0)}</span></div>
    </div>
    <div class="toolbar">
      <select class="field__select select-sm" data-custtag><option value="all">All tags</option>${CUSTOMER_TAGS.map((t) => `<option value="${t}"${u.customersTag === t ? " selected" : ""}>${t}</option>`).join("")}</select>
      <input class="field__input input-sm" type="search" placeholder="Search name, phone, vehicle…" value="${esc(u.customersQuery)}" data-custquery>
      <span class="spacer"></span>
      <button class="btn btn--primary" type="button" data-new="customers">${icon("plus")}New customer</button>
    </div>
    <div class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Customer</th><th>Contact</th><th>Vehicles</th><th>Tags</th><th class="num">Jobs</th><th class="num">Lifetime</th><th>Last job</th></tr></thead>
      <tbody>${rows.length ? rows.map(({ c, jobs, value, last }) => `
        <tr class="is-link" data-open="customers" data-id="${c.id}">
          <td><div style="display:flex;gap:10px;align-items:center"><div class="avatar avatar--sm">${initials(c.name)}</div><div><strong>${esc(c.name)}</strong><span class="sub">${esc(c.address || "")}</span></div></div></td>
          <td>${esc(c.phone || "")}<span class="sub">${esc(c.email || "")}</span></td>
          <td class="muted">${(c.vehicles || []).join(", ") || "—"}</td>
          <td>${(c.tags || []).map((t) => `<span class="pill pill--tag">${esc(t)}</span>`).join(" ")}</td>
          <td class="num">${jobs}</td>
          <td class="num"><strong>${money(value)}</strong></td>
          <td class="muted">${last ? fmtDate(last) : "—"}</td>
        </tr>`).join("") : `<tr><td colspan="7">${emptyState("users", "No customers yet", "Customers are created automatically from website bookings, or add one by hand.")}</td></tr>`}
      </tbody></table></div></div>`;
};

function customerDetail(id) {
  const c = getDoc("customers", id);
  if (!c) return `<div class="card">${emptyState("users", "Customer not found", "", `<a class="btn btn--ghost" href="#/customers">Back to customers</a>`)}</div>`;
  const jobs = customerJobs(id).sort((a, b) => (b.date || b.createdAt) > (a.date || a.createdAt) ? 1 : -1);
  const tasks = col("tasks").filter((t) => t.customerId === id || jobs.some((j) => j.id === t.jobId)).sort((a, b) => Number(a.done) - Number(b.done));
  const value = customerValue(id);
  const completed = jobs.filter((j) => ["completed", "paid"].includes(j.status));
  const lastDone = completed.filter((j) => j.date).sort(by("date", -1))[0];
  const daysSince = lastDone ? Math.floor((Date.now() - parseYmd(lastDone.date).getTime()) / 86400000) : null;

  return `
    <a class="btn btn--ghost btn--sm" href="#/customers" style="margin-bottom:14px">${icon("back")}All customers</a>
    <div class="detail-head">
      <div class="avatar avatar--lg">${initials(c.name)}</div>
      <div>
        <h2>${esc(c.name)} ${(c.tags || []).map((t) => `<span class="pill pill--tag">${esc(t)}</span>`).join(" ")}</h2>
        <div class="sub">
          ${c.phone ? `<span>${icon("phone")}${esc(c.phone)}</span>` : ""}
          ${c.email ? `<span>${icon("mail")}${esc(c.email)}</span>` : ""}
          ${c.address ? `<span>${icon("pin")}${esc(c.address)}</span>` : ""}
        </div>
      </div>
      <div class="actions">
        ${c.phone ? `<a class="btn btn--ghost btn--sm" href="${telHref(c.phone)}">${icon("phone")}Call</a><a class="btn btn--ghost btn--sm" href="sms:${esc(String(c.phone).replace(/[^\d+]/g, ""))}">Text</a>` : ""}
        ${c.email ? `<a class="btn btn--ghost btn--sm" href="mailto:${esc(c.email)}">${icon("mail")}Email</a>` : ""}
        <button class="btn btn--ghost btn--sm" type="button" data-edit="customers" data-id="${c.id}">${icon("edit")}Edit</button>
        <button class="btn btn--primary btn--sm" type="button" data-new="jobs" data-ctx-customer="${c.id}">${icon("plus")}New job</button>
      </div>
    </div>

    <div class="grid grid--4" style="margin-bottom:18px">
      <div class="card stat"><span class="stat__label">Lifetime value</span><span class="stat__value">${money(value)}</span></div>
      <div class="card stat"><span class="stat__label">Jobs completed</span><span class="stat__value">${completed.length}</span></div>
      <div class="card stat"><span class="stat__label">Last detail</span><span class="stat__value" style="font-size:22px">${lastDone ? fmtDate(lastDone.date) : "—"}</span><span class="stat__sub">${daysSince != null ? `${daysSince} days ago${daysSince > 75 ? " · due for a follow-up" : ""}` : "No completed jobs yet"}</span></div>
      <div class="card stat"><span class="stat__label">Source</span><span class="stat__value" style="font-size:22px">${esc(c.source || "—")}</span><span class="stat__sub">Customer since ${fmtDate(c.createdAt)}</span></div>
    </div>

    <div class="grid grid--main">
      <div class="stack">
        <section class="card"><div class="card__head"><h3>Job history</h3></div><div class="table-wrap"><table class="table">
          <thead><tr><th>Date</th><th>Vehicle</th><th>Service</th><th>Status</th><th class="num">Price</th></tr></thead>
          <tbody>${jobs.length ? jobs.map((j) => `<tr class="is-link" data-open="jobs" data-id="${j.id}"><td>${j.date ? fmtDate(j.date) : "<span class='muted'>—</span>"}</td><td>${esc(j.vehicle)}</td><td class="muted">${esc(j.service || "")}${(j.addons || []).length ? ` + ${j.addons.length} add-on${j.addons.length > 1 ? "s" : ""}` : ""}</td><td>${pill(j.status)}</td><td class="num"><strong>${money(j.price)}</strong></td></tr>`).join("") : `<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">No jobs yet.</td></tr>`}</tbody>
        </table></div></section>
        <section class="card"><div class="card__head"><h3>Notes</h3><span class="spacer"></span><button class="btn btn--ghost btn--sm" type="button" data-edit="customers" data-id="${c.id}">${icon("edit")}Edit</button></div><div class="card__body">${c.notes ? `<div class="notebox">${esc(c.notes)}</div>` : `<p class="muted">Nothing noted. Gate codes, preferences, the dog's name…</p>`}</div></section>
      </div>
      <div class="stack">
        <section class="card"><div class="card__head"><h3>Vehicles</h3></div><div class="list">${(c.vehicles || []).length ? c.vehicles.map((v) => `<div class="list__item">${icon("car")}<div class="list__main"><div class="list__title">${esc(v)}</div><div class="list__sub">${jobs.filter((j) => j.vehicle === v).length} job${jobs.filter((j) => j.vehicle === v).length === 1 ? "" : "s"}</div></div></div>`).join("") : `<div class="empty" style="padding:20px">No vehicles on file.</div>`}</div></section>
        <section class="card"><div class="card__head"><h3>Follow-ups</h3><span class="spacer"></span><button class="btn btn--ghost btn--sm" type="button" data-new="tasks" data-ctx-customer="${c.id}">${icon("plus")}Task</button></div><div class="list">${tasks.length ? tasks.map(taskRow).join("") : `<div class="empty" style="padding:20px">No follow-ups scheduled.</div>`}</div></section>
      </div>
    </div>`;
}

/* ---------- social media planner ---------- */
V.social = () => {
  const u = S.ui;
  const t = today();
  let posts = col("posts").slice();
  if (u.socialPlatform !== "all") posts = posts.filter((p) => p.platform === u.socialPlatform);
  const month = t.slice(0, 7);
  const monthPosts = col("posts").filter((p) => monthKey(p.date) === month);
  const pillars = settings().socialPillars;
  const pillarCounts = pillars.map((pl) => ({ pl, n: monthPosts.filter((p) => p.pillar === pl).length }));
  const maxPillar = Math.max(1, ...pillarCounts.map((x) => x.n));
  const platformCounts = PLATFORMS.map((pf) => ({ pf, n: monthPosts.filter((p) => p.platform === pf).length })).filter((x) => x.n);

  let list;
  if (u.socialTab === "ideas") list = posts.filter((p) => p.status === "idea").sort(by("createdAt", -1));
  else if (u.socialTab === "posted") list = posts.filter((p) => p.status === "posted").sort(by("date", -1));
  else list = posts.filter((p) => p.status !== "idea" && p.status !== "posted").sort((a, b) => (a.date || "9999") < (b.date || "9999") ? -1 : 1);

  const groups = {};
  list.forEach((p) => { const k = u.socialTab === "schedule" ? (p.date ? (p.date < t ? "overdue" : p.date) : "unscheduled") : "all"; (groups[k] = groups[k] || []).push(p); });
  const groupLabel = (k) => k === "overdue" ? "Past due · not marked posted" : k === "unscheduled" ? "No date yet" : k === "all" ? "" : fmtDate(k, { weekday: "long", month: "long", day: "numeric" });
  const order = Object.keys(groups).sort((a, b) => (a === "overdue" ? -1 : b === "overdue" ? 1 : a === "unscheduled" ? 1 : b === "unscheduled" ? -1 : a < b ? -1 : 1));

  return `
    <div class="grid grid--3" style="margin-bottom:18px">
      <div class="card stat">${icon("megaphone", "stat__icon")}<span class="stat__label">Posts this month</span><span class="stat__value">${monthPosts.length}</span><span class="stat__sub">${monthPosts.filter((p) => p.status === "posted").length} published · ${col("posts").filter((p) => p.status === "idea").length} ideas in the bank</span></div>
      <div class="card" style="padding:16px 18px"><div class="stat__label" style="margin-bottom:10px">Content mix · ${MONTHS[Number(month.slice(5)) - 1]}</div><div class="bars">${pillarCounts.map((x) => `<div class="bars__row"><span class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.pl)}</span><div class="bar"><i style="width:${x.n / maxPillar * 100}%"></i></div><span class="num">${x.n}</span></div>`).join("")}</div></div>
      <div class="card" style="padding:16px 18px"><div class="stat__label" style="margin-bottom:10px">By platform</div>${platformCounts.length ? `<div class="chips">${platformCounts.map((x) => `<span class="platform platform--${x.pf}" style="font-size:13px;padding:5px 11px">${x.pf} · ${x.n}</span>`).join("")}</div>` : `<p class="muted">Nothing planned this month yet.</p>`}
        <p class="muted" style="font-size:12.5px;margin-top:12px">Aim for 3–4 posts a week. Before & afters and reviews convert; tips and behind-the-scenes build trust.</p></div>
    </div>
    <div class="toolbar">
      <div class="seg">
        <button type="button" data-socialtab="schedule" class="${u.socialTab === "schedule" ? "is-active" : ""}">Scheduled</button>
        <button type="button" data-socialtab="ideas" class="${u.socialTab === "ideas" ? "is-active" : ""}">Ideas</button>
        <button type="button" data-socialtab="posted" class="${u.socialTab === "posted" ? "is-active" : ""}">Posted</button>
      </div>
      <select class="field__select select-sm" data-socialplatform><option value="all">All platforms</option>${PLATFORMS.map((p) => `<option value="${p}"${u.socialPlatform === p ? " selected" : ""}>${p}</option>`).join("")}</select>
      <span class="spacer"></span>
      <a class="btn btn--ghost" href="#/calendar">${icon("calendar")}Calendar</a>
      <button class="btn btn--primary" type="button" data-new="posts" data-ctx-status="${u.socialTab === "ideas" ? "idea" : "drafted"}">${icon("plus")}New post</button>
    </div>
    ${list.length ? order.map((k) => `
      ${groupLabel(k) ? `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:${k === "overdue" ? "var(--red)" : "var(--ink-500)"};margin:18px 0 10px">${groupLabel(k)}</h3>` : ""}
      <div class="grid grid--3">${groups[k].map(postCard).join("")}</div>`).join("")
      : `<div class="card">${emptyState("megaphone", u.socialTab === "ideas" ? "No ideas banked" : u.socialTab === "posted" ? "Nothing published yet" : "Nothing scheduled", u.socialTab === "ideas" ? "Jot ideas here whenever they strike. Turn them into scheduled posts later." : "Plan the week's posts here, or from a finished job's page.")}</div>`}`;
};

function postCard(p) {
  const job = p.jobId ? getDoc("jobs", p.jobId) : null;
  return `
    <article class="card postcard" data-open="posts" data-id="${p.id}">
      <div class="postcard__top">${platformPill(p.platform)}${pill(p.status, title(p.status))}<span class="spacer" style="flex:1"></span>${p.date ? `<span class="muted" style="font-size:12.5px">${fmtDate(p.date)}${p.time ? " · " + fmtTime(p.time) : ""}</span>` : ""}</div>
      <div class="postcard__title">${esc(p.title)}</div>
      ${p.caption ? `<div class="postcard__caption">${esc(p.caption)}</div>` : ""}
      <div class="postcard__meta">${p.pillar ? `<span>${esc(p.pillar)}</span>` : ""}${job ? `<span>${icon("car")} ${esc(job.customerName)} — ${esc(job.vehicle)}</span>` : ""}${p.assetNote ? `<span>${icon("image")} ${esc(p.assetNote)}</span>` : ""}</div>
      ${p.status !== "posted" ? `<div style="display:flex;gap:6px;margin-top:4px"><button class="btn btn--ghost btn--sm" type="button" data-poststatus="posted" data-id="${p.id}">${icon("check")}Mark posted</button>${p.caption ? `<button class="btn btn--ghost btn--sm" type="button" data-copy="${p.id}">Copy caption</button>` : ""}</div>` : ""}
    </article>`;
}

/* ---------- directory ---------- */
V.directory = () => {
  const u = S.ui;
  let list = col("directory").slice();
  if (u.directoryCat !== "all") list = list.filter((d) => d.category === u.directoryCat);
  if (u.directoryQuery) { const q = u.directoryQuery.toLowerCase(); list = list.filter((d) => [d.name, d.contact, d.category, d.notes, d.address].join(" ").toLowerCase().includes(q)); }
  const cats = settings().directoryCategories;
  const grouped = {};
  list.sort(by("name")).forEach((d) => { (grouped[d.category || "Other"] = grouped[d.category || "Other"] || []).push(d); });
  const catOrder = cats.concat(Object.keys(grouped).filter((c) => !cats.includes(c))).filter((c) => grouped[c]);

  return `
    <div class="page-head"><h2>Business directory</h2><span class="spacer"></span><button class="btn btn--primary" type="button" data-new="directory">${icon("plus")}Add listing</button>
      <p>Suppliers, vendors, referral partners, dealerships and property managers. Everyone the business leans on, in one place.</p></div>
    <div class="toolbar">
      <select class="field__select select-sm" data-dircat><option value="all">All categories</option>${cats.map((c) => `<option value="${c}"${u.directoryCat === c ? " selected" : ""}>${c}</option>`).join("")}</select>
      <input class="field__input input-sm" type="search" placeholder="Search the directory…" value="${esc(u.directoryQuery)}" data-dirquery>
    </div>
    ${list.length ? catOrder.map((cat) => `
      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-500);margin:18px 0 10px">${esc(cat)} · ${grouped[cat].length}</h3>
      <div class="grid grid--3">${grouped[cat].map(directoryCard).join("")}</div>`).join("")
      : `<div class="card">${emptyState("book", "Directory is empty", "Add your chemical supplier, the towel guy, the dealership that sends you work and the property manager who lets you detail in the lot.")}</div>`}`;
};

function directoryCard(d) {
  const spend = sum(col("expenses").filter((e) => e.directoryId === d.id), (e) => e.amount);
  const site = d.website ? (d.website.startsWith("http") ? d.website : "https://" + d.website) : "";
  return `
    <article class="card" style="padding:16px 18px;display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <div style="flex:1;min-width:0"><strong style="color:var(--ink-900);font-size:15px">${esc(d.name)}</strong>${d.contact ? `<div class="muted" style="font-size:13px">${esc(d.contact)}</div>` : ""}</div>
        ${d.rating ? `<span class="muted" style="color:var(--sun-400);font-size:13px;letter-spacing:1px">${"★".repeat(Number(d.rating))}</span>` : ""}
        <button class="iconbtn" type="button" data-edit="directory" data-id="${d.id}" aria-label="Edit">${icon("edit")}</button>
      </div>
      <div class="list__sub" style="display:flex;flex-direction:column;gap:3px;font-size:13px">
        ${d.phone ? `<a href="${telHref(d.phone)}">${icon("phone")} ${esc(d.phone)}</a>` : ""}
        ${d.email ? `<a href="mailto:${esc(d.email)}">${icon("mail")} ${esc(d.email)}</a>` : ""}
        ${site ? `<a href="${esc(site)}" target="_blank" rel="noopener">${icon("globe")} ${esc(d.website.replace(/^https?:\/\//, ""))}</a>` : ""}
        ${d.address ? `<a href="${mapsHref(d.address)}" target="_blank" rel="noopener">${icon("pin")} ${esc(d.address)}</a>` : ""}
      </div>
      ${d.referralFee ? `<span class="pill pill--tag">${esc(d.referralFee)}</span>` : ""}
      ${d.notes ? `<div class="muted" style="font-size:13px;white-space:pre-wrap">${esc(d.notes)}</div>` : ""}
      ${spend ? `<div class="muted" style="font-size:12.5px">${money(spend)} spent here</div>` : ""}
    </article>`;
}

/* ---------- finance ---------- */
V.finance = () => {
  const u = S.ui;
  const jobs = col("jobs"), expenses = col("expenses");
  const m = u.financeMonth;
  const paidIn = (j) => monthKey(j.paidAt ? j.paidAt.slice(0, 10) : j.date);
  const revenueFor = (mk) => sum(jobs.filter((j) => j.paid && paidIn(j) === mk), jobTotal);
  const expensesFor = (mk) => sum(expenses.filter((e) => monthKey(e.date) === mk), (e) => e.amount);
  const rev = revenueFor(m), exp = expensesFor(m);
  const outstanding = jobs.filter((j) => !j.paid && ["completed", "in_progress"].includes(j.status)).sort(by("date"));
  const monthExpenses = expenses.filter((e) => monthKey(e.date) === m).sort(by("date", -1));
  const paidJobs = jobs.filter((j) => j.paid && paidIn(j) === m).sort(by("date", -1));
  const methods = {};
  paidJobs.forEach((j) => { const k = j.paymentMethod || "Unspecified"; methods[k] = (methods[k] || 0) + jobTotal(j); });
  const byCat = {};
  monthExpenses.forEach((e) => { byCat[e.category || "Other"] = (byCat[e.category || "Other"] || 0) + Number(e.amount || 0); });

  // Six-month trend ending at the selected month.
  const [y, mm] = m.split("-").map(Number);
  const months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(y, mm - 1 - i, 1); months.push(monthKey(ymd(d))); }
  const trend = months.map((mk) => ({ mk, rev: revenueFor(mk), exp: expensesFor(mk) }));
  const maxBar = Math.max(1, ...trend.map((x) => Math.max(x.rev, x.exp)));

  const monthOptions = [];
  for (let i = 0; i < 18; i++) { const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1); monthOptions.push(monthKey(ymd(d))); }
  if (!monthOptions.includes(m)) monthOptions.push(m);

  return `
    <div class="toolbar">
      <select class="field__select select-sm" data-financemonth>${monthOptions.map((mk) => `<option value="${mk}"${mk === m ? " selected" : ""}>${MONTHS[Number(mk.slice(5)) - 1]} ${mk.slice(0, 4)}</option>`).join("")}</select>
      <span class="spacer"></span>
      <button class="btn btn--primary" type="button" data-new="expenses">${icon("plus")}Log expense</button>
    </div>
    <div class="grid grid--4" style="margin-bottom:18px">
      <div class="card stat">${icon("trend", "stat__icon")}<span class="stat__label">Revenue collected</span><span class="stat__value">${money(rev)}</span><span class="stat__sub">${paidJobs.length} paid job${paidJobs.length === 1 ? "" : "s"}${paidJobs.length ? ` · avg ${money(rev / paidJobs.length)}` : ""}</span></div>
      <div class="card stat">${icon("dollar", "stat__icon")}<span class="stat__label">Expenses</span><span class="stat__value">${money(exp)}</span><span class="stat__sub">${monthExpenses.length} entr${monthExpenses.length === 1 ? "y" : "ies"}</span></div>
      <div class="card stat">${icon("check", "stat__icon")}<span class="stat__label">Profit</span><span class="stat__value" style="color:${rev - exp >= 0 ? "var(--green)" : "var(--red)"}">${money(rev - exp)}</span><span class="stat__sub">${rev ? Math.round((rev - exp) / rev * 100) + "% margin" : "No revenue yet"}</span></div>
      <div class="card stat">${icon("clock", "stat__icon")}<span class="stat__label">Awaiting payment</span><span class="stat__value">${money(sum(outstanding, jobTotal))}</span><span class="stat__sub">${outstanding.length} job${outstanding.length === 1 ? "" : "s"} · all time</span></div>
    </div>

    <div class="grid grid--main">
      <div class="stack">
        <section class="card"><div class="card__head"><h3>Six-month trend</h3><span class="muted" style="font-size:12.5px">revenue vs expenses</span></div><div class="card__body">
          <div class="bars">${trend.map((x) => `
            <div class="bars__row" style="grid-template-columns:70px 1fr 90px"><span class="muted">${MONTHS[Number(x.mk.slice(5)) - 1].slice(0, 3)} ${x.mk.slice(2, 4)}</span>
              <div style="display:flex;flex-direction:column;gap:3px"><div class="bar"><i style="width:${x.rev / maxBar * 100}%"></i></div><div class="bar" style="height:5px"><i class="exp" style="width:${x.exp / maxBar * 100}%"></i></div></div>
              <span class="num" style="font-size:12.5px">${money(x.rev)}<span class="muted" style="font-weight:500"> / ${money(x.exp)}</span></span></div>`).join("")}</div>
        </div></section>

        <section class="card"><div class="card__head"><h3>Expenses · ${MONTHS[Number(m.slice(5)) - 1]}</h3><span class="spacer"></span><button class="btn btn--ghost btn--sm" type="button" data-new="expenses">${icon("plus")}Add</button></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Paid to</th><th>Category</th><th class="num">Amount</th><th></th></tr></thead>
          <tbody>${monthExpenses.length ? monthExpenses.map((e) => `<tr><td>${fmtDate(e.date)}</td><td><strong>${esc(e.vendor)}</strong>${e.notes ? `<span class="sub">${esc(e.notes)}</span>` : ""}</td><td><span class="pill">${esc(e.category || "Other")}</span>${e.recurring ? ` <span class="pill pill--tag">Monthly</span>` : ""}</td><td class="num">${money2(e.amount)}</td><td class="actions"><button class="iconbtn" type="button" data-edit="expenses" data-id="${e.id}">${icon("edit")}</button></td></tr>`).join("") : `<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">No expenses logged this month.</td></tr>`}</tbody>
          ${monthExpenses.length ? `<tfoot><tr><td colspan="3">Total</td><td class="num">${money2(exp)}</td><td></td></tr></tfoot>` : ""}</table></div>
        </section>
      </div>

      <div class="stack">
        <section class="card"><div class="card__head"><h3>Unpaid jobs</h3></div><div class="list">
          ${outstanding.length ? outstanding.map((j) => `<div class="list__item"><div class="list__main is-link" data-open="jobs" data-id="${j.id}" style="cursor:pointer"><div class="list__title">${esc(j.customerName)}</div><div class="list__sub">${esc(j.vehicle)} · ${j.date ? fmtDate(j.date) : "no date"} · ${pill(j.status)}</div></div><div class="list__aside"><strong>${money(j.price)}</strong></div><button class="btn btn--primary btn--sm" type="button" data-markpaid="${j.id}">Paid</button></div>`).join("") : `<div class="empty" style="padding:22px">Everything is paid up.</div>`}
        </div></section>

        <section class="card"><div class="card__head"><h3>Payments by method</h3></div><div class="card__body">
          ${Object.keys(methods).length ? `<div class="bars">${Object.entries(methods).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="bars__row"><span class="muted">${esc(k)}</span><div class="bar"><i style="width:${v / rev * 100}%"></i></div><span class="num">${money(v)}</span></div>`).join("")}</div>` : `<p class="muted">No payments this month.</p>`}
        </div></section>

        <section class="card"><div class="card__head"><h3>Spend by category</h3></div><div class="card__body">
          ${Object.keys(byCat).length ? `<div class="bars">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="bars__row"><span class="muted">${esc(k)}</span><div class="bar"><i class="exp" style="width:${v / exp * 100}%"></i></div><span class="num">${money(v)}</span></div>`).join("")}</div>` : `<p class="muted">No expenses this month.</p>`}
        </div></section>
      </div>
    </div>`;
};

/* ---------- inventory ---------- */
V.inventory = () => {
  const items = col("inventory").slice().sort((a, b) => {
    const la = Number(a.qty) <= Number(a.reorderAt || 0), lb = Number(b.qty) <= Number(b.reorderAt || 0);
    return la === lb ? (a.name || "").localeCompare(b.name || "") : la ? -1 : 1;
  });
  const low = items.filter((i) => Number(i.qty) <= Number(i.reorderAt || 0));
  const value = sum(items, (i) => Number(i.qty) * Number(i.cost || 0));
  return `
    <div class="grid grid--3" style="margin-bottom:18px">
      <div class="card stat">${icon("box", "stat__icon")}<span class="stat__label">Items tracked</span><span class="stat__value">${items.length}</span></div>
      <div class="card stat">${icon("alert", "stat__icon")}<span class="stat__label">Need reordering</span><span class="stat__value" style="color:${low.length ? "var(--red)" : "inherit"}">${low.length}</span></div>
      <div class="card stat">${icon("dollar", "stat__icon")}<span class="stat__label">Stock on hand</span><span class="stat__value">${money(value)}</span><span class="stat__sub">at unit cost</span></div>
    </div>
    <div class="toolbar"><span class="muted">Tap − when you use something up. Items under their reorder point float to the top.</span><span class="spacer"></span><button class="btn btn--primary" type="button" data-new="inventory">${icon("plus")}Add item</button></div>
    <div class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Item</th><th>Category</th><th>Stock</th><th>Level</th><th>Supplier</th><th class="num">Unit cost</th><th></th></tr></thead>
      <tbody>${items.length ? items.map((i) => {
        const isLow = Number(i.qty) <= Number(i.reorderAt || 0);
        const target = Math.max(Number(i.reorderAt || 0) * 3, Number(i.qty), 1);
        const sup = i.supplierId ? getDoc("directory", i.supplierId) : null;
        return `<tr>
          <td><strong>${esc(i.name)}</strong>${i.notes ? `<span class="sub">${esc(i.notes)}</span>` : ""}</td>
          <td class="muted">${esc(i.category || "—")}</td>
          <td><div style="display:flex;align-items:center;gap:6px"><button class="iconbtn" style="width:28px;height:28px;font-size:14px" type="button" data-qty="-1" data-id="${i.id}" aria-label="Use one">−</button><strong style="min-width:28px;text-align:center">${i.qty}</strong><button class="iconbtn" style="width:28px;height:28px;font-size:14px" type="button" data-qty="1" data-id="${i.id}" aria-label="Add one">+</button><span class="muted" style="font-size:12.5px">${esc(i.unit || "")}</span></div></td>
          <td style="min-width:120px"><div class="bar"><i class="${isLow ? "low" : "ok"}" style="width:${Math.min(100, Number(i.qty) / target * 100)}%"></i></div><span class="sub" style="font-size:12px">${isLow ? `<span style="color:var(--red);font-weight:700">Reorder</span>` : `reorder below ${i.reorderAt}`}</span></td>
          <td>${sup ? `<a href="#/directory" style="color:var(--cyan-700);font-weight:600">${esc(sup.name)}</a>` : "<span class='muted'>—</span>"}</td>
          <td class="num">${i.cost ? money2(i.cost) : "—"}</td>
          <td class="actions"><button class="iconbtn" type="button" data-edit="inventory" data-id="${i.id}">${icon("edit")}</button></td>
        </tr>`;
      }).join("") : `<tr><td colspan="7">${emptyState("box", "Nothing tracked yet", "Add chemicals, towels, pads and anything else you'd hate to run out of mid-job.")}</td></tr>`}</tbody>
    </table></div></div>`;
};

/* ---------- tasks ---------- */
V.tasks = () => {
  const u = S.ui;
  const t = today();
  let tasks = col("tasks").slice();
  if (u.tasksTab === "open") tasks = tasks.filter((x) => !x.done);
  else if (u.tasksTab === "done") tasks = tasks.filter((x) => x.done);
  const prio = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => ((a.due || "9999") < (b.due || "9999") ? -1 : (a.due || "9999") > (b.due || "9999") ? 1 : (prio[a.priority] || 1) - (prio[b.priority] || 1)));
  const groups = { Overdue: [], Today: [], "This week": [], Later: [], "No date": [], Done: [] };
  const weekEnd = addDays(t, 7);
  tasks.forEach((x) => {
    if (x.done) groups.Done.push(x);
    else if (!x.due) groups["No date"].push(x);
    else if (x.due < t) groups.Overdue.push(x);
    else if (x.due === t) groups.Today.push(x);
    else if (x.due <= weekEnd) groups["This week"].push(x);
    else groups.Later.push(x);
  });
  return `
    <div class="toolbar">
      <div class="seg">
        <button type="button" data-taskstab="open" class="${u.tasksTab === "open" ? "is-active" : ""}">Open</button>
        <button type="button" data-taskstab="done" class="${u.tasksTab === "done" ? "is-active" : ""}">Done</button>
        <button type="button" data-taskstab="all" class="${u.tasksTab === "all" ? "is-active" : ""}">All</button>
      </div>
      <span class="spacer"></span>
      <button class="btn btn--primary" type="button" data-new="tasks">${icon("plus")}New task</button>
    </div>
    ${tasks.length ? Object.keys(groups).filter((g) => groups[g].length).map((g) => `
      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:${g === "Overdue" ? "var(--red)" : "var(--ink-500)"};margin:18px 0 10px">${g} · ${groups[g].length}</h3>
      <div class="card list">${groups[g].map(taskRow).join("")}</div>`).join("")
      : `<div class="card">${emptyState("check-square", "Nothing to do", "Follow-ups, supply runs, call-backs. Tasks tied to a job or customer show up on their pages too.")}</div>`}`;
};

/* ---------- settings ---------- */
V.settings = () => {
  const s = settings();
  const b = s.business;
  const row = (inputs, extra) => `<div class="settings-row${extra || ""}">${inputs}<button class="iconbtn iconbtn--danger" type="button" data-rowdel aria-label="Remove">${icon("trash")}</button></div>`;
  return `
    <div class="grid grid--2">
      <section class="card"><div class="card__head"><h3>Business profile</h3></div><div class="card__body">
        <form class="form" data-settings="business">
          <label class="field"><span class="field__label">Business name</span><input class="field__input" name="name" value="${esc(b.name)}"></label>
          <label class="field"><span class="field__label">Tagline</span><input class="field__input" name="tagline" value="${esc(b.tagline || "")}"></label>
          <label class="field"><span class="field__label">Phone</span><input class="field__input" name="phone" type="tel" value="${esc(b.phone || "")}"></label>
          <label class="field"><span class="field__label">Email</span><input class="field__input" name="email" type="email" value="${esc(b.email || "")}"></label>
          <label class="field"><span class="field__label">Service area</span><input class="field__input" name="serviceArea" value="${esc(b.serviceArea || "")}"></label>
          <label class="field"><span class="field__label">Hours</span><input class="field__input" name="hours" value="${esc(b.hours || "")}"></label>
          <label class="field"><span class="field__label">Sales tax % <small>(0 if not charged)</small></span><input class="field__input" name="taxRate" type="number" step="0.01" min="0" value="${esc(b.taxRate || 0)}"></label>
          <div class="form__actions"><button class="btn btn--primary" type="submit">Save profile</button></div>
        </form>
        <p class="muted" style="font-size:12.5px;margin-top:10px">Phone and email appear on invoices. The public website is edited separately in <code>public/index.html</code>.</p>
      </div></section>

      <section class="card"><div class="card__head"><h3>Team</h3><span class="spacer"></span><button class="btn btn--ghost btn--sm" type="button" data-rowadd="team">${icon("plus")}Add</button></div><div class="card__body">
        <form data-settings="team" class="settings-list">
          <div data-rows>${(s.team || []).map((t) => row(`<input class="field__input input-sm" style="width:100%" name="name" placeholder="Name" value="${esc(t.name || "")}"><input class="field__input input-sm" style="width:100%" name="role" placeholder="Role" value="${esc(t.role || "")}"><input class="field__input input-sm" style="width:100%" name="phone" placeholder="Phone" value="${esc(t.phone || "")}">`, " settings-row--3")).join("")}</div>
          <template><div class="settings-row settings-row--3"><input class="field__input input-sm" style="width:100%" name="name" placeholder="Name"><input class="field__input input-sm" style="width:100%" name="role" placeholder="Role"><input class="field__input input-sm" style="width:100%" name="phone" placeholder="Phone"><button class="iconbtn iconbtn--danger" type="button" data-rowdel aria-label="Remove">${icon("trash")}</button></div></template>
          <p class="muted" style="font-size:12.5px">Add detailers here to assign jobs and tasks to them.</p>
          <div class="form__actions" style="border:0;margin:0"><button class="btn btn--primary" type="submit">Save team</button></div>
        </form>
      </div></section>

      <section class="card"><div class="card__head"><h3>Services & pricing</h3><span class="spacer"></span><button class="btn btn--ghost btn--sm" type="button" data-rowadd="services">${icon("plus")}Add</button></div><div class="card__body">
        <form data-settings="services" class="settings-list">
          <div data-rows>${s.services.map((x) => row(`<input class="field__input input-sm" style="width:100%" name="name" placeholder="Service" value="${esc(x.name)}"><div class="money"><input class="field__input input-sm" style="width:100%" name="basePrice" type="number" step="1" placeholder="Base price" value="${esc(x.basePrice == null ? "" : x.basePrice)}"></div>`)).join("")}</div>
          <template><div class="settings-row"><input class="field__input input-sm" style="width:100%" name="name" placeholder="Service"><div class="money"><input class="field__input input-sm" style="width:100%" name="basePrice" type="number" step="1" placeholder="Base price"></div><button class="iconbtn iconbtn--danger" type="button" data-rowdel aria-label="Remove">${icon("trash")}</button></div></template>
          <div class="form__actions" style="border:0;margin:0"><button class="btn btn--primary" type="submit">Save services</button></div>
        </form>
      </div></section>

      <section class="card"><div class="card__head"><h3>Add-ons</h3><span class="spacer"></span><button class="btn btn--ghost btn--sm" type="button" data-rowadd="addons">${icon("plus")}Add</button></div><div class="card__body">
        <form data-settings="addons" class="settings-list">
          <div data-rows>${s.addons.map((x) => row(`<input class="field__input input-sm" style="width:100%" name="name" placeholder="Add-on" value="${esc(x.name)}"><div class="money"><input class="field__input input-sm" style="width:100%" name="price" type="number" step="1" placeholder="Quoted" value="${esc(x.price == null ? "" : x.price)}"></div>`)).join("")}</div>
          <template><div class="settings-row"><input class="field__input input-sm" style="width:100%" name="name" placeholder="Add-on"><div class="money"><input class="field__input input-sm" style="width:100%" name="price" type="number" step="1" placeholder="Quoted"></div><button class="iconbtn iconbtn--danger" type="button" data-rowdel aria-label="Remove">${icon("trash")}</button></div></template>
          <p class="muted" style="font-size:12.5px">Leave the price blank for add-ons that are quoted on the day.</p>
          <div class="form__actions" style="border:0;margin:0"><button class="btn btn--primary" type="submit">Save add-ons</button></div>
        </form>
      </div></section>

      <section class="card"><div class="card__head"><h3>Lists</h3></div><div class="card__body">
        <form class="form" data-settings="lists">
          <label class="field span-2"><span class="field__label">Lead sources</span><input class="field__input" name="leadSources" value="${esc(s.leadSources.join(", "))}"></label>
          <label class="field span-2"><span class="field__label">Directory categories</span><input class="field__input" name="directoryCategories" value="${esc(s.directoryCategories.join(", "))}"></label>
          <label class="field span-2"><span class="field__label">Expense categories</span><input class="field__input" name="expenseCategories" value="${esc(s.expenseCategories.join(", "))}"></label>
          <label class="field span-2"><span class="field__label">Content pillars</span><input class="field__input" name="socialPillars" value="${esc(s.socialPillars.join(", "))}"><span class="field__hint">Comma separated</span></label>
          <div class="form__actions"><button class="btn btn--primary" type="submit">Save lists</button></div>
        </form>
      </div></section>

      <section class="card"><div class="card__head"><h3>Backup & restore</h3></div><div class="card__body stack" style="gap:12px">
        <p class="muted">Everything in the portal lives in one JSON file on the server. Download a copy regularly, especially before a redeploy on a host with a temporary filesystem.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn btn--dark" href="/api/admin/export" download>${icon("download")}Download backup</a>
          <label class="btn btn--ghost">${icon("upload")}Restore from file<input type="file" accept="application/json" id="import-file" hidden></label>
        </div>
        <p class="muted" style="font-size:12.5px">Restoring replaces all customers, jobs, directory, posts, expenses, inventory and tasks with the file's contents.</p>
        <hr style="border:0;border-top:1px solid var(--line-2);margin:4px 0">
        <p class="muted" style="font-size:12.5px"><strong style="color:var(--ink-900)">Password.</strong> Set the <code>ADMIN_PASSWORD</code> environment variable (Replit: Secrets) and restart. Signing out everywhere happens automatically when it changes.</p>
      </div></section>
    </div>`;
};

/* ---------- search ---------- */
V.search = () => {
  const q = S.route.q.toLowerCase();
  if (!q) return `<div class="card">${emptyState("search", "Search", "Type in the box above to search everything.")}</div>`;
  const hit = (parts) => parts.join(" ").toLowerCase().includes(q);
  const mark = (s) => esc(s).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), (m) => `<mark>${m}</mark>`);
  const customers = col("customers").filter((c) => hit([c.name, c.phone, c.email, c.address, (c.vehicles || []).join(" "), c.notes]));
  const jobs = col("jobs").filter((j) => hit([j.customerName, j.vehicle, j.address, j.notes, j.phone, j.email]));
  const dir = col("directory").filter((d) => hit([d.name, d.contact, d.category, d.notes, d.phone, d.email]));
  const posts = col("posts").filter((p) => hit([p.title, p.caption, p.hashtags, p.platform]));
  const tasks = col("tasks").filter((t) => hit([t.title, t.notes]));
  const inv = col("inventory").filter((i) => hit([i.name, i.category, i.notes]));
  const total = customers.length + jobs.length + dir.length + posts.length + tasks.length + inv.length;
  const section = (label, items, fn) => items.length ? `<div><h3>${label} · ${items.length}</h3><div class="card list">${items.slice(0, 12).map(fn).join("")}</div></div>` : "";
  return `
    <div class="page-head"><h2>${total} result${total === 1 ? "" : "s"} for “${esc(S.route.q)}”</h2></div>
    <div class="results">
      ${section("Customers", customers, (c) => `<div class="list__item is-link" data-open="customers" data-id="${c.id}"><div class="avatar avatar--sm">${initials(c.name)}</div><div class="list__main"><div class="list__title">${mark(c.name)}</div><div class="list__sub">${mark([c.phone, c.email, (c.vehicles || []).join(", ")].filter(Boolean).join(" · "))}</div></div></div>`)}
      ${section("Jobs", jobs, (j) => `<div class="list__item is-link" data-open="jobs" data-id="${j.id}">${icon("briefcase")}<div class="list__main"><div class="list__title">${mark(j.customerName)} ${pill(j.status)}</div><div class="list__sub">${mark([j.vehicle, j.date ? fmtDate(j.date) : "", j.address].filter(Boolean).join(" · "))}</div></div><div class="list__aside"><strong>${money(j.price)}</strong></div></div>`)}
      ${section("Directory", dir, (d) => `<div class="list__item is-link" data-edit="directory" data-id="${d.id}">${icon("book")}<div class="list__main"><div class="list__title">${mark(d.name)}</div><div class="list__sub">${mark([d.category, d.contact, d.phone].filter(Boolean).join(" · "))}</div></div></div>`)}
      ${section("Social posts", posts, (p) => `<div class="list__item is-link" data-open="posts" data-id="${p.id}">${icon("megaphone")}<div class="list__main"><div class="list__title">${mark(p.title)}</div><div class="list__sub">${platformPill(p.platform)} ${p.date ? fmtDate(p.date) : ""}</div></div></div>`)}
      ${section("Tasks", tasks, (t) => `<div class="list__item is-link" data-open="tasks" data-id="${t.id}">${icon("check-square")}<div class="list__main"><div class="list__title">${mark(t.title)}</div><div class="list__sub">${t.due ? fmtDate(t.due) : ""}${t.done ? " · done" : ""}</div></div></div>`)}
      ${section("Inventory", inv, (i) => `<div class="list__item is-link" data-open="inventory" data-id="${i.id}">${icon("box")}<div class="list__main"><div class="list__title">${mark(i.name)}</div><div class="list__sub">${i.qty} ${esc(i.unit || "")} in stock</div></div></div>`)}
      ${!total ? `<div class="card">${emptyState("search", "Nothing matched", "Try a name, phone number, vehicle or address.")}</div>` : ""}
    </div>`;
};

/* ==========================================================================
   Render + events
   ========================================================================== */
function render() {
  if (!S.data) return;
  renderNav();
  const view = V[S.route.name] || V.dashboard;
  try {
    $("#view").innerHTML = view();
  } catch (err) {
    console.error(err);
    $("#view").innerHTML = `<div class="card">${emptyState("alert", "This page hit an error", err.message, `<a class="btn btn--ghost" href="#/dashboard">Go to dashboard</a>`)}</div>`;
  }
  if (S.route.name !== "search") searchInput.value = "";
  else searchInput.value = S.route.q;
  wireSettings();
  wireDrag();
}

/** Open the right thing for a record: a page for jobs/customers, the edit dialog for the rest. */
function openRecord(collection, id) {
  if (collection === "jobs") return go(`/jobs/${id}`);
  if (collection === "customers") return go(`/customers/${id}`);
  const doc = getDoc(collection, id);
  if (doc) editRecord(collection, doc);
}

async function markPaid(id) {
  const j = getDoc("jobs", id);
  if (!j) return;
  openForm({
    title: "Record payment",
    intro: `${esc(j.customerName)} · ${esc(j.vehicle)} · <strong>${money(j.price)}</strong>`,
    fields: [
      { key: "price", label: "Amount collected", type: "money", required: true },
      { key: "paymentMethod", label: "Paid by", type: "select", required: true, options: PAYMENT_METHODS },
      { key: "paidAt", label: "Date", type: "date", required: true }
    ],
    values: { price: j.price, paymentMethod: j.paymentMethod || "Cash", paidAt: today() },
    submitLabel: "Mark as paid",
    onSubmit: async (v) => {
      await patchDoc("jobs", id, { price: v.price, paymentMethod: v.paymentMethod, paid: true, paidAt: v.paidAt, status: "paid" });
      toast("Payment recorded");
      refreshActivity().then(render);
      render();
    }
  });
}

function scheduleLead(id) {
  const j = getDoc("jobs", id);
  if (!j) return;
  openForm({
    title: "Book this job",
    intro: `Confirm the date, time and price with ${esc(j.customerName.split(" ")[0])} first.`,
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "time", label: "Time", type: "time", required: true },
      { key: "price", label: "Agreed price", type: "money", required: true },
      { key: "assignedTo", label: "Assigned to", type: "select", options: teamOptions, showIf: () => teamOptions().length > 0 }
    ],
    values: { date: j.date, time: j.time, price: j.price },
    submitLabel: "Schedule",
    onSubmit: async (v) => {
      await patchDoc("jobs", id, Object.assign(v, { status: "scheduled" }));
      toast("Job scheduled");
      refreshActivity().then(render);
      render();
    }
  });
}

// One delegated click handler for the whole content area.
$("#view").addEventListener("click", async (e) => {
  const el = (sel) => e.target.closest(sel);
  let b;
  if ((b = el("[data-toggle-task]"))) {
    e.stopPropagation();
    const t = getDoc("tasks", b.dataset.toggleTask);
    try { await patchDoc("tasks", t.id, { done: !t.done, doneAt: !t.done ? new Date().toISOString() : null }); render(); } catch (err) { fail(err); }
    return;
  }
  if ((b = el("[data-move]"))) {
    e.stopPropagation();
    const card = b.closest("[data-id]");
    const j = getDoc("jobs", card.dataset.id);
    const flow = STATUSES.filter((s) => s !== "cancelled");
    const next = flow[flow.indexOf(j.status) + Number(b.dataset.move)];
    if (!next) return;
    try { await setJobStatus(j.id, next); toast(`Moved to ${STATUS_LABEL[next]}`); render(); } catch (err) { fail(err); }
    return;
  }
  if ((b = el("[data-status]")) && b.dataset.id) {
    e.stopPropagation();
    const status = b.dataset.status;
    if (status === "cancelled" && !(await confirmDialog("Cancel this job? It stays in the list, marked cancelled.", "Cancel job"))) return;
    try { await setJobStatus(b.dataset.id, status); toast(`Moved to ${STATUS_LABEL[status]}`); refreshActivity().then(render); render(); } catch (err) { fail(err); }
    return;
  }
  if ((b = el("[data-schedule]"))) { e.stopPropagation(); return scheduleLead(b.dataset.schedule); }
  if ((b = el("[data-markpaid]"))) { e.stopPropagation(); return markPaid(b.dataset.markpaid); }
  if ((b = el("[data-poststatus]"))) {
    e.stopPropagation();
    try { await patchDoc("posts", b.dataset.id, { status: b.dataset.poststatus, postedAt: new Date().toISOString() }); toast("Marked as posted"); render(); } catch (err) { fail(err); }
    return;
  }
  if ((b = el("[data-copy]"))) {
    e.stopPropagation();
    const p = getDoc("posts", b.dataset.copy);
    try { await navigator.clipboard.writeText([p.caption, p.hashtags].filter(Boolean).join("\n\n")); toast("Caption copied"); } catch { toast("Could not copy", "error"); }
    return;
  }
  if ((b = el("[data-qty]"))) {
    e.stopPropagation();
    const i = getDoc("inventory", b.dataset.id);
    const qty = Math.max(0, Number(i.qty || 0) + Number(b.dataset.qty));
    try { await patchDoc("inventory", i.id, { qty }); render(); } catch (err) { fail(err); }
    return;
  }
  if ((b = el("[data-edit]"))) { e.stopPropagation(); const doc = getDoc(b.dataset.edit, b.dataset.id); if (doc) editRecord(b.dataset.edit, doc); return; }
  if ((b = el("[data-new]"))) {
    e.stopPropagation();
    const ctx = { status: b.dataset.ctxStatus, date: b.dataset.ctxDate, due: b.dataset.ctxDate, jobId: b.dataset.ctxJob, customerId: b.dataset.ctxCustomer };
    const c = b.dataset.new;
    const values = {};
    if (c === "jobs" && ctx.customerId) { const cust = getDoc("customers", ctx.customerId); values.customerId = cust.id; values.address = cust.address; values.vehicle = (cust.vehicles || [])[0] || ""; }
    if (c === "posts" && ctx.jobId) { const j = getDoc("jobs", ctx.jobId); values.jobId = j.id; values.title = `Before & after — ${j.vehicle}`; values.pillar = "Before & After"; values.status = "drafted"; }
    if (c === "tasks" && ctx.jobId) values.jobId = ctx.jobId;
    if (c === "tasks" && ctx.customerId) values.customerId = ctx.customerId;
    if (ctx.date) values.date = ctx.date, values.due = ctx.date;
    if (ctx.status) values.status = ctx.status;
    editRecord(c, null, ctx, (saved) => {
      if (c === "jobs" && S.route.name !== "calendar") go(`/jobs/${saved.id}`);
      else if (c === "customers") go(`/customers/${saved.id}`);
      else render();
    });
    // Pre-fill: editRecord builds from doc; patch the open form instead.
    const form = $("#mform");
    if (form) Object.entries(values).forEach(([k, v]) => {
      const wrap = form.querySelector(`[data-field="${k}"]`);
      const input = wrap && wrap.querySelector("input, select, textarea");
      if (input && v != null) { input.value = v; input.dispatchEvent(new Event("change", { bubbles: true })); }
    });
    return;
  }
  if ((b = el("[data-open]"))) { e.stopPropagation(); return openRecord(b.dataset.open, b.dataset.id); }
  if ((b = el("[data-jobsview]"))) { S.ui.jobsView = b.dataset.jobsview; localStorage.setItem("cas.jobsView", S.ui.jobsView); return render(); }
  if ((b = el("[data-socialtab]"))) { S.ui.socialTab = b.dataset.socialtab; return render(); }
  if ((b = el("[data-taskstab]"))) { S.ui.tasksTab = b.dataset.taskstab; return render(); }
  if ((b = el("[data-cal]"))) {
    if (b.dataset.cal === "today") S.ui.calMonth = today().slice(0, 7);
    else { const [y, m] = S.ui.calMonth.split("-").map(Number); S.ui.calMonth = monthKey(ymd(new Date(y, m - 1 + Number(b.dataset.cal), 1))); }
    return render();
  }
  if ((b = el("[data-day]"))) { e.stopPropagation(); return dayMenu(b.dataset.day, e.clientX, e.clientY); }
  if ((b = el("[data-rowadd]"))) {
    const form = $(`[data-settings="${b.dataset.rowadd}"]`);
    form.querySelector("[data-rows]").appendChild(form.querySelector("template").content.cloneNode(true));
    return;
  }
  if ((b = el("[data-rowdel]"))) { b.closest(".settings-row").remove(); return; }
});

// Filters and selects.
$("#view").addEventListener("input", (e) => {
  const t = e.target;
  if (t.matches("[data-jobsquery]")) { S.ui.jobsQuery = t.value; debounceRender(t); }
  else if (t.matches("[data-custquery]")) { S.ui.customersQuery = t.value; debounceRender(t); }
  else if (t.matches("[data-dirquery]")) { S.ui.directoryQuery = t.value; debounceRender(t); }
});
$("#view").addEventListener("change", (e) => {
  const t = e.target;
  if (t.matches("[data-jobsstatus]")) { S.ui.jobsStatus = t.value; render(); }
  else if (t.matches("[data-custtag]")) { S.ui.customersTag = t.value; render(); }
  else if (t.matches("[data-dircat]")) { S.ui.directoryCat = t.value; render(); }
  else if (t.matches("[data-socialplatform]")) { S.ui.socialPlatform = t.value; render(); }
  else if (t.matches("[data-financemonth]")) { S.ui.financeMonth = t.value; render(); }
  else if (t.id === "import-file") importBackup(t.files[0]);
});
let renderTimer;
function debounceRender(input) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    const pos = input.selectionStart;
    render();
    const again = $("#view").querySelector(`[${Array.from(input.attributes).map((a) => a.name).find((n) => n.startsWith("data-"))}]`);
    if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch { /* search inputs */ } }
  }, 220);
}

// Settings forms.
function wireSettings() {
  $$("[data-settings]").forEach((form) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const kind = form.dataset.settings;
      let patch = {};
      if (kind === "business") {
        const fd = new FormData(form);
        patch.business = Object.assign({}, settings().business);
        fd.forEach((v, k) => { patch.business[k] = k === "taxRate" ? Number(v) || 0 : String(v).trim(); });
      } else if (kind === "lists") {
        const fd = new FormData(form);
        fd.forEach((v, k) => { patch[k] = String(v).split(",").map((s) => s.trim()).filter(Boolean); });
      } else {
        const rows = $$(".settings-row", form).map((r) => {
          const o = {};
          $$("input", r).forEach((i) => { o[i.name] = i.type === "number" ? (i.value === "" ? null : Number(i.value)) : i.value.trim(); });
          return o;
        }).filter((o) => o.name);
        patch[kind] = rows;
      }
      try {
        S.data.settings = await api("PUT", "/settings", patch);
        toast("Settings saved");
        render();
      } catch (err) { fail(err); }
    };
  });
}

async function importBackup(file) {
  if (!file) return;
  let payload;
  try { payload = JSON.parse(await file.text()); } catch { return toast("That file is not valid JSON", "error"); }
  const counts = db_counts(payload);
  if (!(await confirmDialog(`Replace everything with this backup? It contains ${counts}.`, "Restore"))) return;
  try {
    const snap = await api("POST", "/import", payload);
    S.data = Object.assign(S.data, snap);
    toast("Backup restored");
    render();
  } catch (err) { fail(err); }
}
const db_counts = (p) => ["customers", "jobs", "directory", "posts", "expenses", "inventory", "tasks"].map((c) => `${(p[c] || []).length} ${c}`).join(", ");

// Drag and drop on the pipeline board.
function wireDrag() {
  const board = $(".board");
  if (!board) return;
  let dragId = null;
  board.addEventListener("dragstart", (e) => {
    const card = e.target.closest(".jobcard");
    if (!card) return;
    dragId = card.dataset.id;
    card.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", dragId); } catch { /* ignore */ }
  });
  board.addEventListener("dragend", () => { $$(".jobcard.is-dragging").forEach((c) => c.classList.remove("is-dragging")); $$(".col.is-over").forEach((c) => c.classList.remove("is-over")); });
  board.addEventListener("dragover", (e) => { const colEl = e.target.closest(".col"); if (!colEl) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; colEl.classList.add("is-over"); });
  board.addEventListener("dragleave", (e) => { const colEl = e.target.closest(".col"); if (colEl && !colEl.contains(e.relatedTarget)) colEl.classList.remove("is-over"); });
  board.addEventListener("drop", async (e) => {
    const colEl = e.target.closest(".col");
    if (!colEl || !dragId) return;
    e.preventDefault();
    const status = colEl.dataset.col;
    const j = getDoc("jobs", dragId);
    dragId = null;
    if (!j || j.status === status) return render();
    try { await setJobStatus(j.id, status); toast(`Moved to ${STATUS_LABEL[status]}`); render(); } catch (err) { fail(err); }
  });
  // Clicking a card (not dragging, not the arrows) opens it.
  board.addEventListener("click", (e) => {
    if (e.target.closest("[data-move]")) return;
    const card = e.target.closest(".jobcard");
    if (card) go(`/jobs/${card.dataset.id}`);
  });
}

boot();
})();
