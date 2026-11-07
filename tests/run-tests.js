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
test('ein Datensatz, 10 Fertigungsaufträge, 39 Merkmale, davon 22 BCD/Steigung ausgewertet', () => {
  assert.strictEqual(model.datasets.length, 1);
  assert.strictEqual(ds.material, '9990001');
  assert.strictEqual(ds.process, '0100/P_HEAT');
  assert.strictEqual(ds.batches.length, 10);
  assert.strictEqual(ds.allChars.length, 39);
  assert.strictEqual(ds.chars.length, 22);
  assert.strictEqual(ds.ignoredChars.length, 17);
});
test('nur BCD und Steigung werden ausgewertet (Vorgabe), alles andere ignoriert', () => {
  assert.ok(ds.chars.every((c) => c.cls.group === 'bcd' || c.cls.group === 'lead'));
  assert.ok(ds.records.every((r) => ds.charMap.has(r.position)));
  assert.strictEqual(ds.records.length, 22 * 100);
  assert.ok(!ds.charMap.has('400') && !ds.charMap.has('SH1') && !ds.charMap.has('448'));
});
test('Zuordnung: 9 Gauss, 5 Hüll, 5 Pferch, 3 Steigung, 10 Zylindrizität', () => {
  const n = {};
  for (const c of ds.allChars) n[c.cls.sub] = (n[c.cls.sub] || 0) + 1;
  assert.strictEqual(n['bcd-gauss'], 9);
  assert.strictEqual(n['bcd-huell'], 5);
  assert.strictEqual(n['bcd-pferch'], 5);
  assert.strictEqual(n.lead, 3);
  assert.strictEqual(n.cyl, 10);
  assert.strictEqual(n.shaft, 5);
  assert.strictEqual(n.heat, 2);
});
test('Umlaute im Prüfplantext dekodiert', () => {
  assert.strictEqual(ds.allCharMap.get('400').remark, 'Rändel-ø');
});
test('Einseitige Toleranz: UGW fehlt', () => {
  const c = ds.allCharMap.get('448');
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
  assert.strictEqual(ds2.chars.length, 22);
  near(ds2.charMap.get('432.02.GG').usl, 16.52, 1e-12);
  const r2 = C.characterize(ds2, new Set(ds2.batches.map((b) => b.order)));
  near(r2.pooled.chars.get('404.1').mean, res.pooled.chars.get('404.1').mean, 1e-12);
});
test('fehlende Pflichtspalte → klarer Abbruch', () => {
  const f = C.parseCAQ('"strSAPOrder";"value"\n"1";2\n', 'falsch.csv');
  assert.ok(/Pflichtspalten fehlen/.test(f.fatal));
});
test('nicht numerischer Messwert: Warnung nur bei BCD/Steigung, sonst still übersprungen', () => {
  const lines = syn.text.split('\n');
  const head = C.parseCSV(lines[0], ';').rows[0];
  const vi = head.indexOf('value'), pi = head.indexOf('strPosition');
  const iH = lines.findIndex((l, i) => i > 0 && C.parseCSV(l, ';').rows[0][pi] === 'SH1');
  const iB = lines.findIndex((l, i) => i > 0 && C.parseCSV(l, ';').rows[0][pi] === '432.02.GG');
  for (const i of [iH, iB]) { const c = C.parseCSV(lines[i], ';').rows[0]; c[vi] = 'x.y'; lines[i] = c.map((v) => (/^-?[\d.]+$|^NA$|^FALSE$|^\d{4}-/.test(v) ? v : `"${v}"`)).join(';'); }
  const f = C.parseCAQ(lines.join('\n'), 'kaputt.csv');
  assert.strictEqual(f.records.length, 3765);
  const m = C.buildModel([f]);
  const w = m.issues.list().filter((i) => i.code === 'value-nan');
  assert.strictEqual(w.length, 1);
  assert.strictEqual(w[0].count, 1);
  assert.ok(/432\.02\.GG/.test(w[0].examples[0]));
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
  assert.strictEqual(rows.length, 1 + 22 * 11);
  assert.ok(!rows.some((r) => r.includes(';SH1;') || r.includes(';448;')));
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
  assert.strictEqual(nds.allChars.length, 45);
  assert.strictEqual(nds.chars.length, 18);
});
test('Mutter-Datei im Reiter Spindel → Fehlerhinweis', () => {
  const ds3 = C.buildModel([nf], 'spindel').datasets[0];
  assert.strictEqual(ds3.partType, 'mutter');
  assert.ok(ds3.issues.list().find((i) => i.code === 'wrong-type' && i.level === 'error'));
});
test('BCD je Kugelrille + Zylinder, Gauss/Hüll/Pferch', () => {
  const n = {};
  for (const c of nds.allChars) n[c.cls.sub] = (n[c.cls.sub] || 0) + 1;
  same([n['bcd-gauss'], n['bcd-huell'], n['bcd-pferch'], n.bcdx, n.lead, n.cyl], [5, 5, 5, 4, 3, 6]);
  const c = nds.charMap.get('713.3.GN');
  same([c.cls.fit, c.cls.kr, c.cls.gang], ['huell', 3, 3]);
  assert.ok(nds.charMap.get('713.GX').cls.overall);
});
test('Durchmesser mit .GG ohne „BCD“ sind kein BCD (Außen-ø, Kern-ø, Lagersitz)', () => {
  for (const pos of ['707.GG', '707.1.GG', '751.GG', '751.3.GG', '769.GG']) { assert.strictEqual(nds.allCharMap.get(pos).cls.group, 'dia', pos); assert.ok(!nds.charMap.has(pos)); }
});
test('BCD-Kennzahlen: Range und Kopie „wie 713.1.GG“ nicht im Profil', () => {
  for (const pos of ['842', '842.GG', '892.GG', '884']) { assert.strictEqual(nds.allCharMap.get(pos).cls.group, 'bcdx', pos); assert.ok(!nds.charMap.has(pos), 'ignoriert'); }
  assert.strictEqual(nds.allCharMap.get('884').cls.copyOf, '713.1.GG');
});
test('Mutter mit 4 Gängen: KR1…KR4 = Gang 1…4, Steigungsfenster über die Nennlänge', () => {
  same([...nds.krAt].sort((a, b) => a[0] - b[0]), [[1, 1], [2, 2], [3, 3], [4, 4]]);
  assert.strictEqual(nds.krGeometryDerived, false);
  same(['748', '748.1', '748.2'].map((p) => [nds.charMap.get(p).cls.from, nds.charMap.get(p).cls.to]), [[1, 4], [1, 2], [3, 4]]);
  assert.ok(['748', '748.1', '748.2'].every((p) => !nds.charMap.get(p).cls.turns), 'keine abgeleitete Gangzahl');
});
test('Zylindrizität Gewinde je KR, Außen-ø als Form', () => {
  assert.strictEqual(nds.allCharMap.get('792.2').cls.kr, 2);
  assert.strictEqual(nds.allCharMap.get('793').cls.group, 'cyl');
  assert.strictEqual(nds.allCharMap.get('743').cls.group, 'form');
  assert.ok(!nds.charMap.has('792.2') && !nds.charMap.has('743'), 'nicht dargestellt');
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
  assert.strictEqual(sm.lead.mainTurns, null);
  assert.strictEqual(sm.lead.pitchMean, null);
  assert.strictEqual(sm.lead.mainLength, 17.4);
  near(sm.lead.mainMean, nres.pooled.chars.get('748').mean, 1e-12);
  assert.strictEqual(sm.lead.spread, null);
  assert.ok(sm.bcd.formOverall > sm.bcd.formMean, 'Hüll − Pferch des Zylinders ≥ Mittel je KR');
  assert.ok(sm.ootChars.every((p) => nds.charMap.has(p)));
});
test('ignorierte Merkmale (842, 1137) erzeugen keine Warnungen', () => {
  assert.ok(!nIssues.find((i) => i.code === 'sys-out'));
  assert.ok(!nIssues.find((i) => i.code === 'bcd-copy'));
});
test('Export Mutter: Lage als KR', () => {
  const rows = C.exportCSV(nds, nres).trim().split('\r\n');
  assert.ok(rows[1].startsWith('Mutter;9990002;0200/P_TURN;'));
  assert.ok(rows.some((r) => r.includes(';713.2.GG;') && r.includes(';KR2;')));
  assert.ok(rows.some((r) => r.includes(';748;') && r.includes(';KR1-KR4;')));
});

