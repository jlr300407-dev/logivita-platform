/* =====================================================================
   konto.js — Persönliche Konten (LeVITA Vital-Check)
   Version 1.0.0 · Stand 13.10.2026

   Gemeinsamer Baustein für index.html (Check), ernaehrung.html und
   konto.html ("Mein Bereich"). Spricht nur mit der Edge-Funktion
   "account" und den RPCs my_account / my_checks.

   Zwei Teile:
   1. Konto-Schritt (Stufe 3): LeVitaKonto.mountStep(element, optionen)
      Vorbelegt mit der Mailadresse aus dem Check, Pflicht-Häkchen Konto,
      zwei freiwillige Häkchen. "Ohne Konto weiter" bleibt immer möglich.
      Im Check (index.html) hängt er sich selbst ein: jedes Element mit
      data-konto-step wird automatisch befüllt, die PIN kommt aus
      window._accessPin und steht nie im HTML.
   2. Sitzung für "Mein Bereich": Landung nach dem Mail-Link, Speicherung,
      Verlängerung. Eigener Speicherschlüssel, damit sich Kundenkonto und
      Trainer-Dashboard (gleiche Domain) nie in die Quere kommen.

   Gehört zu Edge account-edge-2026-10-13.2 (EDGE_account_1.1.0.ts) und
   konto-fundament_1.2.0.sql.
   ===================================================================== */
