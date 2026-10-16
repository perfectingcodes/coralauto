/**
 * Coral Auto Spa — client-side language switching.
 *
 * The server injects window.__CORAL__ = { lang, dicts, biz } into the page, so
 * both dictionaries are already here when this runs. No fetch, no flash of the
 * wrong language, and the same strings the server uses for SMS.
 *
 * Markup opts in three ways:
 *   data-i18n="key"                     -> textContent
 *   data-i18n-html="key"                -> innerHTML (only for our own copy)
 *   data-i18n-attr="placeholder:key"    -> attribute, comma-separate for several
 */
(function () {
  "use strict";

  var boot = window.__CORAL__ || {};
  var DICTS = boot.dicts || { en: {} };
  var LANGS = Object.keys(DICTS);
  var STORAGE_KEY = "coral.lang";

  var current = boot.lang && DICTS[boot.lang] ? boot.lang : "en";

  function stored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return v && DICTS[v] ? v : null;
    } catch (err) {
      return null;   // private mode, blocked storage — fall through to default
    }
  }

  function remember(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (err) { /* nothing we can do */ }
    // Mirror it into a cookie so the server can render the right <html lang>
    // on the next request.
    try {
      document.cookie = "coral_lang=" + lang + ";path=/;max-age=31536000;samesite=lax";
    } catch (err) { /* nothing we can do */ }
  }

  /** One string, with {{token}} substitution for runtime values. */
  function t(key, vars) {
    var table = DICTS[current] || DICTS.en;
    var raw = table[key];
    if (raw === undefined) raw = (DICTS.en || {})[key];
    if (raw === undefined) return key;
    if (!vars) return raw;
    return raw.replace(/\{\{(\w+)\}\}/g, function (m, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m;
    });
  }

  function apply(root) {
    var scope = root || document;

    scope.querySelectorAll("[data-i18n]").forEach(function (el) {
      var val = t(el.getAttribute("data-i18n"));
      if (val !== undefined) el.textContent = val;
    });

    // Only our own dictionary reaches innerHTML — never user input.
    scope.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var val = t(el.getAttribute("data-i18n-html"));
      if (val !== undefined) el.innerHTML = val;
    });

    scope.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(",").forEach(function (pair) {
        var bits = pair.split(":");
        if (bits.length !== 2) return;
        var attr = bits[0].trim();
        var val = t(bits[1].trim());
        if (val !== undefined) el.setAttribute(attr, val);
      });
    });

    document.documentElement.lang = current;
    document.title = t("meta.title");

    // Reflect the active language on the switch itself.
    document.querySelectorAll(".lang-btn").forEach(function (btn) {
      var on = btn.getAttribute("data-lang") === current;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });

    document.dispatchEvent(new CustomEvent("coral:lang", { detail: { lang: current } }));
  }

  function setLang(lang, persist) {
    if (!DICTS[lang] || lang === current) {
      if (lang === current) reveal();
      return;
    }
    current = lang;
    if (persist !== false) remember(lang);
    apply();
    reveal();
  }

  /** The page is hidden only while a non-English render is pending. */
  function reveal() {
    document.documentElement.removeAttribute("data-lang-pending");
  }

  function init() {
    var saved = stored();
    // A ?lang= in the URL wins, so a link we hand out can force a language.
    var fromUrl = null;
    try {
      fromUrl = new URLSearchParams(location.search).get("lang");
    } catch (err) { /* ignore */ }

    if (fromUrl && DICTS[fromUrl]) {
      current = fromUrl;
      remember(fromUrl);
    } else if (saved) {
      current = saved;
    }

    apply();
    reveal();

    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".lang-btn");
      if (!btn) return;
      e.preventDefault();
      setLang(btn.getAttribute("data-lang"), true);
    });
  }

  // Whatever happens, never leave the page invisible.
  setTimeout(reveal, 1200);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.coral = window.coral || {};
  window.coral.t = t;
  window.coral.apply = apply;
  window.coral.lang = function () { return current; };
  window.coral.setLang = setLang;
  window.coral.langs = LANGS;
})();
