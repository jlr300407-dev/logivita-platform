#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   LeVITA Vital-Check · Release-Bau
   26.09.2026

   ZWECK
   Aus der vollständigen Arbeitsdatei index.html wird die Fassung erzeugt,
   die auf le-vita.com ausgeliefert wird. Die Arbeitsdatei bleibt unberührt
   und behält Änderungshistorie und Kommentare — sie ist und bleibt die
   einzige Quelle.

   WARUM ÜBERHAUPT
   index.html ist eine Webseite: Jeder Besucher kann den Quelltext lesen.
   Die Projektchronik im Dateikopf, der deaktivierte Pixel-Schnipsel samt
   Anleitung und interne Testläufe gehören nicht in die Öffentlichkeit.

   REGEL
   Die erzeugte Datei wird NIE von Hand geändert. Jede Änderung passiert in
   index.html; danach dieses Skript laufen lassen. So können die beiden
   Fassungen nicht auseinanderlaufen.

   AUFRUF
     node build-release.js
     node build-release.js  <quelle>  <ziel>

   Standard: index.html  →  release/vital-check.html
   Die Zieldatei wird als index.html nach /app/vital-check/ hochgeladen.
══════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const src = process.argv[2] || 'index.html';
const out = process.argv[3] || path.join('release', 'vital-check.html');

let html = fs.readFileSync(src, 'utf8');
const before = html.length;

// ── 1) Version und Datum aus der Arbeitsdatei lesen ─────────────────
const version = (html.match(/<footer class="app-footer">[\s\S]*?(v\d+\.\d+\.\d+)/) || [])[1] || 'ohne Version';
const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

// ── 2) Alle HTML-Kommentare entfernen ───────────────────────────────
// Darin stecken die Projektchronik, der Pixel-Schnipsel mit ID und
// Reaktivierungsanleitung sowie interne Notizen. Geprüft: In den
// <script>-Blöcken kommt keine Kommentar-Syntax vor, das Entfernen kann
// also keinen Code treffen. Bedingte Kommentare für alte Browser gibt es
// in dieser Datei nicht.
const kommentare = (html.match(/<!--[\s\S]*?-->/g) || []).length;
html = html.replace(/<!--[\s\S]*?-->/g, '');

// ── 3) Interne Spuren in den Code-Kommentaren neutralisieren ────────
// Die Kommentare im Code selbst bleiben — sie erklären, was danebensteht,
// und sind für jeden Entwickler nach uns wertvoll. Entfernt werden nur
// Personen, echte Pilot-IDs und Namen von Testpersonen.
const ersetzungen = [
  [/Entscheidung\s+J(?:ö|oe)rg/g, 'Produktentscheidung'],
  [/\(Befund\s+J(?:ö|oe)rg[^)]*\)/g, '(aus einem internen Test)'],
  [/\bJ(?:ö|oe)rg\b/g, 'Produktverantwortung'],
  [/LEV-20\d{2}-\d{6}(?!\s*\))/g, 'LEV-JJJJ-NNNNNN'],
  [/Testperson\s+"[^"]+"/g, 'interne Testperson'],
];
let ersetzt = 0;
for (const [re, rep] of ersetzungen) {
  html = html.replace(re, (m) => { ersetzt++; return rep; });
}

// ── 4) Knapper Kopf statt Chronik ───────────────────────────────────
const kopf = `<!--
  LeVITA Vital-Check · ${version} · Stand ${heute}
  Ausgelieferte Fassung. Bitte nicht verändern, auch nicht einrücken oder
  zusammenfassen — Textpflege läuft über die Datenbank, neue Fassungen
  liefern wir versioniert nach.
  Änderungshistorie und Entwicklungsstand liegen im Repository.
  Rückfragen: info@le-vita.com
-->
`;
html = html.replace(/<html lang="de">\s*<head>/, `<html lang="de">\n<head>\n${kopf}`);

// ── 5) Leerzeilen, die durch das Entfernen entstanden sind ──────────
html = html.replace(/\n{3,}/g, '\n\n');

// ── 6) Prüfungen, die einen kaputten Release verhindern ─────────────
const pruefungen = [
  ['Fußzeile mit Version', /<footer class="app-footer">/],
  ['Supabase-Konfiguration', /const SUPABASE_URL\s*=/],
  ['Startfunktion', /function\s+startWithGoal/],
  ['Uhrenwerte', /function\s+collectWatchValues/],
];
const fehlend = pruefungen.filter(([, re]) => !re.test(html)).map(([n]) => n);
if (fehlend.length) {
  console.error('ABBRUCH — im Ergebnis fehlt: ' + fehlend.join(', '));
  process.exit(1);
}
const reste = [
  ['Pixel-ID', /162833051672814/],
  ['Personenname', /J(?:ö|oe)rg/],
  ['echte Pilot-ID', /LEV-20\d{2}-\d{6}/],
];
const gefunden = reste.filter(([, re]) => re.test(html)).map(([n]) => n);
if (gefunden.length) {
  console.error('ABBRUCH — noch enthalten: ' + gefunden.join(', '));
  process.exit(1);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);

console.log(`${src} → ${out}`);
console.log(`  Version:            ${version}`);
console.log(`  HTML-Kommentare:    ${kommentare} entfernt`);
console.log(`  Interne Spuren:     ${ersetzt} ersetzt`);
console.log(`  Größe:              ${(before / 1024).toFixed(0)} kB → ${(html.length / 1024).toFixed(0)} kB`);
console.log('  Alle Prüfungen bestanden.');
