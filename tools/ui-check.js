#!/usr/bin/env node
/*
 * Prüfung der Oberfläche im Browser (optionales Entwicklungswerkzeug, nicht Teil der abhängigkeitsfreien Tests).
 * Braucht Playwright mit Chromium (in Claude-Code-Cloud-Sitzungen vorinstalliert: require('playwright')).
 *
 * Geprüft wird bei 1920×1080, 2560×1440, 3840×2160 und 390×844 (Kriterien aus CLAUDE.md):
 *   - keine Konsolenfehler, kein Querscrollen der Seite, Paarungsabschnitte ohne Überlauf
 *   - kein „null“, „undefined“, „NaN“, „[object“ in Text, title oder aria-label
 *   - Paarung: Standard Min/Max (auch wenn eine alte Bewertung „mean“ gespeichert ist), Umschalten auf Fähigkeit,
 *     alle Aufklappbereiche, Diagramm-Tooltip, jede Mutter-Spalte im Detail, Hüll/Pferch, Tastatur, „Standard“
 *   - ab 1920 px passt die Matrix bei „Fähigkeit“ in ihren Container (Spalte „passend“ sichtbar)
 *
 * Aufruf:
 *   node tools/ui-check.js                                   synthetische Testdaten
 *   node tools/ui-check.js spindel.csv mutter.csv --anlauf   eigene Exporte; --anlauf schließt den frühesten Spindel-Auftrag aus
 *   … --shots VERZEICHNIS                                     Bildschirmfotos ablegen (bei echten Daten nie ins Repo!)
 * Echte Exporte nur lokal angeben, nie ins Repository kopieren.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); if (i < 0) return null; const v = args[i + 1]; args.splice(i, f === '--shots' ? 2 : 1); return v || true; };
const anlauf = !!flag('--anlauf');
const shots = flag('--shots');
const [spFile, nuFile] = args.length >= 2 ? args : [path.join(ROOT, 'testdata', 'synthetisch_spindel_P_HEAT.csv'), path.join(ROOT, 'testdata', 'synthetisch_mutter_P_TURN.csv')];
const VIEWS = [[1920, 1080], [2560, 1440], [3840, 2160], [390, 844]];
const BAD = /\b(null|undefined|NaN)\b|\[object/;

(async () => {
  const browser = await chromium.launch();
  const spText = fs.readFileSync(spFile, 'utf8'), nuText = fs.readFileSync(nuFile, 'utf8');
  if (shots) fs.mkdirSync(shots, { recursive: true });
  let problems = 0;
  for (const [w, hgt] of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    const load = () => page.evaluate(([a, b]) => { SubApp.loadText(a, 'spindel.csv'); SubApp.loadText(b, 'mutter.csv'); }, [spText, nuText]);
    await page.goto('file://' + path.join(ROOT, 'index.html'));
    await page.evaluate(() => localStorage.clear());
    if (anlauf) {
      await load();
      await page.evaluate(() => localStorage.setItem('subtracteract.spindel.excluded.v1', JSON.stringify([SubApp.states.spindel.ds.batches[0].order])));
    }
    // veraltete gespeicherte Einstellungen müssen auf den Standard zurückfallen
    await page.evaluate(() => localStorage.setItem('subtracteract.paarung.v1', JSON.stringify({ basis: 'mean', fit: 'xyz', bcdLim: 'kaputt' })));
    await page.reload();
    await load();
    await page.evaluate(() => SubApp.switchPart('paarung'));
    const openAll = () => page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
    const check = async (label) => {
      const r = await page.evaluate((bad) => {
        const re = new RegExp(bad), de = document.documentElement;
        const all = document.body.innerText + '\n' + [...document.querySelectorAll('[title],[aria-label]')].map((e) => `${e.getAttribute('title') || ''} ${e.getAttribute('aria-label') || ''}`).join('\n');
        const m = all.match(re);
        const wide = [...document.querySelectorAll('#pairSec:not([hidden]), #pairDetailSec:not([hidden])')].filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.id);
        const t = document.querySelector('#pairSec table.pm');
        return { hscroll: de.scrollWidth > de.clientWidth, bad: m ? all.slice(Math.max(0, m.index - 60), m.index + 30) : null, wide, table: t ? [t.offsetWidth, t.parentElement.clientWidth] : null,
          basis: [...document.querySelectorAll('.seg[aria-label="Bewertung"] .segb')].map((b) => `${b.textContent}=${b.getAttribute('aria-pressed')}`).join(',') };
      }, BAD.source);
      const tooWide = r.table && w >= 1920 && /Fähigkeit/.test(label) && r.table[0] > r.table[1] + 1;
      const bad = r.hscroll || r.bad || r.wide.length || tooWide;
      if (bad) problems++;
      console.log(`${w}x${hgt} ${label.padEnd(30)} ${bad ? 'PROBLEM' : 'ok'}${r.hscroll ? ' Querscrollen' : ''}${r.wide.length ? ' Überlauf:' + r.wide.join(',') : ''}${tooWide ? ` Matrix ${r.table[0]} > ${r.table[1]} px` : ''}${r.bad ? ` Text: …${r.bad.replace(/\n/g, '⏎')}…` : ''}`);
      return r;
    };
    const r0 = await check('Start (Min/Max)');
    if (!/Min\/Max Einzelwerte=true/.test(r0.basis)) { problems++; console.log('  PROBLEM: Standard ist nicht Min/Max:', r0.basis); }
    await page.click('.seg[aria-label="Bewertung"] .segb:has-text("Fähigkeit")');
    await check('Fähigkeit Gauss');
    await openAll();
    await check('Fähigkeit, alles aufgeklappt');
    if (shots) await page.screenshot({ path: path.join(shots, `paarung_${w}.png`) });
    const chart = await page.$('#pairDetailSec svg.chart');
    if (chart) {
      await chart.scrollIntoViewIfNeeded();
      const bb = await chart.boundingBox();
      await page.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
      const tip = await page.evaluate(() => { const t = document.getElementById('tip'); return t.hidden ? '' : t.innerText; });
      if (!tip || BAD.test(tip)) { problems++; console.log('  PROBLEM Diagramm-Tooltip:', JSON.stringify(tip)); }
    }
    const nCols = await page.$$eval('#pairSec table.pm tbody tr:first-child td.cell', (l) => l.length);
    for (let i = 0; i < nCols; i++) await page.click(`#pairSec table.pm tbody tr:nth-child(${1 + (i % 3)}) td.cell >> nth=${i}`);
    await openAll();
    await check('Fähigkeit, Spalten durchgeklickt');
    for (const fit of ['Hüll', 'Pferch']) {
      await page.click(`.seg[aria-label="Auswertung"] .segb:has-text("${fit}")`);
      await openAll();
      await check('Fähigkeit ' + fit);
    }
    await page.focus('#pairSec td.cell >> nth=2');
    await page.keyboard.press('Enter');
    await page.click('.seg[aria-label="Bewertung"] .segb:has-text("Min/Max")');
    await check('zurück auf Min/Max');
    await page.click('button:has-text("Standard") >> nth=0');
    await check('Standard');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('subtracteract.paarung.v1')).basis);
    if (stored !== 'minmax') { problems++; console.log('  PROBLEM gespeicherte Bewertung:', stored); }
    for (const part of ['spindel', 'mutter']) {
      await page.evaluate((p) => SubApp.switchPart(p), part);
      const r = await page.evaluate((bad) => ({ hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth, bad: new RegExp(bad).test(document.body.innerText) }), BAD.source);
      if (r.hscroll || r.bad) { problems++; console.log(`  PROBLEM Reiter ${part}:`, JSON.stringify(r)); }
    }
    if (errs.length) { problems++; console.log('  KONSOLE:', errs.slice(0, 5).join(' | ')); }
    await ctx.close();
  }
  await browser.close();
  console.log(problems ? `${problems} Problem(e)` : 'alles ok');
  process.exit(problems ? 1 : 0);
})();
