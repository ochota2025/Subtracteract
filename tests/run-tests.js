#!/usr/bin/env node
/*
 * Tests für den Einlese- und Auswertungskern (<script id="core"> in index.html).
 * Keine Abhängigkeiten:  node tests/run-tests.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) throw new Error('Kern-Skript in index.html nicht gefunden');
const ctx = { TextDecoder, Uint8Array, Intl, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(m[1], ctx);
const C = ctx.SubCore;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + (e && e.message)); }
}
// Arrays aus dem VM-Kontext haben einen anderen Prototyp → über JSON vergleichen
const same = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 1e-9), `${msg || ''} erwartet ${b}, erhalten ${a}`);

const SYN = fs.readFileSync(path.join(ROOT, 'testdata', 'synthetisch_spindel_P_HEAT.csv'));
const SYN_NUT = fs.readFileSync(path.join(ROOT, 'testdata', 'synthetisch_mutter_P_TURN.csv'));

console.log('Grundfunktionen');
test('CSV: Anführungszeichen, "" und Zeilenumbruch im Feld, CRLF', () => {
  const { rows, lines } = C.parseCSV('a;"b;1";"x""y"\r\n"mehr\nzeilig";2;3\r\n', ';');
  same(rows, [['a', 'b;1', 'x"y'], ['mehr\nzeilig', '2', '3']]);
  same(lines, [1, 2]);
});
test('Trennzeichen erkennen', () => {
  assert.strictEqual(C.detectDelimiter('"a";"b";"c"\n1;2;3'), ';');
  assert.strictEqual(C.detectDelimiter('a,b,c\n'), ',');
  assert.strictEqual(C.detectDelimiter('a\tb\tc'), '\t');
  assert.strictEqual(C.detectDelimiter('"x;y",b,c'), ',');
});
test('R-Umlaut-Escapes zurückwandeln', () => {
  assert.strictEqual(C.decodeR('R<U+00E4>ndel-<U+00F8> f<U+00FC>r'), 'Rändel-ø für');
});
test('Zahlen: NA, Dezimalpunkt, Dezimalkomma, ungültig', () => {
  assert.strictEqual(C.parseNum('NA'), null);
  assert.strictEqual(C.parseNum(''), null);
  assert.strictEqual(C.parseNum('16.505'), 16.505);
  assert.strictEqual(C.parseNum('16,505'), 16.505);
  assert.strictEqual(C.parseNum('-0.5'), -0.5);
  assert.ok(Number.isNaN(C.parseNum('abc')));
  assert.strictEqual(C.decimalsOf('16.5'), 1);
  assert.strictEqual(C.decimalsOf('0.015'), 3);
});
test('Zeitstempel ISO und deutsch', () => {
  assert.strictEqual(C.parseTs('2026-10-25 03:00:00'), Date.UTC(2026, 9, 25, 3, 0, 0));
  assert.strictEqual(C.parseTs('25.10.2026 03:00'), Date.UTC(2026, 9, 25, 3, 0, 0));
  assert.strictEqual(C.parseTs('kein Datum'), null);
});
test('doppelt kodierte Umlaute reparieren, sonst nichts anfassen', () => {
  assert.strictEqual(C.fixMojibake('ErststÃ¼ckprÃ¼fung'), 'Erststückprüfung');
  assert.strictEqual(C.fixMojibake('Erststückprüfung'), 'Erststückprüfung');
  assert.strictEqual(C.fixMojibake('Rändel-ø'), 'Rändel-ø');
  assert.strictEqual(C.fixMojibake('Winkel 82° Nut'), 'Winkel 82° Nut');
});
test('Kodierung: UTF-8, sonst Windows-1252', () => {
  assert.strictEqual(C.decodeBytes(Buffer.from('Härte', 'utf8')).encoding, 'UTF-8');
  const latin = C.decodeBytes(Uint8Array.from([0x48, 0xe4, 0x72, 0x74, 0x65]));
  assert.strictEqual(latin.encoding, 'Windows-1252');
  assert.strictEqual(latin.text, 'Härte');
  assert.strictEqual(C.decodeBytes(Buffer.from('﻿abc', 'utf8')).text, 'abc');
});

console.log('Merkmalszuordnung');
const cls = (charText, position, remark) => C.classify({ charText, position, remark });
test('BCD Gauss/Hüll/Pferch über Position', () => {
  assert.deepStrictEqual(pick(cls('diameter', '432.02.GG', 'BCD GG Gang 2'), ['group', 'fit', 'gang']), { group: 'bcd', fit: 'gauss', gang: 2 });
  assert.deepStrictEqual(pick(cls('diameter', '463.17.GN', ''), ['fit', 'gang']), { fit: 'huell', gang: 17 });
  assert.deepStrictEqual(pick(cls('diameter', '463.17.GX', ''), ['fit', 'gang']), { fit: 'pferch', gang: 17 });
});
test('falscher Prüfplantext wird erkannt, Position gewinnt', () => {
  const c = cls('diameter', '432.14.GN', 'BCD GG Gang 14');
  assert.strictEqual(c.fit, 'huell');
  assert.ok(c.note, 'Hinweis erwartet');
  assert.ok(!cls('diameter', '432.14.GG', 'BCD GG Gang 14').note);
});
test('Steigungsfenster aus Prüfplantext', () => {
  const c = cls('length', '404.5', 'Steigung G5-G11');
  assert.deepStrictEqual(pick(c, ['group', 'from', 'to', 'turns']), { group: 'lead', from: 5, to: 11, turns: 6 });
  assert.ok(!c.note);
  assert.strictEqual(cls('length', '404.1', 'irgendwas').group, 'shaft');
});
test('Zylindrizität je Gang und gesamt (Text wird ignoriert)', () => {
  assert.strictEqual(cls('cylindricity', '449.09', 'Zyl Einzelgang 9').gang, 9);
  const t = cls('cylindricity', '448', 'Summenplanlauf zu Gewinde A-B');
  assert.strictEqual(t.group, 'cyl');
  assert.strictEqual(t.gang, null);
});
test('Rändel/Lage und Wärmebehandlung', () => {
  assert.strictEqual(cls('roundness', '401', '').group, 'shaft');
  assert.strictEqual(cls('surface hardness', 'SH1', '').group, 'heat');
  assert.strictEqual(cls('case hardness depth', 'CHD1', '').label, 'Einsatzhärtetiefe');
});
function pick(o, keys) { const r = {}; for (const k of keys) r[k] = o[k]; return r; }

console.log('Synthetischer Export');
const syn = C.decodeBytes(SYN);
const file = C.parseCAQ(syn.text, 'synthetisch.csv');
const model = C.buildModel([file]);
const ds = model.datasets[0];
const issues = [...file.issues.list(), ...model.issues.list(), ...ds.issues.list()];
test('Datei gelesen, kein Abbruch', () => {
  assert.strictEqual(file.fatal, null);
  assert.strictEqual(file.delimiter, ';');
  assert.strictEqual(syn.encoding, 'ASCII');
  assert.strictEqual(file.records.length, 3767);
});
test('ein Datensatz, 10 Fertigungsaufträge, 39 Merkmale', () => {
  assert.strictEqual(model.datasets.length, 1);
  assert.strictEqual(ds.material, '9990001');
  assert.strictEqual(ds.process, '0100/P_HEAT');
  assert.strictEqual(ds.batches.length, 10);
  assert.strictEqual(ds.chars.length, 39);
});
test('Zuordnung: 9 Gauss, 5 Hüll, 5 Pferch, 3 Steigung, 10 Zylindrizität', () => {
  const n = {};
  for (const c of ds.chars) n[c.cls.sub] = (n[c.cls.sub] || 0) + 1;
  assert.strictEqual(n['bcd-gauss'], 9);
  assert.strictEqual(n['bcd-huell'], 5);
  assert.strictEqual(n['bcd-pferch'], 5);
  assert.strictEqual(n.lead, 3);
  assert.strictEqual(n.cyl, 10);
  assert.strictEqual(n.shaft, 5);
  assert.strictEqual(n.heat, 2);
});
test('Umlaute im Prüfplantext dekodiert', () => {
  assert.strictEqual(ds.charMap.get('400').remark, 'Rändel-ø');
});
test('Einseitige Toleranz: UGW fehlt', () => {
  const c = ds.charMap.get('448');
  assert.strictEqual(c.lsl, null);
  assert.strictEqual(c.usl, 0.03);
});
test('Hinweise: Textabweichung (4×), Handeintrag, keine Warnungen', () => {
  const mm = issues.find((i) => i.code === 'remark-mismatch');
  assert.ok(mm, 'remark-mismatch fehlt');
  assert.strictEqual(mm.count, 4);
  assert.ok(issues.find((i) => i.code === 'manual'));
  same(issues.filter((i) => i.level !== 'info').map((i) => i.code), []);
});
test('Aufträge chronologisch, Charge zugeordnet', () => {
  const firsts = ds.batches.map((b) => b.first);
  same(firsts, [...firsts].sort((a, b) => a - b));
  assert.strictEqual(ds.batches[0].order, '90010001');
  assert.strictEqual(ds.batches[0].batchNo, '7100201');
});

console.log('Charakterisierung');
const all = new Set(ds.batches.map((b) => b.order));
const res = C.characterize(ds, all);
test('Kennwerte je Auftrag stimmen mit Rohdaten überein', () => {
  const recs = ds.records.filter((r) => r.order === '90010001' && r.position === '404.5');
  const v = recs.map((r) => r.value);
  const mu = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / (v.length - 1));
  const st = res.units.get('90010001').chars.get('404.5');
  assert.strictEqual(st.n, 10);
  near(st.mean, mu, 1e-12, 'Mittelwert');
  near(st.sd, sd, 1e-12, 's');
  assert.strictEqual(st.min, Math.min(...v));
});
test('gepoolt = alle Werte der einbezogenen Aufträge', () => {
  assert.strictEqual(res.pooled.chars.get('432.02.GG').n, 100);
  assert.strictEqual(res.nIncluded, 10);
});
test('Steckbrief: BCD-Profil, Steigung je Gang', () => {
  const sm = res.pooled.summary;
  same(sm.bcd.profile.map((g) => g.gang), [1, 2, 3, 8, 9, 14, 15, 16, 17]);
  assert.strictEqual(sm.bcd.formN, 5);
  assert.ok(sm.bcd.formMean > 0.008 && sm.bcd.formMean < 0.02, 'Hüll − Pferch plausibel');
  assert.strictEqual(sm.lead.windows.length, 3);
  near(sm.lead.windows[0].pitch, sm.lead.windows[0].stats.mean / 6, 1e-12);
  near(sm.lead.nominalPitch, 2.9, 1e-12);
  assert.ok(Math.abs(sm.lead.pitchMean - 2.9) < 0.002);
});
test('Außerhalb Toleranz je Messwert gezählt', () => {
  let n = 0;
  for (const r of ds.records) if ((r.lsl != null && r.value < r.lsl - 1e-9) || (r.usl != null && r.value > r.usl + 1e-9)) n++;
  assert.strictEqual(res.pooled.summary.oot, n);
  assert.ok(n > 0, 'synthetische Daten enthalten bewusst Ausreißer');
});
test('Auftrag ausschließen wirkt nur auf gepoolt', () => {
  const inc = new Set(all); inc.delete('90010029');
  const r2 = C.characterize(ds, inc);
  assert.strictEqual(r2.nIncluded, 9);
  assert.strictEqual(r2.pooled.chars.get('432.02.GG').n, 90);
  assert.strictEqual(r2.units.get('90010029').included, false);
  assert.strictEqual(r2.units.get('90010029').chars.get('432.02.GG').n, 10);
});

console.log('Robustheit');
test('dieselben Daten zweimal (andere Datei) → Dubletten entfernt', () => {
  const f2 = C.parseCAQ(syn.text, 'kopie.csv');
  const m2 = C.buildModel([file, f2]);
  assert.strictEqual(m2.records.length, 3767);
  assert.strictEqual(m2.issues.list().find((i) => i.code === 'dup').count, 3767);
});
test('in Excel gespeichert: Dezimalkomma auch in Positionen, ohne Anführungszeichen, CRLF → Warnung, gleiche Werte', () => {
  const lines = syn.text.trim().split('\n');
  const conv = lines.map((l, i) => {
    const cells = C.parseCSV(l, ';').rows[0];
    return cells.map((c) => (i > 0 && /^-?\d+\.\d+$/.test(c) ? c.replace('.', ',') : c)).join(';');
  }).join('\r\n');
  const f = C.parseCAQ(conv, 'excel.csv');
  assert.strictEqual(f.fatal, null);
  assert.strictEqual(f.records.length, 3767);
  assert.ok(f.issues.list().find((i) => i.code === 'excel-pos'), 'Excel-Warnung erwartet');
  const ds2 = C.buildModel([f]).datasets[0];
  assert.strictEqual(ds2.chars.length, 39);
  near(ds2.charMap.get('432.02.GG').usl, 16.52, 1e-12);
  const r2 = C.characterize(ds2, new Set(ds2.batches.map((b) => b.order)));
  near(r2.pooled.chars.get('404.1').mean, res.pooled.chars.get('404.1').mean, 1e-12);
});
test('fehlende Pflichtspalte → klarer Abbruch', () => {
  const f = C.parseCAQ('"strSAPOrder";"value"\n"1";2\n', 'falsch.csv');
  assert.ok(/Pflichtspalten fehlen/.test(f.fatal));
});
test('nicht numerischer Messwert → übersprungen mit Warnung', () => {
  const lines = syn.text.split('\n');
  const head = C.parseCSV(lines[0], ';').rows[0];
  const vi = head.indexOf('value');
  const cells = C.parseCSV(lines[5], ';').rows[0];
  cells[vi] = 'x.y';
  lines[5] = cells.join(';');
  const f = C.parseCAQ(lines.join('\n'), 'kaputt.csv');
  assert.strictEqual(f.records.length, 3766);
  assert.ok(f.issues.list().find((i) => i.code === 'value-nan'));
});
test('Teiletyp: Spindel erkannt (auch wenn der Materialtext „Mutter“ sagt, zählen die Merkmale)', () => {
  assert.strictEqual(file.partType, 'spindel');
  assert.strictEqual(ds.partType, 'spindel');
  const t = syn.text.replace(/Bauteil Spindel Beispiel - synthetisch/g, 'Bauteil Mutter Beispiel');
  assert.strictEqual(C.parseCAQ(t, 'x.csv').partType, 'spindel');
});
test('Härteproben-ID („90010001_1“) ist keine Teile-UUID → keine Teile-Dubletten', () => {
  assert.ok(!issues.find((i) => i.code === 'dup-uuid' || i.code === 'uuid-conflict'));
  assert.strictEqual(ds.batches[0].nParts, null);
});
test('Export: Semikolon, Dezimalkomma, gepoolt + je Auftrag', () => {
  const csv = C.exportCSV(ds, res);
  const rows = csv.trim().split('\r\n');
  assert.strictEqual(rows.length, 1 + 39 * 11);
  assert.ok(rows[0].startsWith('Teil;Material;Prozess;'));
  assert.ok(rows[1].startsWith('Spindel;9990001;0100/P_HEAT;gepoolt (10 Aufträge)'));
  assert.ok(/;16,5[0-9]*;/.test(rows.find((r) => r.includes(';432.02.GG;'))));
});

console.log('Synthetischer Mutter-Export');
const nutText = C.decodeBytes(SYN_NUT).text;
const nf = C.parseCAQ(nutText, 'mutter.csv');
const nm = C.buildModel([nf], 'mutter');
const nds = nm.datasets[0];
const nIssues = [...nf.issues.list(), ...nm.issues.list(), ...nds.issues.list()];
const nres = C.characterize(nds, new Set(nds.batches.map((b) => b.order)));
test('als Mutter erkannt (Materialtext ist nur die Nummer)', () => {
  assert.strictEqual(nf.fatal, null);
  assert.strictEqual(nds.materialText, '9990002');
  assert.strictEqual(nf.partType, 'mutter');
  assert.strictEqual(nds.partType, 'mutter');
  assert.strictEqual(nds.chars.length, 45);
});
test('Mutter-Datei im Reiter Spindel → Fehlerhinweis', () => {
  const ds3 = C.buildModel([nf], 'spindel').datasets[0];
  assert.strictEqual(ds3.partType, 'mutter');
  assert.ok(ds3.issues.list().find((i) => i.code === 'wrong-type' && i.level === 'error'));
});
test('BCD je Kugelrille + Zylinder, Gauss/Hüll/Pferch', () => {
  const n = {};
  for (const c of nds.chars) n[c.cls.sub] = (n[c.cls.sub] || 0) + 1;
  same([n['bcd-gauss'], n['bcd-huell'], n['bcd-pferch'], n.bcdx, n.lead, n.cyl], [5, 5, 5, 4, 3, 6]);
  const c = nds.charMap.get('713.3.GN');
  same([c.cls.fit, c.cls.kr, c.cls.gang], ['huell', 3, 6]);
  assert.ok(nds.charMap.get('713.GX').cls.overall);
});
test('Durchmesser mit .GG ohne „BCD“ sind kein BCD (Außen-ø, Kern-ø, Lagersitz)', () => {
  for (const pos of ['707.GG', '707.1.GG', '751.GG', '751.3.GG', '769.GG']) assert.strictEqual(nds.charMap.get(pos).cls.group, 'dia', pos);
});
test('BCD-Kennzahlen: Range und Kopie „wie 713.1.GG“ nicht im Profil', () => {
  for (const pos of ['842', '842.GG', '892.GG', '884']) assert.strictEqual(nds.charMap.get(pos).cls.group, 'bcdx', pos);
  assert.strictEqual(nds.charMap.get('884').cls.copyOf, '713.1.GG');
});
test('Steigungsfenster KR1–KR4 = 6 Gänge, Einzelgänge = 1; KR-Lage abgeleitet', () => {
  same(['748', '748.1', '748.2'].map((p) => nds.charMap.get(p).cls.turns), [6, 1, 1]);
  assert.ok(nds.krGeometryDerived);
  same([...nds.krAt].sort((a, b) => a[0] - b[0]), [[1, 1], [2, 2], [3, 6], [4, 7]]);
  same([nds.charMap.get('748').cls.from, nds.charMap.get('748').cls.to], [1, 7]);
});
test('Zylindrizität Gewinde je KR, Außen-ø als Form', () => {
  assert.strictEqual(nds.charMap.get('792.2').cls.kr, 2);
  assert.strictEqual(nds.charMap.get('793').cls.group, 'cyl');
  assert.strictEqual(nds.charMap.get('743').cls.group, 'form');
});
test('Re-Importe: gleiche UUID + alle Werte gleich → Messung einmal gezählt', () => {
  const parts = Object.fromEntries(nds.batches.map((b) => [b.order, b.nParts]));
  same([parts['90020011'], parts['90020017'], parts['90020023']], [10, 1, 10]);
  assert.strictEqual(nm.records.length, 81 * 45);
  const d = nIssues.find((i) => i.code === 'dup-uuid');
  assert.strictEqual(d.count, 10);
  assert.strictEqual(nres.pooled.chars.get('713.GG').n, 81);
});
test('Teile in zwei Aufträgen sind nicht zuordenbar → ganz verworfen (Vorgabe)', () => {
  const x = nIssues.find((i) => i.code === 'dup-cross-order');
  assert.ok(x && /5 Teil\(e\) in 90020014 \/ 90020017/.test(x.examples[0]));
  assert.ok(!nds.batches.some((b) => b.order === '90020014'), 'Auftrag ohne verbleibende Teile entfällt');
  assert.ok(nIssues.find((i) => i.code === 'order-empty' && /90020014/.test(i.examples[0])));
  assert.ok(nIssues.find((i) => i.code === 'few-parts'));
});
test('Umlaute repariert, Probe-Bemerkung lesbar', () => {
  assert.ok(nIssues.find((i) => i.code === 'mojibake'));
  assert.ok(nm.records.every((r) => !/Ã/.test(r.sampleRemark)));
});
test('Steckbrief Mutter: Zylinder-Gauss, Steigung aus 6-Gang-Fenster', () => {
  const sm = nres.pooled.summary;
  near(sm.bcd.gaussMean, nres.pooled.chars.get('713.GG').mean, 1e-12);
  assert.strictEqual(sm.bcd.nominal, 16.55);
  same(sm.bcd.profile.map((g) => g.kr), [1, 2, 3, 4]);
  assert.strictEqual(sm.lead.mainTurns, 6);
  near(sm.lead.pitchMean, nres.pooled.chars.get('748').mean / 6, 1e-12);
  assert.strictEqual(sm.lead.spread, null);
  assert.ok(sm.bcd.formOverall > sm.bcd.formMean, 'Hüll − Pferch des Zylinders ≥ Mittel je KR');
  assert.ok(sm.ootThread > 0 && sm.ootThread < sm.oot);
});
test('Merkmal mit allen Werten außerhalb → Warnung', () => {
  const x = nIssues.find((i) => i.code === 'sys-out');
  assert.ok(/842/.test(x.examples[0]) && /1137/.test(x.examples[0]));
});
test('Export Mutter: Lage als KR', () => {
  const rows = C.exportCSV(nds, nres).trim().split('\r\n');
  assert.ok(rows[1].startsWith('Mutter;9990002;0200/P_TURN;'));
  assert.ok(rows.some((r) => r.includes(';713.2.GG;') && r.includes(';KR2;')));
  assert.ok(rows.some((r) => r.includes(';748;') && r.includes(';KR1-KR4;')));
});

console.log('Review-Funde (Regressionstests)');
const nutLines = nutText.trim().split('\n');
const NH = C.parseCSV(nutLines[0], ';').rows[0];
const col = (n) => NH.indexOf(n);
const cellsOf = (l) => C.parseCSV(l, ';').rows[0];
function rebuildNut(fn) { // Zeilen der Mutter-Datei gezielt verändern
  const out = [nutLines[0]];
  for (let i = 1; i < nutLines.length; i++) { const c = cellsOf(nutLines[i]); const r = fn(c, i); if (r === null) continue; out.push((r || c).map((v) => (v === 'NA' || /^-?[\d.]+(e-?\d+)?$/i.test(v) || /^\d{4}-\d\d-\d\d /.test(v) || v === 'TRUE' ? v : `"${v.replace(/"/g, '""')}"`)).join(';')); }
  return out.join('\n');
}
test('Umlaut-Reparatur lässt korrekte Texte wie „Ø±0,01“ in Ruhe', () => {
  assert.strictEqual(C.fixMojibake('Aussen-Ø±0,01'), 'Aussen-Ø±0,01');
  assert.strictEqual(C.fixMojibake('Winkel 20°±0,4'), 'Winkel 20°±0,4');
  assert.strictEqual(C.fixMojibake('Â°'), '°');
});
test('Dezimalkomma mit Exponent („-8,7E-05“)', () => {
  near(C.parseNum('-8,7E-05'), -8.7e-5, 1e-15);
  near(C.parseNum('1,5e3'), 1500, 1e-9);
});
test('„NA“ in Auftrag/Charge/Bemerkung ist leer; Auftrag fällt auf strInspectionOrder zurück', () => {
  const t = rebuildNut((c, i) => { if (i < 50) { c[col('strSAPOrder')] = 'NA'; c[col('strBatchNo')] = 'NA'; } return c; });
  const f = C.parseCAQ(t, 'na.csv');
  const r = f.records.find((x) => x.line < 50);
  assert.strictEqual(r.order, r.inspOrder.split('/')[0].trim());
  assert.strictEqual(r.batch, '');
});
test('Spindel- und Mutter-Zeilen in einer Datei → je Typ aufgeteilt', () => {
  const spl = syn.text.trim().split('\n');
  const mixed = [spl[0], ...spl.slice(1), ...nutLines.slice(1)].join('\n');
  const parts = C.splitByPartType(C.parseCAQ(mixed, 'gemischt.csv'));
  same(parts.map((x) => x.partType).sort(), ['mutter', 'spindel']);
  assert.ok(parts.every((x) => /gemischt\.csv \((Spindel|Mutter)-Teil\)/.test(x.fileName)));
  same(parts.map((x) => x.records.length).sort((a, b) => a - b), [3767, 4545].sort((a, b) => a - b));
});
test('Mutter nur mit dem 6-Gang-Fenster → Gangzahl unbekannt, keine falsche Steigung', () => {
  const t = rebuildNut((c) => (['748.1', '748.2'].includes(c[col('strPosition')]) ? null : c));
  const m2 = C.buildModel([C.parseCAQ(t, 'nur748.csv')], 'mutter');
  const d2 = m2.datasets[0];
  assert.ok(d2.issues.list().find((i) => i.code === 'lead-turns-unknown'));
  const r2 = C.characterize(d2, new Set(d2.batches.map((b) => b.order)));
  assert.strictEqual(r2.pooled.summary.lead.pitchMean, null);
});
test('Steigungsfenster ohne Nennmaß → Warnung', () => {
  const t = rebuildNut((c) => { if (c[col('strPosition')] === '748.2') c[col('decNominal')] = 'NA'; return c; });
  const d2 = C.buildModel([C.parseCAQ(t, 'nom.csv')], 'mutter').datasets[0];
  assert.ok(d2.issues.list().find((i) => i.code === 'lead-no-nominal' && /748\.2/.test(i.examples[0])));
});
test('Nachmessung (gleiche UUID, andere Werte) bleibt, Datei doppelt geladen zählt nicht doppelt', () => {
  // Re-Import einer Stichprobe mit geänderten Werten = Nachmessung
  let k = 0;
  const t = rebuildNut((c) => c);
  const lines = t.split('\n');
  const extra = [];
  for (let i = 1; i < lines.length; i++) {
    const c = cellsOf(lines[i]);
    if (c[col('strSAPOrder')] === '90020020' && c[col('intSampleNo')] === '1') {
      c[col('intSampleNo')] = '21'; c[col('intSample')] = '21'; c[col('datInspUTC')] = '2026-10-30 10:00:00';
      c[col('value')] = String(Number(c[col('value')]) + 0.0005); k++;
      extra.push(c.map((v) => (v === 'NA' || /^-?[\d.]+(e-?\d+)?$/i.test(v) || /^\d{4}-\d\d-\d\d /.test(v) || v === 'TRUE' ? v : `"${v}"`)).join(';'));
    }
  }
  assert.strictEqual(k, 45, 'Testaufbau: eine nachgemessene Stichprobe mit 45 Werten');
  const t2 = [...lines, ...extra].join('\n');
  const f1 = C.parseCAQ(t2, 'a.csv'), f2 = C.parseCAQ(t2, 'b.csv');
  const mA = C.buildModel([f1], 'mutter'), mB = C.buildModel([f1, f2], 'mutter');
  assert.strictEqual(mA.records.length, 81 * 45 + k);
  assert.strictEqual(mB.records.length, mA.records.length, 'zweite Kopie der Datei darf nichts hinzufügen');
  assert.ok(mA.datasets[0].issues.list().find((i) => i.code === 'uuid-remeasure') || mA.issues.list().find((i) => i.code === 'uuid-remeasure'));
  assert.ok(mB.issues.list().find((i) => i.code === 'dup'));
});
test('Überlappende Exporte: keine falsche Meldung „verworfen“, gleiche Werte', () => {
  const half = Math.floor(nutLines.length * 0.6);
  const a = [nutLines[0], ...nutLines.slice(1, half)].join('\n');
  const b = [nutLines[0], ...nutLines.slice(Math.floor(nutLines.length * 0.4))].join('\n');
  const mm = C.buildModel([C.parseCAQ(a, 'a.csv'), C.parseCAQ(b, 'b.csv')], 'mutter');
  assert.strictEqual(mm.records.length, 81 * 45);
  assert.strictEqual(mm.issues.list().find((i) => i.code === 'dup-uuid').count, 10);
});
test('Zylinder-Gauss nur, wenn in allen Aufträgen gemessen', () => {
  const t = rebuildNut((c) => (c[col('strPosition')] === '713.GG' && c[col('strSAPOrder')] !== '90020020' ? null : c));
  const d2 = C.buildModel([C.parseCAQ(t, 'zyl.csv')], 'mutter').datasets[0];
  const r2 = C.characterize(d2, new Set(d2.batches.map((b) => b.order)));
  assert.strictEqual(r2.pooled.summary.bcd.gaussFromOverall, false);
  assert.strictEqual(r2.pooled.summary.bcd.gaussN, 81 * 4);
});
test('Mutter ohne KR-Texte wird an „BCD Zylinder“/„BCD Range“ erkannt', () => {
  const t = rebuildNut((c) => (/KR/.test(c[col('strRemark')]) ? null : c));
  assert.strictEqual(C.parseCAQ(t, 'ohneKR.csv').partType, 'mutter');
});

console.log('Paarung');
const spPair = { ds, res: C.characterize(ds, new Set(ds.batches.map((b) => b.order))) };
const nuPair = { ds: nds, res: nres };
test('Sichtbarkeit (Vorgabe): Gang 1 → KR1, Gang 3 → KR1–3, Gang 16 → KR3–4, Gang 17 → KR4', () => {
  const g = C.pairingGeometry(ds, nds, C.PAIR_DEFAULTS);
  const v = Object.fromEntries(g.visibility.map((x) => [x.gang, x.krs]));
  same([v[1], v[2], v[3], v[8], v[14], v[15], v[16], v[17]], [[1], [1, 2], [1, 2, 3], [1, 2, 3, 4], [1, 2, 3, 4], [2, 3, 4], [3, 4], [4]]);
  same([g.strokeFrom, g.strokeTo], [1, 14]);
  same(g.leadPairs.map((lp) => [lp.nut.position, lp.sp.map((x) => x.position)]), [['748', ['404.1', '404.5', '404.9']], ['748.1', []], ['748.2', []]]);
});
test('Sichtbarkeit einstellbar: KR-Versatz laut Prüfplan (0,1,5,6) und Hub', () => {
  const g = C.pairingGeometry(ds, nds, Object.assign({}, C.PAIR_DEFAULTS, { krOffset: { 1: 0, 2: 1, 3: 5, 4: 6 } }));
  same(g.visibility.find((x) => x.gang === 3).krs, [1, 2]);
  same([g.strokeFrom, g.strokeTo], [1, 11]);
  const g2 = C.pairingGeometry(ds, nds, Object.assign({}, C.PAIR_DEFAULTS, { strokeFrom: 5, strokeTo: 9 }));
  same(g2.visibility.find((x) => x.gang === 3).krs, []);
});
test('Matrix: Δ = Mutter − Spindel aus Min/Max der Einzelwerte, je sichtbarem Paar', () => {
  const pm = C.pairing(spPair, nuPair, C.PAIR_DEFAULTS);
  same([pm.spU.length, pm.nuU.length, pm.cells.size], [10, 9, 90]);
  const us = pm.spU[0], un = pm.nuU[0];
  const cell = pm.cells.get(us.id + '|' + un.id);
  const sG = us.chars.get('463.17.GG'), nG = un.chars.get('713.4.GG');
  const it = cell.bcd.items.find((x) => x.gang === 17 && x.kr === 4);
  near(it.lo, (nG.min - sG.max) * 1000, 1e-9);
  near(it.hi, (nG.max - sG.min) * 1000, 1e-9);
  assert.ok(!cell.bcd.items.some((x) => x.gang === 17 && x.kr !== 4), 'Gang 17 sieht nur KR4');
  near(cell.bcd.lo, Math.min(...cell.bcd.items.map((x) => x.lo)), 1e-12);
  const L = cell.lead.items.find((x) => x.spChar.position === '404.5');
  near(L.lo, (un.chars.get('748').min - us.chars.get('404.5').max) * 1000, 1e-9);
  assert.strictEqual(cell.lead.items.length, 3);
});
test('Mittelwerte statt Min/Max; Hüll/Pferch nur an Gängen mit Hüll/Pferch', () => {
  const pm = C.pairing(spPair, nuPair, Object.assign({}, C.PAIR_DEFAULTS, { basis: 'mean' }));
  const c = pm.cells.values().next().value;
  assert.ok(c.bcd.items.every((x) => x.lo === x.hi));
  const ph = C.pairing(spPair, nuPair, Object.assign({}, C.PAIR_DEFAULTS, { fit: 'huell' }));
  same([...new Set(ph.cells.values().next().value.bcd.items.map((x) => x.gang))], [2, 9, 14, 16, 17]);
});
test('Status: außerhalb / knapp / in Grenzen nach Reserve', () => {
  const pm = C.pairing(spPair, nuPair, Object.assign({}, C.PAIR_DEFAULTS, { bcdLim: [40, 60], warnReserve: 2 }));
  const c = pm.cells.values().next().value;
  assert.strictEqual(c.bcd.status, 'out');
  assert.ok(c.bcd.reserve < 0 && c.bcd.nOut > 0);
  const ok = C.pairing(spPair, nuPair, Object.assign({}, C.PAIR_DEFAULTS, { bcdLim: [-1000, 1000], leadLim: [-1000, 1000] }));
  assert.ok([...ok.cells.values()].every((x) => x.status === 'ok'));
  assert.strictEqual(ok.counts.bothOk, 90);
});
test('Ausgeschlossene Aufträge fehlen in der Matrix', () => {
  const inc = new Set(ds.batches.map((b) => b.order)); inc.delete('90010001');
  const pm = C.pairing({ ds, res: C.characterize(ds, inc) }, nuPair, C.PAIR_DEFAULTS);
  assert.strictEqual(pm.spU.length, 9);
});
test('Matrix-Export: eine Zeile je Paar', () => {
  const pm = C.pairing(spPair, nuPair, C.PAIR_DEFAULTS);
  const rows = C.exportPairingCSV(pm, ds, nds).trim().split('\r\n');
  assert.strictEqual(rows.length, 1 + 90);
  assert.ok(rows[0].startsWith('Spindel_Material;Spindel_Auftrag;'));
  assert.ok(/;Gauss;Min\/Max Einzelwerte;15;85;/.test(rows[1]));
});

// Optional: echte Exporte lokal mitprüfen (werden nie ins Repository übernommen)
for (const [env, type, nBcd] of [['CAQ_REAL', 'spindel', 19], ['CAQ_REAL_NUT', 'mutter', 15]]) {
  const REAL = process.env[env];
  if (!REAL) continue;
  console.log(`Echter Export ${type} (lokal, nicht im Repo): ` + path.basename(REAL));
  const t = C.decodeBytes(fs.readFileSync(REAL));
  const f = C.parseCAQ(t.text, path.basename(REAL));
  const mm = C.buildModel([f], type);
  const d = mm.datasets[0];
  test(`echter ${type}-Export lesbar und richtig erkannt`, () => {
    assert.strictEqual(f.fatal, null);
    assert.strictEqual(d.partType, type);
    assert.strictEqual(d.detectedType, type);
    assert.strictEqual(d.chars.filter((c) => c.cls.group === 'bcd').length, nBcd);
    assert.strictEqual(d.chars.filter((c) => c.cls.group === 'lead').length, 3);
    console.log(`      ${f.records.length} Werte → ${mm.records.length} nach Dubletten · ${d.batches.length} Aufträge · ${d.chars.length} Merkmale`);
    for (const it of [...f.issues.list(), ...mm.issues.list(), ...d.issues.list()]) console.log(`      [${it.level}] ${it.msg} (${it.count}) ${it.examples.join(' · ').slice(0, 300)}`);
  });
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
process.exit(failed ? 1 : 0);