console.log('Review-Funde (Regressionstests)');
const spPair2 = () => ({ ds, res: C.characterize(ds, new Set(ds.batches.map((b) => b.order))) });
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
test('Mutter nur mit dem Fenster KR1–KR4 → Vergleich über die Nennlänge, keine Gangzahl nötig', () => {
  const t = rebuildNut((c) => (['748.1', '748.2'].includes(c[col('strPosition')]) ? null : c));
  const d2 = C.buildModel([C.parseCAQ(t, 'nur748.csv')], 'mutter').datasets[0];
  const r2 = C.characterize(d2, new Set(d2.batches.map((b) => b.order)));
  assert.strictEqual(r2.pooled.summary.lead.pitchMean, null);
  near(r2.pooled.summary.lead.mainMean, r2.pooled.chars.get('748').mean, 1e-12);
  const pm = C.pairing(spPair2(), { ds: d2, res: r2 }, C.PAIR_DEFAULTS);
  same(pm.geo.leadPairs.map((lp) => [lp.nut.position, lp.sp.map((x) => x.position)]), [['748', ['404.1', '404.5', '404.9']]]);
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
test('Bewertung „Mittelwerte“ entfällt (Vorgabe) → Min/Max; Hüll/Pferch nur an Gängen mit Hüll/Pferch', () => {
  same([...C.PAIR_BASES], ['minmax', 'cap']);
  const pm = C.pairing(spPair, nuPair, Object.assign({}, C.PAIR_DEFAULTS, { basis: 'mean' }));
  assert.strictEqual(pm.opts.basis, 'minmax');
  const c = pm.cells.values().next().value;
  assert.ok(c.bcd.items.every((x) => x.lo === x.mm.lo && x.hi === x.mm.hi && x.lo < x.hi));
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
test('Kriterium ohne Daten → Zelle „unvollständig“, zählt nicht als passend', () => {
  const t = rebuildNut((c) => (c[col('strPosition')].startsWith('748') ? null : c));
  const d2 = C.buildModel([C.parseCAQ(t, 'ohne748.csv')], 'mutter').datasets[0];
  const pm = C.pairing(spPair, { ds: d2, res: C.characterize(d2, new Set(d2.batches.map((b) => b.order))) }, C.PAIR_DEFAULTS);
  assert.ok([...pm.cells.values()].every((c) => c.lead.status === 'na' && c.status !== 'ok'));
  assert.strictEqual(pm.counts.bothOk, 0);
  assert.strictEqual(pm.counts.leadNa, pm.counts.pairs);
  assert.ok([...pm.rowOk.values()].every((n) => n === 0));
});
test('Hub bezieht sich auf KR1, auch bei negativem Versatz', () => {
  const a = C.pairingGeometry(ds, nds, C.PAIR_DEFAULTS);
  const b = C.pairingGeometry(ds, nds, Object.assign({}, C.PAIR_DEFAULTS, { krOffset: { 1: -1, 2: 0, 3: 1, 4: 2 } }));
  same(b.visibility, a.visibility);
  same([b.strokeFrom, b.strokeTo], [1, 14]);
});
test('Export: Reserve zur Grenze hin abgerundet', () => {
  const pm = C.pairing(spPair, nuPair, C.PAIR_DEFAULTS);
  const rows = C.exportPairingCSV(pm, ds, nds).trim().split('\r\n').slice(1);
  const head = C.exportPairingCSV(pm, ds, nds).split('\r\n')[0].split(';');
  const ri = head.indexOf('BCD_Reserve_um');
  for (const r of rows) {
    const cells = r.split(';');
    const c = pm.cells.get(cells[1] + '|' + cells[4]);
    assert.ok(Number(cells[ri].replace(',', '.')) <= c.bcd.reserve + 1e-12);
  }
});
test('Matrix-Export: eine Zeile je Paar', () => {
  const pm = C.pairing(spPair, nuPair, C.PAIR_DEFAULTS);
  const rows = C.exportPairingCSV(pm, ds, nds).trim().split('\r\n');
  assert.strictEqual(rows.length, 1 + 90);
  assert.ok(rows[0].startsWith('Spindel_Material;Spindel_Auftrag;'));
  assert.ok(/;Gauss;Min\/Max Einzelwerte;15;85;/.test(rows[1]));
});

console.log('Verteilungsfunktionen (Fähigkeit)');
const rel = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps * Math.abs(b), `${msg || ''} erwartet ${b}, erhalten ${a}`);
test('Normalverteilung: Φ(−3), Φ(−6), Φ⁻¹(0,95), Φ⁻¹(0,995), Φ⁻¹(1e-9)', () => {
  rel(C.normCdf(-3), 0.0013498980316301, 2e-7, 'Φ(−3)');
  rel(C.normCdf(-3), 0.0013498980316301, 1e-12, 'Φ(−3) genau');
  rel(C.normCdf(-6), 9.865876450376946e-10, 1e-12, 'Φ(−6)');
  near(C.normCdf(0), 0.5, 1e-15);
  near(C.normInv(0.95), 1.6448536270, 1e-9, 'Φ⁻¹(0,95)');
  near(C.normInv(0.995), 2.5758293035, 1e-9, 'Φ⁻¹(0,995)');
  near(C.normInv(1e-9), -5.997807015007686, 1e-12, 'Φ⁻¹(1e-9)');
  near(C.normInv(0.5), 0, 1e-15);
  near(C.erfc(0), 1, 1e-15);
  near(C.erfc(1) + C.erfc(-1), 2, 1e-15);
});
test('t-Verteilung: Tabellenwerte und geschlossene Formen (ν = 1, 2, nicht ganzzahlig, ∞)', () => {
  near(C.tCdf(2.262157, 9), 0.975, 1e-6);
  near(C.tCdf(-1.812461, 10), 0.05, 1e-6);
  for (const t of [-30, -3.2, -0.4, 0, 1.1, 7]) {
    near(C.tCdf(t, 1), 0.5 + Math.atan(t) / Math.PI, 1e-13, `Cauchy t=${t}`);
    near(C.tCdf(t, 2), 0.5 + t / (2 * Math.sqrt(2 + t * t)), 1e-13, `ν=2 t=${t}`);
  }
  rel(C.tCdf(-25, 1), 0.5 + Math.atan(-25) / Math.PI, 1e-10, 'Ausläufer relativ genau');
  near(C.tCdf(1.3, 7.5) + C.tCdf(-1.3, 7.5), 1, 1e-14, 'symmetrisch');
  assert.ok(C.tCdf(-2, 7.4) > C.tCdf(-2, 7.6) && C.tCdf(-2, 7.6) > C.normCdf(-2), 'monoton in ν, Grenzwert Normalverteilung');
  near(C.tCdf(-2, Infinity), C.normCdf(-2), 1e-15);
  near(C.tCdf(-2, 1e6), C.normCdf(-2), 1e-6);
});
test('F-Verteilung: Tabellenwert, F(x; 2, 2) = x/(1+x), Ausläufer', () => {
  near(C.fCdf(2.5, 9, 99), 0.987228, 1e-6);
  near(C.fCdf(3, 2, 2), 0.75, 1e-14);
  near(C.fSf(2.5, 9, 99), 1 - C.fCdf(2.5, 9, 99), 1e-14);
  rel(C.fSf(40, 2, 2), 1 / 41, 1e-12, 'oberer Ausläufer direkt');
});
test('Digamma, Trigamma und Umkehrung', () => {
  near(C.digamma(1), -0.5772156649015329, 1e-13);
  near(C.digamma(0.5), -1.9635100260214235, 1e-13);
  near(C.trigamma(1), Math.PI ** 2 / 6, 1e-13);
  near(C.trigamma(0.5), Math.PI ** 2 / 2, 1e-13);
  near(C.trigammaInv(Math.PI ** 2 / 6), 1, 1e-12);
  for (const x of [0.05, 0.7, 4.5, 30, 1e4]) rel(C.trigammaInv(C.trigamma(x)), x, 1e-10, `ψ′⁻¹(ψ′(${x}))`);
  near(C.lnGamma(10), Math.log(362880), 1e-12);
  near(C.lnGamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-14);
});
test('Smyth: d̂₀ aus s² = [1; 1,5; 2; 2,5; 3; 4; 5; 8] mit je 9 Freiheitsgraden; homogen → ∞', () => {
  const r = C.smythD0([1, 1.5, 2, 2.5, 3, 4, 5, 8], Array(8).fill(9));
  near(r.d0, 10.93356, 1e-5, 'd̂₀');
  near(r.s02, 2.842125, 1e-6, 's₀²');
  assert.strictEqual(C.smythD0([2, 2, 2, 2], [9, 9, 9, 9]).d0, Infinity);
});

console.log('Fähigkeit (Cpk_Δ)');
/** Minimaler Datensatz für spreadTable: Aufträge mit Werten (mm) an einem Merkmal. */
function miniSpread(orders, decimals, excluded, tags) {
  const res = { order: Object.keys(orders), units: new Map() };
  for (const [id, vals] of Object.entries(orders)) {
    const recs = vals.map((v, i) => ({ value: v, sampleRemark: tags && tags[id] ? tags[id][i] : '' }));
    res.units.set(id, { id, included: !(excluded || []).includes(id), chars: new Map([['P', C.describe(recs)]]) });
  }
  return C.spreadTable({ chars: [{ position: 'P', decimals: decimals == null ? 4 : decimals }] }, res).get('P');
}
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function gaussGen(seed) { const r = mulberry(seed); return (mu, sd) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }; }
const HAND_M = { n: 10, mean: 16.560, sUsed: 0.002, df: 63, src: 'own' }, HAND_S = { n: 10, mean: 16.4864, sUsed: 0.0012, df: 81, src: 'own' };
test('capDiff, Handbeispiel (Entwurf, Test b)', () => {
  const c = C.capDiff(HAND_M, HAND_S, 15, 85);
  near(c.mu, 73.6, 1e-9, 'μΔ'); near(c.sd, 2.33238, 1e-5, 'σΔ'); near(c.nu, 105.855, 1e-3, 'ν'); near(c.nEff, 10, 1e-12, 'ñ');
  near(c.cp, 5.00204, 1e-5, 'Cp'); near(c.cpk, 1.62924, 1e-5, 'Cpk'); near(c.cpkLo, 1.37629, 1e-5, 'Cpk_unten');
  near(c.pPlug * 1e6, 0.5101, 1e-4, 'p⁰ ppm'); near(c.pPred * 1e6, 4.619, 1e-3, 'p prädiktiv ppm');
  assert.strictEqual(c.side, 'U');
  near(c.reserve, 3 * c.sd * (c.cpk - 1), 1e-9, '3σ-Reserve = 3σ(Cpk − 1)');
  near(c.lo, c.mu - 3 * c.sd, 1e-12); near(c.hi, c.mu + 3 * c.sd, 1e-12);
});
test('capDiff mit n_M = 1 (Test b2) und eigener Streuung 9/9 (Test b3)', () => {
  const b2 = C.capDiff(Object.assign({}, HAND_M, { n: 1 }), HAND_S, 15, 85);
  near(b2.nEff, 1.31274, 1e-5, 'ñ'); near(b2.cpkLo, 1.11648, 1e-5, 'Cpk_unten'); near(b2.pPred * 1e6, 182.85, 0.01, 'p ppm');
  const b3 = C.capDiff(Object.assign({}, HAND_M, { df: 9 }), Object.assign({}, HAND_S, { df: 9 }), 15, 85);
  near(b3.nu, 14.7365, 1e-4, 'ν'); near(b3.cpkLo, 1.10605, 1e-5, 'Cpk_unten'); near(b3.pPred * 1e6, 161.14, 0.01, 'p ppm');
});
test('gleiches s, 10/10, df 9/9 → ν_Δ = 18 und ñ = 10 exakt (Test c)', () => {
  const e = { n: 10, mean: 16.55, sUsed: 0.002, df: 9, src: 'own' };
  const c = C.capDiff(e, Object.assign({}, e, { mean: 16.5 }), 15, 85);
  near(c.nu, 18, 1e-12); near(c.nEff, 10, 1e-12);
  near(c.cpkLo, c.cpk - 1.6448536269514722 * Math.sqrt(1 / 90 + c.cpk * c.cpk / 36), 1e-12, 'SE = √(1/(9n) + Ĉ²/(4(n−1)))');
});
test('Teilekombinationen außerhalb: k von N über alle Mutter × Spindel', () => {
  const M = { n: 3, mean: 16.55, sUsed: 0.002, df: 2, src: 'own', values: [16.551, 16.560, 16.590] };
  const S = { n: 2, mean: 16.50, sUsed: 0.002, df: 9, src: 'borrowed', values: [16.500, 16.540] };
  const c = C.capDiff(M, S, 15, 85);
  // Differenzen: 51, 11, 60, 20, 90, 50 µm → 11 < 15 und 90 > 85 außerhalb
  same([c.kOut, c.N], [2, 6]);
  const g = C.capDiff(Object.assign({}, M, { values: [16.515] }), Object.assign({}, S, { values: [16.500] }), 15, 85);
  same([g.kOut, g.N], [0, 1], 'genau auf der Grenze (15 µm) zählt als innerhalb');
});
test('Status Variante b: außerhalb < 1,00; knapp = nicht nachgewiesen; kein Ziel 1,33 (Test g)', () => {
  assert.strictEqual(C.capStatus({ cpk: 0.99, cpkLo: 0.6 }), 'out');
  assert.strictEqual(C.capStatus({ cpk: 1.0, cpkLo: 0.6 }), 'warn', 'Ĉ = 1,00 ist nicht außerhalb');
  assert.strictEqual(C.capStatus({ cpk: 1 - 1e-10, cpkLo: 0.6 }), 'warn', 'Toleranz EPS');
  assert.strictEqual(C.capStatus({ cpk: 1.57, cpkLo: 0.9997 }), 'warn', 'untere Grenze 0,9997 → knapp');
  assert.strictEqual(C.capStatus({ cpk: 1.2, cpkLo: 1.0 }), 'ok', 'keine Stufe 1,33');
  assert.strictEqual(C.capStatus({ cpk: 1.2, cpkLo: 1 - 1e-10 }), 'ok', 'Toleranz EPS an der unteren Grenze');
  assert.strictEqual(C.capStatus(null), 'na');
  assert.ok(C.floorTo(1 - 1e-10, 2) === 1 && C.floorTo(0.9997, 2) === 0.99 && C.floorTo(1 - 2e-9, 2) === 0.99, 'Anzeige abgerundet, konsistent mit dem Status');
  assert.ok(C.ceilSig(161.14, 2) === 170 && C.ceilSig(4.619, 2) === 4.7 && C.ceilSig(3.2, 2) === 3.2 && C.ceilSig(0, 2) === 0, 'Anteile aufgerundet');
});
test('Zellstatus = schlechtester Ort, maßgeblich nach Status, dann Cpk, dann untere Grenze (Test h)', () => {
  const it = (cpk, cpkLo, tag) => ({ tag, cap: { cpk, cpkLo, lo: 0, hi: 1, reserve: 0, pPred: 1e-4 } });
  const a = C.capAggregate([it(1.36, 1.05, 'B'), it(1.40, 0.90, 'A')]);
  assert.strictEqual(a.status, 'warn'); assert.strictEqual(a.worst.tag, 'A');
  assert.strictEqual(a.minAt.tag, 'B', 'Cpk_min kann an einem anderen Ort liegen');
  near(a.cpkMin, 1.36, 1e-12); near(a.cpkLoMin, 0.90, 1e-12); near(a.pSum, 2e-4, 1e-15); near(a.pMax, 1e-4, 1e-15);
  const b = C.capAggregate([it(1.5, 1.1, 'ok'), it(1.45, 1.02, 'ok2'), it(1.6, 0.95, 'knapp')]);
  assert.strictEqual(b.worst.tag, 'knapp', 'Status vor Cpk');
  const n = C.capAggregate([it(1.5, 1.1, 'ok'), { tag: 'na', cap: null }]);
  assert.strictEqual(n.status, 'na', 'ein Ort ohne Daten → Kriterium ohne Daten');
  const o = C.capAggregate([it(0.8, 0.5, 'out'), { tag: 'na', cap: null }]);
  assert.strictEqual(o.status, 'out'); assert.strictEqual(o.worst.tag, 'out');
  assert.strictEqual(C.capAggregate([]).status, 'na');
});
test('Streuung je Auftrag; n < 3 übernimmt die gepoolte Streuung der übrigen mit ν = min(d̂₀, Σν) (Test e)', () => {
  const g = gaussGen(7);
  const orders = {};
  for (let i = 0; i < 6; i++) orders['A' + i] = Array.from({ length: 10 }, () => 16.55 + g(0, 0.001 + 0.0004 * i));
  orders.B1 = [16.551]; orders.B2 = [16.551, 16.554];
  const t = miniSpread(orders);
  const own = [...t.byOrder.values()].filter((e) => e.src === 'own');
  assert.strictEqual(own.length, 6);
  for (const e of own) { near(e.sUsed, e.s, 1e-15); assert.strictEqual(e.df, 9); }
  const sp = Math.sqrt(own.reduce((a, e) => a + 9 * e.s * e.s, 0) / 54);
  near(t.pool.s, sp, 1e-15); same([t.pool.df, t.pool.k], [54, 6]);
  const d0 = C.smythD0(own.map((e) => e.s * e.s), own.map(() => 9)).d0;
  for (const id of ['B1', 'B2']) {
    const e = t.byOrder.get(id);
    assert.strictEqual(e.src, 'borrowed', id); near(e.sUsed, sp, 1e-15); near(e.df, Math.min(d0, 54), 1e-12);
  }
  // homogen → d̂₀ = ∞, Begrenzung auf Σν
  const h = miniSpread({ A: [1, 2, 3], B: [4, 5, 6], C: [7, 8, 9], D: [5] }, 0);
  assert.strictEqual(h.d0, Infinity); assert.strictEqual(h.byOrder.get('D').df, 6);
});
test('weniger als 3 Aufträge mit eigener Streuung → Streuung nicht schätzbar, Ort „keine Daten“', () => {
  const t = miniSpread({ A: [16.55, 16.551, 16.553], B: [16.552, 16.55, 16.556], C: [16.551] });
  assert.strictEqual(t.byOrder.get('C').src, 'none');
  assert.strictEqual(t.byOrder.get('C').sUsed, null);
  const c = C.capDiff(t.byOrder.get('C'), t.byOrder.get('A'), 15, 85);
  assert.strictEqual(c, null); assert.strictEqual(C.capStatus(c), 'na');
  assert.notStrictEqual(C.capDiff(t.byOrder.get('A'), t.byOrder.get('B'), -1000, 1000), null, 'eigene Streuung unabhängig von G');
});
test('Auflösung: 10 gleiche Werte bei 1 µm → s = 1/√12 µm (Test f)', () => {
  const t = miniSpread({ A: Array(10).fill(16.55), B: [16.551, 16.552, 16.55] }, 3);
  const e = t.byOrder.get('A');
  near(e.sUsed * 1000, 1 / Math.sqrt(12), 1e-12); assert.ok(e.floored);
  assert.ok(!t.byOrder.get('B').floored);
});
test('Hinweis „Streuung auffällig“ (F-Test gegen die übrigen) und Erst-/Letztstück-Versatz', () => {
  const g = gaussGen(11);
  const o = {}, tags = {};
  for (let i = 0; i < 6; i++) { o['A' + i] = Array.from({ length: 10 }, () => 16.55 + g(0, 0.001)); tags['A' + i] = Array(10).fill('Erststückprüfung').fill('Letztstückprüfung', 5); }
  o.W = Array.from({ length: 10 }, (_, i) => 16.55 + g(0, 0.001) + (i < 5 ? -0.004 : 0.004));
  tags.W = Array(10).fill('Erststückprüfung').fill('Letztstückprüfung', 5);
  const t = miniSpread(o, 4, null, tags);
  const w = t.byOrder.get('W');
  assert.ok(w.flagged && w.fP < 0.01, 'σ! bei 8 µm Versatz');
  assert.ok(w.el.flagged && Math.abs(w.el.d * 1000 - 8) < 2, 'E/L markiert, δ ≈ 8 µm');
  same([w.el.nE, w.el.nL], [5, 5]);
  assert.ok(w.el.sW * 1000 < 2, 'Streuung innerhalb der Gruppen klein');
  assert.ok([...t.byOrder.values()].filter((e) => e.id !== 'W').every((e) => !e.el.flagged), 'ohne Versatz keine Marke');
  const nt = miniSpread({ A: [1, 2, 3, 4] }, 0);
  assert.strictEqual(nt.byOrder.get('A').el, null, 'ohne Erst-/Letztstücke kein Test');
});
test('Ausgeschlossene Aufträge gehen nicht in Pool und d̂₀ ein; eigene Streuung unabhängig vom Ausschluss (Test i)', () => {
  const g = gaussGen(3);
  const o = {};
  for (let i = 0; i < 5; i++) o['A' + i] = Array.from({ length: 10 }, () => 16.55 + g(0, 0.001 * (1 + i)));
  o.B = [16.55];
  const all = miniSpread(o), ex = miniSpread(o, 4, ['A4']);
  assert.ok(!ex.byOrder.has('A4'));
  same([all.pool.k, ex.pool.k], [5, 4]);
  assert.notStrictEqual(all.byOrder.get('B').sUsed, ex.byOrder.get('B').sUsed, 'n < 3 hängt am Pool');
  near(all.byOrder.get('A1').sUsed, ex.byOrder.get('A1').sUsed, 0, 'n ≥ 3 unverändert');
  // dasselbe in der Matrix: ein fremder Mutter-Auftrag aus- bzw. eingeschlossen
  const ids = nds.batches.map((b) => b.order);
  const pmA = C.pairing(spPair, nuPair, { basis: 'cap' });
  const inc = new Set(ids); inc.delete(ids[ids.length - 1]);
  const pmB = C.pairing(spPair, { ds: nds, res: C.characterize(nds, inc) }, { basis: 'cap' });
  const key = pmA.spU[0].id + '|' + '90020011';
  const ca = pmA.cells.get(key), cb = pmB.cells.get(key);
  assert.ok(ca.bcd.items.length && ca.bcd.items.every((it, i) => it.cap.cpk === cb.bcd.items[i].cap.cpk && it.cap.cpkLo === cb.bcd.items[i].cap.cpkLo));
  assert.ok(!pmB.spread.nu.get('713.1.GG').byOrder.has(ids[ids.length - 1]));
});
const pmCap = C.pairing(spPair, nuPair, { basis: 'cap' });
const pmMM = C.pairing(spPair, nuPair, { basis: 'minmax' });
test('Matrix „Fähigkeit“: Min/Max bleibt je Ort erhalten, lo/hi = μΔ ± 3σΔ (Test j)', () => {
  assert.strictEqual(pmCap.opts.basis, 'cap');
  for (const [k, c] of pmCap.cells) {
    const m = pmMM.cells.get(k);
    for (const crit of ['bcd', 'lead']) {
      assert.strictEqual(c[crit].items.length, m[crit].items.length);
      c[crit].items.forEach((it, i) => {
        same([it.mm.lo, it.mm.hi], [m[crit].items[i].lo, m[crit].items[i].hi]);
        near(it.mid, m[crit].items[i].mid, 0);
        if (it.cap) { near(it.lo, it.cap.mu - 3 * it.cap.sd, 1e-12); near(it.cap.mu, it.mid, 1e-9, 'μΔ = Differenz der Auftragsmittel'); }
      });
    }
  }
});
test('Matrix „Fähigkeit“: synthetisch ohne NaN, Status je Zelle = schlechtester Ort, Zählung', () => {
  let n = { out: 0, warn: 0 };
  for (const c of pmCap.cells.values()) {
    for (const crit of ['bcd', 'lead']) {
      const a = c[crit];
      assert.ok(['ok', 'warn', 'out', 'na'].includes(a.status));
      assert.strictEqual(a.status, a.items.reduce((w, it) => (C.SEVERITY[it.status] > C.SEVERITY[w] ? it.status : w), 'ok'));
      for (const it of a.items) for (const v of [it.cap.cpk, it.cap.cpkLo, it.cap.nu, it.cap.pPred, it.cap.sd]) assert.ok(Number.isFinite(v), 'endlich');
      if (crit === 'bcd') n[a.status] = (n[a.status] || 0) + 1;
    }
  }
  same([pmCap.counts.bcdOut, pmCap.counts.bcdWarn], [n.out, n.warn]);
  assert.ok(pmCap.worst, 'Startauswahl vorhanden');
  for (const c of pmCap.cells.values()) assert.ok(!(C.SEVERITY[c.bcd.status] > C.SEVERITY[pmCap.worst.status] && c.bcd.status !== 'na'), 'Startauswahl hat den schwersten Status');
});
test('Mutter-Auftrag mit 1 Teil: Streuung übernommen (σ*), ν = min(d̂₀, Σν), ñ < 2', () => {
  const t = pmCap.spread.nu.get('713.1.GG');
  const e = t.byOrder.get('90020017');
  assert.strictEqual(e.n, 1); assert.strictEqual(e.src, 'borrowed');
  near(e.sUsed, t.pool.s, 0); near(e.df, Math.min(t.d0, t.pool.df), 1e-12);
  const c = pmCap.cells.get(pmCap.spU[0].id + '|90020017');
  assert.ok(c.bcd.items.every((it) => it.flags.borrowed.includes('Mutter') && it.cap.nEff < 2 && it.cap.N === 10));
});
test('Synthetische Mutter mit Erst-/Letztstück-Versatz (+8 µm) wird markiert (Test k)', () => {
  const t = pmCap.spread.nu.get('713.2.GG');
  const e = t.byOrder.get('90020035');
  assert.ok(e.el && e.el.flagged, 'E/L markiert');
  assert.ok(Math.abs(e.el.d * 1000 - 8) < 2.5, `δ ≈ 8 µm, erhalten ${e.el.d * 1000}`);
  assert.ok(e.flagged, 'Streuung auffällig');
  const others = [...t.byOrder.values()].filter((x) => x.id !== '90020035' && x.el);
  assert.ok(others.length >= 5 && others.every((x) => Math.abs(x.el.d * 1000) < 6));
  const c = pmCap.cells.get(pmCap.spU[0].id + '|90020035');
  assert.ok(c.bcd.items.some((it) => it.flags.el.includes('Mutter')));
});
test('Grenzfall: nur 2 Mutter-Aufträge mit eigener Streuung + 1 Teil → dort „keine Daten“, kein Rückfall auf Min/Max', () => {
  const inc = new Set(['90020011', '90020020', '90020017']);
  const pm = C.pairing(spPair, { ds: nds, res: C.characterize(nds, inc) }, { basis: 'cap' });
  const c = pm.cells.get(pm.spU[0].id + '|90020017');
  assert.ok(c.bcd.items.every((it) => it.cap === null && it.status === 'na' && it.nutSpread.src === 'none'));
  same([c.bcd.status, c.lead.status, c.status], ['na', 'na', 'na']);
  assert.ok(c.bcd.items.every((it) => it.mm.lo != null), 'Min/Max bleibt zum Vergleich erhalten');
  assert.strictEqual(pm.cells.get(pm.spU[0].id + '|90020011').bcd.items.filter((it) => it.cap).length, pm.cells.get(pm.spU[0].id + '|90020011').bcd.items.length);
  assert.strictEqual(pm.counts.incomplete, pm.spU.length);
  assert.ok(pm.worst && pm.worst.n.id !== '90020017', 'Zellen ohne Daten nicht als Startauswahl');
});
test('Grenzfall: keine einbezogenen Aufträge / keine Daten → leere Matrix ohne Fehler', () => {
  const pm = C.pairing(spPair, { ds: nds, res: C.characterize(nds, new Set()) }, { basis: 'cap' });
  same([pm.cells.size, pm.counts.pairs], [0, 0]);
  assert.strictEqual(pm.worst, null);
  assert.strictEqual(C.exportPairingCSV(pm, ds, nds).trim().split('\r\n').length, 1);
  assert.strictEqual(C.capAggregate([]).worst, null);
});
test('Export: gleiche Kopfzeile bei beiden Bewertungen; Fähigkeit nur bei „Fähigkeit“ gefüllt; Cpk ab-, ppm aufgerundet (Test l)', () => {
  const a = C.exportPairingCSV(pmMM, ds, nds).trim().split('\r\n'), b = C.exportPairingCSV(pmCap, ds, nds).trim().split('\r\n');
  assert.strictEqual(a[0], b[0]);
  const head = a[0].split(';');
  const iC = head.indexOf('BCD_Cpk'), iL = head.indexOf('BCD_Cpk_unten'), iP = head.indexOf('BCD_Anteil_ppm'), iS = head.indexOf('Stg_Cpk'), iQ = head.indexOf('BCD_Streuung_Quelle');
  assert.ok(iC > 0 && iS > iC && head.includes('BCD_k_ausserhalb') && head.includes('Stg_Hinweise'));
  assert.ok(a.slice(1).every((r) => r.split(';').slice(iC).every((x) => x === '')), 'Min/Max: Fähigkeits-Spalten leer');
  assert.ok(/;Fähigkeit \(Cpk_Δ, 95 %\);/.test(b[1]));
  for (const r of b.slice(1)) {
    const x = r.split(';'), c = pmCap.cells.get(x[1] + '|' + x[4]);
    assert.strictEqual(x.length, head.length);
    const num = (s) => Number(s.replace(',', '.'));
    assert.ok(num(x[iC]) <= c.bcd.worst.cap.cpk + 1e-9 && num(x[iC]) > c.bcd.worst.cap.cpk - 0.0011, 'Cpk abgerundet');
    assert.ok(num(x[iL]) <= c.bcd.worst.cap.cpkLo + 1e-9);
    assert.ok(num(x[iP]) >= c.bcd.worst.cap.pPred * 1e6 * (1 - 1e-9), 'ppm aufgerundet');
    assert.ok(/^Mutter (eigene|übernommen) \/ Spindel eigene$/.test(x[iQ]));
  }
  const r17 = b.find((r) => r.split(';')[4] === '90020017').split(';');
  assert.ok(/Streuung übernommen \(Mutter\)/.test(r17[head.indexOf('BCD_Hinweise')]));
});
test('Überdeckung der unteren 95-%-Grenze (2000 Läufe, homogen, eigene Streuung): 0,93…0,97 (Test m)', () => {
  const g = gaussGen(20261107);
  const sM = 2, sS = 2, sd = Math.sqrt(8), trueCpk = 1.33, U = 85, mu = U - 3 * trueCpk * sd;
  let cover = 0;
  const R = 2000;
  for (let r = 0; r < R; r++) {
    const m = Array.from({ length: 10 }, () => g(16.55 + mu / 1000, sM / 1000)), s = Array.from({ length: 10 }, () => g(16.55, sS / 1000));
    const ent = (v) => { const x = v.reduce((a, b) => a + b, 0) / 10; return { n: 10, mean: x, sUsed: Math.sqrt(v.reduce((a, b) => a + (b - x) ** 2, 0) / 9), df: 9, src: 'own' }; };
    if (C.capDiff(ent(m), ent(s), 15, U).cpkLo <= trueCpk) cover++;
  }
  const cov = cover / R;
  assert.ok(cov >= 0.93 && cov <= 0.97, `Überdeckung ${cov}`);
});

// Optional: echte Exporte lokal mitprüfen (werden nie ins Repository übernommen)
const real = {};
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
  real[type] = d;
}
if (real.spindel && real.mutter) {
  console.log('Echte Exporte: Paarung Min/Max gegen Fähigkeit (lokal, ohne Kennungen in der Ausgabe)');
  // wie im Browser: der früheste Spindel-Auftrag (Anlauf) ist ausgeschlossen
  const sd = real.spindel, nd = real.mutter;
  const sInc = new Set(sd.batches.slice(1).map((b) => b.order));
  const sp = { ds: sd, res: C.characterize(sd, sInc) }, nu = { ds: nd, res: C.characterize(nd, new Set(nd.batches.map((b) => b.order))) };
  const dist = (pm, k) => { const x = { ok: 0, warn: 0, out: 0, na: 0 }; for (const c of pm.cells.values()) x[c[k].status]++; return x; };
  const fmtD = (x) => `${x.ok}/${x.warn}/${x.out}${x.na ? ` (ohne Daten ${x.na})` : ''}`;
  // Referenz aus docs/entwurf-faehigkeit.md, Abschnitt 7 (gleiche Exporte: 12 Spindel- und 9 Mutter-Aufträge)
  const draft = sd.batches.length === 12 && nd.batches.length === 9;
  const REF = { gauss: ['94/5/0', '84/9/6'], huell: ['63/28/8', '44/35/20'], pferch: ['80/13/6', '66/17/16'], lead: ['99/0/0', '98/1/0'] };
  test('Statusverteilung ok/knapp/außerhalb je Auswertung' + (draft ? ' = Entwurf, Abschnitt 7' : ''), () => {
    for (const fit of ['gauss', 'huell', 'pferch']) {
      const a = C.pairing(sp, nu, { fit, basis: 'minmax' }), b = C.pairing(sp, nu, { fit, basis: 'cap' });
      const tr = {};
      for (const [k, c] of a.cells) { const t = `${c.bcd.status}→${b.cells.get(k).bcd.status}`; tr[t] = (tr[t] || 0) + 1; }
      console.log(`      BCD ${C.FIT_LABEL[fit].padEnd(6)} Min/Max ${fmtD(dist(a, 'bcd')).padEnd(9)} Fähigkeit ${fmtD(dist(b, 'bcd')).padEnd(9)} ${JSON.stringify(tr)}`);
      const rows = [[fit, 'bcd']].concat(fit === 'gauss' ? [['lead', 'lead']] : []);
      for (const [ref, k] of rows) {
        const xa = dist(a, k), xb = dist(b, k);
        assert.strictEqual(xb.ok + xb.warn + xb.out + xb.na, a.counts.pairs);
        if (k === 'lead') console.log(`      Steigung    Min/Max ${fmtD(xa).padEnd(9)} Fähigkeit ${fmtD(xb)}`);
        if (draft) same([fmtD(xa), fmtD(xb)], REF[ref]);
      }
      if (fit === 'gauss') {
        const w = b.minCapBcd.bcd.minAt;
        console.log(`      kleinster Cpk_Δ BCD Gauss ${C.floorTo(w.cap.cpk, 2)} (unten ${C.floorTo(w.cap.cpkLo, 2)}) an ${C.pairLoc(w)}; Steigung ${C.floorTo(b.minCapLead.lead.cpkMin, 2)}`);
        if (draft) same([C.floorTo(w.cap.cpk, 2), C.floorTo(w.cap.cpkLo, 2), C.pairLoc(w)], [0.72, 0.41, 'Gang 17/KR4']);
      }
    }
  });
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
process.exit(failed ? 1 : 0);