(function () {
  "use strict";
  if (window.LeVitaKonto) return;

  var VERSION = "1.0.0";
  var SUPABASE_URL = "https://koctweetotpqaazeicwj.supabase.co";
  var ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvY3R3ZWV0b3RwcWFhemVpY3dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODQ3NzMsImV4cCI6MjA5NDk2MDc3M30.OS4WUR-q2rc82yxs_HkwlCzr9gDG8tBL0gIlwdUoyc0";
  var EDGE_URL = SUPABASE_URL + "/functions/v1/account";
  var LEVITA_TENANT_ID = "00000000-0000-4000-8000-000000000001";
  var STORE_KEY = "levita_konto_v1";

  // Testbetrieb: Seiten können diese Werte vor dem Laden überschreiben
  var cfg = window.LEVITA_KONTO_CONFIG || {};
  if (cfg.edgeUrl) EDGE_URL = cfg.edgeUrl;
  if (cfg.supabaseUrl) SUPABASE_URL = cfg.supabaseUrl;

  function kontoPageUrl() {
    // Liegt immer neben der aufrufenden Seite (app.logivita.de/check/ bzw. GitHub-Testseite)
    return new URL("konto.html", location.href.split("#")[0]).toString();
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function track(name, meta) {
    try { if (typeof window.trackEvent === "function") window.trackEvent(name, meta || {}); } catch (e) {}
  }

  // ── Speicher (kann in privaten Fenstern fehlen) ─────────────────────
  var memStore = null;
  function storeGet() {
    try { var v = localStorage.getItem(STORE_KEY); return v ? JSON.parse(v) : null; }
    catch (e) { return memStore; }
  }
  function storeSet(v) {
    memStore = v;
    try { if (v) localStorage.setItem(STORE_KEY, JSON.stringify(v)); else localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  // ── Aufrufe ────────────────────────────────────────────────────────
  async function edge(mode, body, accessToken) {
    var res;
    try {
      res = await fetch(EDGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          Authorization: "Bearer " + (accessToken || ANON_KEY),
        },
        body: JSON.stringify(Object.assign({ mode: mode }, body || {})),
      });
    } catch (e) {
      return { success: false, error: "NETWORK", _http: 0 };
    }
    var json;
    try { json = await res.json(); } catch (e) { json = { success: false, error: "BAD_RESPONSE" }; }
    json._http = res.status;
    return json;
  }

  async function rpc(fn, args, accessToken) {
    var res = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: "Bearer " + accessToken },
      body: JSON.stringify(args || {}),
    });
    if (!res.ok) throw new Error("RPC " + fn + " " + res.status);
    return res.json();
  }

  // ── Sitzung ────────────────────────────────────────────────────────
  // Nach dem Klick auf den Mail-Link hängt Supabase die Anmeldung als
  // #access_token=…&refresh_token=… bzw. bei Fehlern #error=… an.
  function consumeRedirect() {
    var h = location.hash ? location.hash.slice(1) : "";
    if (!h || (h.indexOf("access_token=") < 0 && h.indexOf("error") < 0)) return null;
    var p = new URLSearchParams(h);
    var clean = location.pathname + location.search.replace(/([?&])konto=1(&|$)/, "$1").replace(/[?&]$/, "");
    try { history.replaceState(null, "", clean); } catch (e) {}
    if (p.get("error") || p.get("error_code")) {
      return { error: p.get("error_code") || p.get("error"), description: p.get("error_description") || "" };
    }
    var sess = {
      access_token: p.get("access_token"),
      refresh_token: p.get("refresh_token"),
      expires_at: Math.floor(Date.now() / 1000) + Number(p.get("expires_in") || 3600),
      type: p.get("type") || "",
    };
    if (!sess.access_token) return null;
    storeSet(sess);
    return { session: sess, fresh: true };
  }

  async function refresh(sess) {
    if (!sess || !sess.refresh_token) return null;
    try {
      var res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON_KEY },
        body: JSON.stringify({ refresh_token: sess.refresh_token }),
      });
      if (!res.ok) return null;
      var j = await res.json();
      var next = {
        access_token: j.access_token, refresh_token: j.refresh_token || sess.refresh_token,
        expires_at: j.expires_at || Math.floor(Date.now() / 1000) + Number(j.expires_in || 3600), type: sess.type,
      };
      storeSet(next);
      return next;
    } catch (e) { return null; }
  }

  // Gültige Sitzung oder null. Verlängert bei Bedarf.
  async function session() {
    var s = storeGet();
    if (!s || !s.access_token) return null;
    if (s.expires_at && s.expires_at - 60 > Math.floor(Date.now() / 1000)) return s;
    var r = await refresh(s);
    if (!r) storeSet(null);
    return r;
  }

  function logout() { storeSet(null); }

  // ── Konto-Schritt (Stufe 3) ────────────────────────────────────────
  var CSS = "\
.lk{background:var(--brand-card,#132338);border:1px solid rgba(59,158,255,.35);border-radius:14px;padding:18px;margin:14px 0;color:var(--text-primary,#f0f4f8);font-family:inherit;text-align:left}\
.lk h3{font-size:16px;font-weight:700;margin:0 0 6px}\
.lk p{font-size:13.5px;line-height:1.6;color:var(--text-secondary,#8da0b8);margin:0 0 12px}\
.lk label.lk-lbl{display:block;font-size:12px;font-weight:600;color:var(--text-secondary,#8da0b8);margin:4px 0 6px}\
.lk input[type=email]{width:100%;box-sizing:border-box;padding:12px 13px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:var(--text-primary,#f0f4f8);font-size:15px;font-weight:500;font-family:inherit}\
.lk input[type=email]:focus{outline:none;border-color:var(--accent-green,#22c97a)}\
.lk .lk-box{display:flex;gap:10px;align-items:flex-start;font-size:12.5px;line-height:1.55;color:var(--text-secondary,#8da0b8);margin:12px 0;cursor:pointer}\
.lk .lk-box input{margin-top:3px;width:17px;height:17px;flex:0 0 17px;accent-color:var(--accent-green,#22c97a)}\
.lk .lk-box.req span{color:var(--text-primary,#f0f4f8)}\
.lk .lk-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}\
.lk button{font-family:inherit;cursor:pointer;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:700}\
.lk .lk-go{flex:1;border:0;background:var(--accent-green,#22c97a);color:#062214}\
.lk .lk-go:disabled{opacity:.45;cursor:default}\
.lk .lk-skip{border:1px solid rgba(255,255,255,.18);background:transparent;color:var(--text-secondary,#8da0b8);font-weight:600}\
.lk .lk-err{color:#ff8a8a;font-size:13px;margin-top:10px;min-height:1em}\
.lk .lk-ok{border-left:3px solid var(--accent-green,#22c97a);padding-left:12px}\
.lk a{color:var(--accent-blue,#3b9eff)}\
.lk .lk-small{font-size:11.5px;color:var(--text-muted,#4a6280);margin-top:10px}";
  function injectCss() {
    if (document.getElementById("lk-css")) return;
    var st = document.createElement("style");
    st.id = "lk-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  var LEADS = {
    studio: "Für dein Gespräch im Studio legen wir dir ein persönliches Konto an. Dort liegen deine Vital-Checks mit Verlauf, deine Termine und später dein Plan, ohne PIN und mit einem Link per E-Mail.",
    nutrition: "Für deine Begleitung legen wir dir ein persönliches Konto an. Dort liegen dein Plan, deine Termine und deine Vital-Checks mit Verlauf, ohne PIN und mit einem Link per E-Mail.",
  };

  function errText(e) {
    return ({
      PIN_INVALID: "Die PIN passt nicht mehr zu diesem Check. Bitte lade die Seite mit deiner PIN neu.",
      LOCKED: "Zu viele Versuche. Bitte warte 15 Minuten.",
      EMAIL_INVALID: "Bitte prüfe deine E-Mail-Adresse.",
      CONSENT_REQUIRED: "Bitte bestätige, dass wir dein Konto anlegen dürfen.",
      NETWORK: "Keine Verbindung. Bitte versuche es gleich noch einmal.",
    })[e] || "Das hat gerade nicht geklappt. Bitte versuche es gleich noch einmal.";
  }

  // opts: { publicCode, pin, context: "studio"|"nutrition", email?, firstName? }
  async function mountStep(el, opts) {
    if (!el || el.dataset.lkMounted === "1") return;
    el.dataset.lkMounted = "1";
    injectCss();
    opts = opts || {};
    var ctx = opts.context === "nutrition" ? "nutrition" : "studio";
    if (!opts.publicCode || !opts.pin) { el.innerHTML = ""; return; }   // ohne PIN kein Konto (Stufe 1)
    el.innerHTML = '<div class="lk"><p>Einen Moment …</p></div>';

    var st = await edge("account_status", { public_code: opts.publicCode, pin: opts.pin });
    if (!st.success) { el.innerHTML = ""; return; }   // still: der Konto-Schritt darf den Ablauf nie stören

    if (st.in_account) {
      el.innerHTML = '<div class="lk"><div class="lk-ok"><h3>Dieser Check liegt in deinem Konto</h3>' +
        '<p>Verlauf, Termine und Plan findest du in <a href="' + esc(kontoPageUrl()) + '" target="_blank" rel="noopener">deinem Bereich</a>.</p></div></div>';
      return;
    }

    var existing = !!st.has_account;
    var email = opts.email || st.email || "";
    var c = st.consent || {};
    var title = existing ? "Diesen Check in dein Konto übernehmen" : "Dein persönliches Konto";
    var lead = existing
      ? "Du hast bei " + esc(st.studio || "uns") + " schon ein Konto. Mit einem Klick auf den Link in der Mail kommt dieser Check in deinen Verlauf."
      : esc(LEADS[ctx]);
    el.innerHTML =
      '<div class="lk">' +
        '<h3>' + title + '</h3>' +
        '<p>' + lead + '</p>' +
        '<label class="lk-lbl" for="lk-mail">E-Mail-Adresse</label>' +
        '<input type="email" id="lk-mail" autocomplete="email" value="' + esc(email) + '">' +
        (existing ? "" : '<label class="lk-box req"><input type="checkbox" id="lk-c-acc"><span>' + esc(c.account) + '</span></label>') +
        '<label class="lk-box"><input type="checkbox" id="lk-c-plan"><span>' + esc(c.plan_mail) + '</span></label>' +
        '<label class="lk-box"><input type="checkbox" id="lk-c-rem"><span>' + esc(c.reminders) + '</span></label>' +
        '<div class="lk-row">' +
          '<button type="button" class="lk-go" id="lk-go"' + (existing ? "" : " disabled") + '>' + (existing ? "Link schicken" : "Konto anlegen") + '</button>' +
          '<button type="button" class="lk-skip" id="lk-skip">Ohne Konto weiter</button>' +
        '</div>' +
        '<div class="lk-err" id="lk-err"></div>' +
        '<div class="lk-small">Version ' + esc(c.version || "") + '</div>' +
      '</div>';
    track("account_step_view", { context: ctx, existing: existing });

    var go = el.querySelector("#lk-go"), acc = el.querySelector("#lk-c-acc");
    if (acc) acc.onchange = function () { go.disabled = !acc.checked; };

    el.querySelector("#lk-skip").onclick = function () {
      track("account_step_skip", { context: ctx });
      el.innerHTML = '<div class="lk"><p style="margin:0">Kein Problem. Pilot-ID und PIN funktionieren weiter wie bisher. ' +
        'Ein Konto kannst du jederzeit später im Studio oder hier anlegen.</p></div>';
    };

    go.onclick = async function () {
      var mail = (el.querySelector("#lk-mail").value || "").trim();
      var err = el.querySelector("#lk-err");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) { err.textContent = errText("EMAIL_INVALID"); return; }
      go.disabled = true; go.textContent = "Wird gesendet …"; err.textContent = "";
      var consents = {
        account: existing ? false : !!(acc && acc.checked),
        plan_mail: el.querySelector("#lk-c-plan").checked,
        reminders: el.querySelector("#lk-c-rem").checked,
      };
      var r = await edge("request_account", {
        public_code: opts.publicCode, pin: opts.pin, email: mail, consents: consents, return_url: kontoPageUrl(),
      });
      if (!r.success) {
        err.textContent = errText(r.error);
        go.disabled = false; go.textContent = existing ? "Link schicken" : "Konto anlegen";
        return;
      }
      track("account_requested", { context: ctx, existing: existing, plan_mail: consents.plan_mail, reminders: consents.reminders });
      el.innerHTML = '<div class="lk"><div class="lk-ok"><h3>Fast geschafft</h3>' +
        '<p>Wir haben dir einen Link an <strong>' + esc(mail) + '</strong> geschickt. Ein Klick darauf, und ' +
        (existing ? "dieser Check ist in deinem Konto." : "dein Konto ist aktiv.") + '</p>' +
        '<p style="margin:0">Keine Mail da? Schau bitte auch im Spam-Ordner nach.</p></div></div>';
    };
  }

  // Im Check: jedes [data-konto-step] automatisch befüllen, sobald es erscheint.
  function autoMount() {
    var nodes = document.querySelectorAll("[data-konto-step]:not([data-lk-mounted])");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      mountStep(n, {
        publicCode: n.getAttribute("data-code") || "",
        pin: window._accessPin || "",
        context: n.getAttribute("data-context") || "studio",
        email: n.getAttribute("data-email") || "",
      });
    }
  }
  function startObserver() {
    autoMount();
    try {
      new MutationObserver(function () { autoMount(); }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver);
  else startObserver();

  window.LeVitaKonto = {
    version: VERSION,
    tenantId: LEVITA_TENANT_ID,
    edge: edge,
    rpc: rpc,
    session: session,
    consumeRedirect: consumeRedirect,
    logout: logout,
    mountStep: mountStep,
    kontoPageUrl: kontoPageUrl,
    esc: esc,
  };
})();
