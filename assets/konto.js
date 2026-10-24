/* =====================================================================
   konto.js — Persönliche Konten (LeVITA Vital-Check)
   Version 1.4.0 · Stand 17.10.2026

   1.4.0 (17.10.2026): Hell/Dunkel. Das Stylesheet des Konto-Schritts nutzt jetzt die
     Rollen-Tokens des Vital-Checks (v2.8.12/v2.8.13); die Werte nach dem Komma bleiben
     die dunklen Rueckfaelle, auf einer Seite ohne Tokens sieht alles aus wie bisher.
     Behoben im hellen Thema: Knopfschrift #062214 fest dunkel auf dunkelgruenem Knopf
     (jetzt --on-accent), Rahmen von E-Mail-Feld und "Ohne Konto weiter" fest weiss und
     auf weisser Karte unsichtbar (jetzt --ink-rgb), Fehlermeldung #ff8a8a zu blass
     (jetzt --error-text). Links als Schrift: --accent-blue-text. --text-muted-Rueckfall
     #4a6280 -> #8396ae (WCAG, wie v2.8.6). Der dunkle Schleier hinter dem Erklaerfenster
     bleibt in beiden Themen dunkel. Sonst unveraendert, rueckwaertskompatibel.

   1.3.0 (15.10.2026): Hinweise zum Anmeldelink und zur Sicherheit.
     - Neu: LeVitaKonto.showGuide({ once }) — Erklärfenster "So funktioniert dein Konto"
       (Link gilt eine Stunde und nur einmal, danach bleibt das Gerät angemeldet, Tipps,
       warum das sicher ist). once: true zeigt es pro Gerät nur einmal (Speicherschlüssel
       levita_konto_guide_v1). LeVitaKonto.guideSeen() fragt das ab.
     - Neu: LeVitaKonto.LINK_VALID ("eine Stunde"), muss zur Supabase-Einstellung
       Auth, Email OTP Expiration passen (Standard 3600 Sekunden).
     - Konto-Schritt: Link "Wie funktioniert die Anmeldung?" unter den Knöpfen; nach dem
       Versand Hinweis auf Gültigkeit, Gerät und Mail-App.
     - Bindet keine neuen Dienste ein, rückwärtskompatibel zu 1.2.0.

   1.2.0 (15.10.2026, Einführungsphase Ernährungs-Check): mountStep nimmt opts.lead an — eigener
     Einleitungssatz statt des Standardtextes (der von "Begleitung" spricht). Sonst unverändert,
     rückwärtskompatibel; Check und Mein Bereich dürfen weiter 1.1.0 laden oder diese Datei.

   1.1.0 (Ernährungs-Chat, abgestimmt mit Entscheidungen Jörg 13.10.2026):
     - Pflichtmodus: mountStep(el, { …, required: true }) zeigt kein "Ohne Konto weiter"
       (Konto ist Pflicht ab Stufe 3, z. B. nach "Auswahl bestätigen" im Ernährungs-Check).
       Kann der Status nicht geladen werden, erscheint im Pflichtmodus ein Hinweis statt
       Stille ("richten wir im Erstgespräch ein") — der Ablauf wird nie blockiert.
     - Im Check per Attribut: <div data-konto-step data-required="1" …> (für die Studio-Anfrage).
     - Rückmeldung an die Seite: opts.onState({ in_account, has_account }) nach dem Laden,
       opts.onRequested({ email, existing }) nach verschickter Konto-Anfrage; zusätzlich
       Event "levita:account-requested" auf document.
     - Häkchen "Mein Plan per E-Mail" entfällt (Entscheidung Jörg 17:45: die Plan-Mail
       löst der Nutzer selbst in "Mein Bereich" aus); plan_mail wird immer false gesendet.
     Rückwärtskompatibel: ohne required/Callbacks verhält sich der Schritt wie 1.0.0
     (bis auf das entfallene Plan-Mail-Häkchen).

   Gemeinsamer Baustein für index.html (Check), ernaehrung.html und
   konto.html ("Mein Bereich"). Spricht nur mit der Edge-Funktion
   "account" und den RPCs my_account / my_checks.

   Zwei Teile:
   1. Konto-Schritt (Stufe 3): LeVitaKonto.mountStep(element, optionen)
      Vorbelegt mit der Mailadresse aus dem Check, Pflicht-Häkchen Konto,
      freiwilliges Häkchen Erinnerungen. "Ohne Konto weiter" nur ohne required.
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

  var VERSION = "1.5.0";
  var LINK_VALID = "eine Stunde";   // Supabase Auth, Email OTP Expiration (Standard 3600 s)
  var GUIDE_KEY = "levita_konto_guide_v1";
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

  // ── 1.5.0 (Paket W5, 24.10.2026): Anmeldung, die Mailprogramme nicht vorab verbrauchen, und Code als Ausweg ──
  // Der Link in der Mail öffnet nur "Mein Bereich" (#lk_th=…). Angemeldet wird erst mit dem Klick auf
  // "Jetzt anmelden" (POST /auth/v1/verify). Danach geht es mit derselben #access_token=…-Rückgabe weiter
  // wie bei den bisherigen Supabase-Links – alte Links funktionieren unverändert.
  function pendingLink() {
    var h = location.hash ? location.hash.slice(1) : "";
    if (h.indexOf("lk_th=") < 0) return null;
    var p = new URLSearchParams(h);
    return { th: p.get("lk_th") || "", vt: p.get("lk_vt") || "magiclink", ret: p.get("lk_ret") || "" };
  }
  async function verifyRaw(body) {
    try {
      var res = await fetch(SUPABASE_URL + "/auth/v1/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON_KEY },
        body: JSON.stringify(body),
      });
      var j = {}; try { j = await res.json(); } catch (e) { j = {}; }
      if (!res.ok || !j.access_token) return { error: j.error_code || j.code || j.error || ("HTTP_" + res.status), description: j.msg || j.error_description || j.message || "" };
      return { json: j };
    } catch (e) { return { error: "NETWORK", description: "" }; }
  }
  function sameOriginPath(ret) {
    try { var u = new URL(ret, location.href); if (u.origin === location.origin) return u.pathname + u.search; } catch (e) {}
    return location.pathname + location.search;
  }
  async function verifyLink(p) {
    var r = await verifyRaw({ type: p.vt, token_hash: p.th });
    if (r.error) { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} return r; }
    var j = r.json;
    var target = sameOriginPath(p.ret);
    var hash = "#access_token=" + encodeURIComponent(j.access_token) + "&refresh_token=" + encodeURIComponent(j.refresh_token || "") +
      "&expires_in=" + encodeURIComponent(j.expires_in || 3600) + "&type=" + encodeURIComponent(p.vt);
    var same = target === location.pathname + location.search;
    location.replace(target + hash);
    if (same) location.reload();
    return { redirecting: true };
  }
  async function verifyCode(email, code) {
    var token = String(code || "").replace(/\D/g, "");
    if (token.length < 6) return { error: "CODE_FORMAT", description: "" };
    var types = ["email", "magiclink", "invite"], last = null;
    for (var i = 0; i < types.length; i++) {
      var r = await verifyRaw({ type: types[i], email: email, token: token });
      if (!r.error) {
        var j = r.json;
        var sess = { access_token: j.access_token, refresh_token: j.refresh_token,
          expires_at: j.expires_at || Math.floor(Date.now() / 1000) + Number(j.expires_in || 3600), type: types[i] };
        storeSet(sess);
        return { session: sess, fresh: true };
      }
      last = r;
    }
    return last;
  }

  // ── 1.3.0 Erklärfenster: Anmeldelink, Tipps, Sicherheit ───────────
  function guideSeen() {
    try { return localStorage.getItem(GUIDE_KEY) === "1"; } catch (e) { return false; }
  }
  function markGuideSeen() { try { localStorage.setItem(GUIDE_KEY, "1"); } catch (e) {} }

  function guideHtml() {
    return '' +
      '<h2 id="lkg-t">So funktioniert dein Konto</h2>' +
      '<p class="lkg-sub">Kein Passwort: Du meldest dich mit einem Link an, den wir dir per E-Mail schicken.</p>' +
      '<div class="lkg-key">' +
        '<div><b>Gilt ' + LINK_VALID + '</b>und nur für einen Klick</div>' +
        '<div><b>Dann angemeldet</b>auf diesem Gerät, ohne neuen Link</div>' +
        '<div><b>Neuer Link</b>nur auf einem anderen Gerät oder nach dem Abmelden</div>' +
      '</div>' +
      '<h3>Wann brauche ich einen neuen Link?</h3>' +
      '<ul>' +
        '<li>Auf einem <strong>anderen Gerät</strong> oder in einem <strong>anderen Browser</strong>.</li>' +
        '<li>Nach <strong>Abmelden</strong>, im <strong>privaten Fenster</strong> oder wenn du die <strong>Browserdaten gelöscht</strong> hast.</li>' +
        '<li>Wenn ein Link <strong>abgelaufen</strong> ist oder schon benutzt wurde. Einen neuen forderst du in „Mein Bereich“ mit deiner E-Mail-Adresse an.</li>' +
      '</ul>' +
      '<h3>Tipps für den Alltag</h3>' +
      '<ul>' +
        '<li><strong>Öffne die Mail auf dem Gerät</strong>, auf dem du dein Konto nutzen möchtest – meist dein Handy.</li>' +
        '<li><strong>Öffnet sich der Link in deiner Mail-App</strong>, wähle „Im Browser öffnen“ (Safari oder Chrome). Sonst bist du nur in der Mail-App angemeldet.</li>' +
        '<li><strong>Leg dir „Mein Bereich“ als Lesezeichen</strong> oder auf den Home-Bildschirm. Dann bist du mit einem Tipp in deinem Konto.</li>' +
        '<li><strong>Mehrere Mails bekommen?</strong> Nimm immer die neueste. Ein neuer Link geht frühestens nach einer Minute raus.</li>' +
        '<li><strong>Keine Mail da?</strong> Schau im Spam-Ordner nach und speichere unsere Adresse in deinen Kontakten.</li>' +
      '</ul>' +
      '<h3>Warum das sicher ist</h3>' +
      '<ul class="lkg-safe">' +
        '<li><strong>Kein Passwort,</strong> das erraten, abgefangen oder von einer anderen Seite wiederverwendet werden kann.</li>' +
        '<li><strong>Nur dein Postfach:</strong> Anmelden kann sich nur, wer Zugriff auf deine E-Mail-Adresse hat.</li>' +
        '<li><strong>Kurz und einmalig:</strong> Jeder Link gilt ' + LINK_VALID + ' und funktioniert nur ein einziges Mal.</li>' +
        '<li><strong>Verschlüsselt:</strong> Die Verbindung ist verschlüsselt, deine Daten liegen in der EU (Frankfurt).</li>' +
        '<li><strong>Du behältst die Kontrolle:</strong> Mit „Abmelden“ beendest du die Anmeldung auf einem Gerät, dein Konto kannst du jederzeit selbst löschen.</li>' +
        '<li><strong>Dein Beitrag:</strong> Leite die Mail nicht weiter – wir fragen nie nach deinem Link. Schütze dein E-Mail-Postfach mit einem guten Passwort, am besten mit Zwei-Faktor-Anmeldung. Auf geteilten Geräten nach der Nutzung abmelden.</li>' +
      '</ul>' +
      '<button type="button" class="lkg-ok" id="lkg-ok">Verstanden</button>';
  }

  // opts: { once?: boolean, onClose?: fn }
  function showGuide(opts) {
    opts = opts || {};
    if (opts.once && guideSeen()) return false;
    if (document.getElementById("lkg-ov")) return false;
    injectCss();
    var ov = document.createElement("div");
    ov.className = "lkg-ov"; ov.id = "lkg-ov";
    ov.innerHTML = '<div class="lkg" role="dialog" aria-modal="true" aria-labelledby="lkg-t">' + guideHtml() + '</div>';
    var prevFocus = document.activeElement;
    function close() {
      markGuideSeen();
      document.removeEventListener("keydown", onKey);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) {}
      track("account_guide_close", { once: !!opts.once });
      notify(opts.onClose);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(ov);
    ov.querySelector("#lkg-ok").onclick = close;
    try { ov.querySelector("#lkg-ok").focus({ preventScroll: true }); ov.querySelector(".lkg").scrollTop = 0; } catch (e) {}
    track("account_guide_open", { once: !!opts.once });
    return true;
  }

  // ── Konto-Schritt (Stufe 3) ────────────────────────────────────────
  var CSS = "\
.lk{background:var(--brand-card,#132338);border:1px solid rgba(var(--accent-blue-rgb,59,158,255),.35);border-radius:14px;padding:18px;margin:14px 0;color:var(--text-primary,#f0f4f8);font-family:inherit;text-align:left}\
.lk h3{font-size:16px;font-weight:700;margin:0 0 6px}\
.lk p{font-size:13.5px;line-height:1.6;color:var(--text-secondary,#8da0b8);margin:0 0 12px}\
.lk label.lk-lbl{display:block;font-size:12px;font-weight:600;color:var(--text-secondary,#8da0b8);margin:4px 0 6px}\
.lk input[type=email]{width:100%;box-sizing:border-box;padding:12px 13px;border-radius:10px;border:1px solid rgba(var(--ink-rgb,255,255,255),.12);background:rgba(var(--ink-rgb,255,255,255),.04);color:var(--text-primary,#f0f4f8);font-size:15px;font-weight:500;font-family:inherit}\
.lk input[type=email]:focus{outline:none;border-color:var(--accent-green,#22c97a)}\
.lk .lk-box{display:flex;gap:10px;align-items:flex-start;font-size:12.5px;line-height:1.55;color:var(--text-secondary,#8da0b8);margin:12px 0;cursor:pointer}\
.lk .lk-box input{margin-top:3px;width:17px;height:17px;flex:0 0 17px;accent-color:var(--accent-green,#22c97a)}\
.lk .lk-box.req span{color:var(--text-primary,#f0f4f8)}\
.lk .lk-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}\
.lk button{font-family:inherit;cursor:pointer;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:700}\
.lk .lk-go{flex:1;border:0;background:var(--accent-green,#22c97a);color:var(--on-accent,#062214)}\
.lk .lk-go:disabled{opacity:.45;cursor:default}\
.lk .lk-skip{border:1px solid rgba(var(--ink-rgb,255,255,255),.18);background:transparent;color:var(--text-secondary,#8da0b8);font-weight:600}\
.lk .lk-err{color:var(--error-text,#ff8a8a);font-size:13px;margin-top:10px;min-height:1em}\
.lk .lk-ok{border-left:3px solid var(--accent-green,#22c97a);padding-left:12px}\
.lk a{color:var(--accent-blue-text,#3b9eff)}\
.lk .lk-small{font-size:11.5px;color:var(--text-muted,#8396ae);margin-top:10px}\
.lk .lk-how{background:none;border:0;padding:0;margin-top:12px;font-size:12.5px;font-weight:600;color:var(--accent-blue-text,#3b9eff);text-decoration:underline;text-underline-offset:2px;border-radius:0}\
.lkg-ov{position:fixed;inset:0;z-index:9999;background:rgba(3,8,18,.72);display:flex;align-items:flex-end;justify-content:center;padding:12px;font-family:inherit}\
@media(min-width:600px){.lkg-ov{align-items:center}}\
.lkg{background:var(--brand-card,#132338);color:var(--text-primary,#f0f4f8);border:1px solid rgba(var(--accent-blue-rgb,59,158,255),.35);border-radius:16px;max-width:520px;width:100%;max-height:88vh;overflow:auto;padding:22px 20px 18px;text-align:left;box-shadow:0 18px 50px rgba(var(--shadow-rgb,0,0,0),.45)}\
.lkg h2{font-size:20px;font-weight:700;margin:0 0 4px;line-height:1.25}\
.lkg .lkg-sub{font-size:13.5px;color:var(--text-secondary,#8da0b8);margin:0 0 14px;line-height:1.55}\
.lkg h3{font-size:14.5px;font-weight:700;margin:16px 0 6px}\
.lkg ul{margin:0;padding:0 0 0 18px}\
.lkg li{font-size:13.5px;line-height:1.55;color:var(--text-secondary,#8da0b8);margin:0 0 6px}\
.lkg li strong{color:var(--text-primary,#f0f4f8);font-weight:600}\
.lkg .lkg-key{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:4px 0 2px}\
.lkg .lkg-key div{background:rgba(var(--ink-rgb,255,255,255),.04);border:1px solid rgba(var(--ink-rgb,255,255,255),.08);border-radius:10px;padding:9px 10px;font-size:12px;line-height:1.4;color:var(--text-secondary,#8da0b8)}\
.lkg .lkg-key b{display:block;font-size:13.5px;color:var(--text-primary,#f0f4f8);margin-bottom:2px}\
@media(max-width:420px){.lkg .lkg-key{grid-template-columns:1fr}}\
.lkg .lkg-safe{border-left:3px solid var(--accent-green,#22c97a);padding-left:12px}\
.lkg .lkg-ok{display:block;width:100%;margin-top:18px;border:0;border-radius:999px;padding:13px 18px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;background:var(--accent-green,#22c97a);color:var(--on-accent,#062214)}";
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
  var LEADS_REQUIRED = {
    studio: "Für dein Gespräch im Studio brauchst du ein persönliches Konto. Dort liegen deine Vital-Checks mit Verlauf, deine Termine und später dein Plan, ohne PIN und mit einem Link per E-Mail.",
    nutrition: "Für deine Begleitung brauchst du ein persönliches Konto. Dort findest du nach dem Erstgespräch deinen Plan, deine Termine und deine Vital-Checks, ohne PIN und mit einem Link per E-Mail.",
  };
  function notify(fn, arg) { try { if (typeof fn === "function") fn(arg); } catch (e) {} }

  function errText(e) {
    return ({
      PIN_INVALID: "Die PIN passt nicht mehr zu diesem Check. Bitte lade die Seite mit deiner PIN neu.",
      LOCKED: "Zu viele Versuche. Bitte warte 15 Minuten.",
      EMAIL_INVALID: "Bitte prüfe deine E-Mail-Adresse.",
      CONSENT_REQUIRED: "Bitte bestätige, dass wir dein Konto anlegen dürfen.",
      NETWORK: "Keine Verbindung. Bitte versuche es gleich noch einmal.",
    })[e] || "Das hat gerade nicht geklappt. Bitte versuche es gleich noch einmal.";
  }

  // opts: { publicCode, pin, context: "studio"|"nutrition", email?, firstName?,
  //         required?: boolean, onState?: fn({in_account, has_account}), onRequested?: fn({email, existing}) }
  async function mountStep(el, opts) {
    if (!el || el.dataset.lkMounted === "1") return;
    el.dataset.lkMounted = "1";
    injectCss();
    opts = opts || {};
    var ctx = opts.context === "nutrition" ? "nutrition" : "studio";
    var required = opts.required === true;
    var fallback = '<div class="lk"><p style="margin:0">Dein persönliches Konto richten wir dir im Erstgespräch ein.</p></div>';
    if (!opts.publicCode || !opts.pin) { el.innerHTML = required ? fallback : ""; return; }   // ohne PIN kein Konto (Stufe 1)
    el.innerHTML = '<div class="lk"><p>Einen Moment …</p></div>';

    var st = await edge("account_status", { public_code: opts.publicCode, pin: opts.pin });
    if (!st.success) { el.innerHTML = required ? fallback : ""; return; }   // der Konto-Schritt darf den Ablauf nie stören
    notify(opts.onState, { in_account: !!st.in_account, has_account: !!st.has_account });

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
      : esc(opts.lead || (required ? LEADS_REQUIRED : LEADS)[ctx]);
    el.innerHTML =
      '<div class="lk">' +
        '<h3>' + title + '</h3>' +
        '<p>' + lead + '</p>' +
        '<label class="lk-lbl" for="lk-mail">E-Mail-Adresse</label>' +
        '<input type="email" id="lk-mail" autocomplete="email" value="' + esc(email) + '">' +
        (existing ? "" : '<label class="lk-box req"><input type="checkbox" id="lk-c-acc"><span>' + esc(c.account) + '</span></label>') +
        '<label class="lk-box"><input type="checkbox" id="lk-c-rem"><span>' + esc(c.reminders) + '</span></label>' +
        '<div class="lk-row">' +
          '<button type="button" class="lk-go" id="lk-go"' + (existing ? "" : " disabled") + '>' + (existing ? "Link schicken" : "Konto anlegen") + '</button>' +
          (required ? "" : '<button type="button" class="lk-skip" id="lk-skip">Ohne Konto weiter</button>') +
        '</div>' +
        '<div class="lk-err" id="lk-err"></div>' +
        '<button type="button" class="lk-how" data-lk-how>Wie funktioniert die Anmeldung per Link?</button>' +
        '<div class="lk-small">Version ' + esc(c.version || "") + '</div>' +
      '</div>';
    track("account_step_view", { context: ctx, existing: existing });

    var go = el.querySelector("#lk-go"), acc = el.querySelector("#lk-c-acc");
    el.querySelector("[data-lk-how]").onclick = function () { showGuide(); };
    if (acc) acc.onchange = function () { go.disabled = !acc.checked; };

    if (!required) el.querySelector("#lk-skip").onclick = function () {
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
        plan_mail: false,   // 1.1.0: Plan-Mail fordert der Nutzer selbst in "Mein Bereich" an
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
      track("account_requested", { context: ctx, existing: existing, reminders: consents.reminders, required: required });
      notify(opts.onRequested, { email: mail, existing: existing });
      try { document.dispatchEvent(new CustomEvent("levita:account-requested", { detail: { context: ctx, existing: existing } })); } catch (e) {}
      el.innerHTML = '<div class="lk"><div class="lk-ok"><h3>Fast geschafft</h3>' +
        '<p>Wir haben dir einen Link an <strong>' + esc(mail) + '</strong> geschickt. Ein Klick darauf, und ' +
        (existing ? "dieser Check ist in deinem Konto." : "dein Konto ist aktiv.") + '</p>' +
        '<p>Der Link gilt <strong>' + LINK_VALID + '</strong> und nur für einen Klick. Öffne ihn am besten auf dem Gerät, auf dem du dein Konto nutzen möchtest – danach bleibst du dort angemeldet.</p>' +
        '<p style="margin:0">Keine Mail da? Schau bitte auch im Spam-Ordner nach.</p>' +
        '<button type="button" class="lk-how" data-lk-how>Tipps und warum das sicher ist</button></div></div>';
      el.querySelector("[data-lk-how]").onclick = function () { showGuide(); };
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
        required: n.getAttribute("data-required") === "1",   // 1.1.0: Pflichtmodus auch per Attribut
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
    pendingLink: pendingLink,     // 1.5.0
    verifyLink: verifyLink,       // 1.5.0
    verifyCode: verifyCode,       // 1.5.0
    mountStep: mountStep,
    kontoPageUrl: kontoPageUrl,
    showGuide: showGuide,         // 1.3.0
    guideSeen: guideSeen,         // 1.3.0
    LINK_VALID: LINK_VALID,       // 1.3.0
    esc: esc,
  };
})();
