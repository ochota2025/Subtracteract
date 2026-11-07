#!/usr/bin/env node
/*
 * Erzeugt einen synthetischen CAQ-Export der Mutter (Hartdrehen) im Format des echten Exports.
 * Alle Kennungen (Material, Aufträge, Chargen, Maschinen, UUIDs) sind erfunden; enthalten ist
 * nur eine Auswahl der Merkmale (Gewinde + einige Gegenbeispiele), nicht der ganze Prüfplan.
 *
 * Bewusst nachgebildete Eigenheiten des echten Exports:
 *   - Materialtext = Materialnummer (kein „Mutter“ im Text)
 *   - strUUID je gemessenem Teil (32 Hex-Zeichen), datInsp = Prüfbeginn, datInspUTC = Messzeit
 *   - Re-Import derselben Teile mit identischen Werten und doppelt kodierten Umlauten
 *     („Erstst<U+00C3><U+00BC>ckpr<U+00C3><U+00BC>fung“)
 *   - dieselben 5 Teile in zwei Fertigungsaufträgen; ein Auftrag mit nur einem eigenen Teil
 *   - Erststückprüfung mit 5 Teilen unter derselben Stichprobe 1 (intTool 1–5)
 *   - Durchmesser mit Endung .GG, die kein BCD sind (Außen-ø, Kern-ø, Lagersitz)
 *   - BCD-Kennzahlen (Range, Kopie „wie 713.1.GG“), Merkmal mit allen Werten außer Toleranz
 *   - Leerzeichen am Ende von strInspectionOrder, Werte mit 6 Nachkommastellen
 *   - ein Auftrag mit Versatz zwischen Erst- und Letztstücken (+8 µm am BCD), für die Bewertung „Fähigkeit“
 *
 * Aufruf:  node tools/generate-synthetic-mutter.js [ausgabe.csv]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || path.join(__dirname, '..', 'testdata', 'synthetisch_mutter_P_TURN.csv');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261108);
function gauss(mu = 0, sd = 1) {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const hex32 = () => Array.from({ length: 32 }, () => Math.floor(rnd() * 16).toString(16)).join('');
/** wie R: bis 6 Nachkommastellen, Nullen am Ende weg */
const r6 = (x) => String(Number(x.toFixed(6)));

const HEADER = ['strMaterialNo', 'strMaterialtext', 'strInspectionOrder', 'strSAPOrder', 'strOrdertype', 'strProcessNo', 'strProcess', 'strSiteNo', 'strBatchNo', 'strMachineNo', 'strMachineText', 'strCharNo', 'intCharType', 'strCharTextEN', 'strUnit', 'strPosition', 'strRemark', 'intOrderInGIP', 'intOrderInIP', 'intInspectionPlanVersion', 'decNominal', 'decLTol', 'decUTol', 'value', 'decLIntTol', 'decUIntTol', 'decLCL', 'decUCL', 'intSampleNo', 'intSample', 'intTool', 'intPartNo', 'strUUID', 'strGaugeNo', 'strGageGroupNo', 'datInspStart', 'Remark', 'intMeasurementNo', 'intMeasurementNoSample', 'intSampleData', 'datInspUTC', 'datInsp', 'decY', 'strCharAll', 'strProcessAll', 'idtblSFS_CAQArchive_Specification', 'blnNoCAQ', 'strRevision', 'strSampleRemark', 'strAcqType'];
const QUOTED = new Set(['strMaterialNo', 'strMaterialtext', 'strInspectionOrder', 'strSAPOrder', 'strOrdertype', 'strProcessNo', 'strProcess', 'strSiteNo', 'strBatchNo', 'strMachineNo', 'strMachineText', 'strCharNo', 'strCharTextEN', 'strUnit', 'strPosition', 'strRemark', 'strUUID', 'strGaugeNo', 'strGageGroupNo', 'strCharAll', 'strProcessAll', 'strRevision', 'strSampleRemark', 'strAcqType']);

// ---------- Prüfplan (Auswahl) ----------
const plan = [];
let ip = 1;
const add = (c) => plan.push(Object.assign({ orderInIP: ip++, lcl: null, ucl: null }, c));
const D = '<U+00F8>'; // ø
add({ charNo: '1046', text: 'runout', unit: 'mm', pos: '700', remark: `Rundl Aussen-${D} (D) zu A (MAX)`, nom: 0, lt: 0, ut: 0.075, f: (p) => Math.abs(0.035 + gauss(0, 0.009)) });
for (const [pos, rem, off] of [['707.GG', 'Zylinder', 0], ['707.1.GG', 'ME1', -0.011], ['707.2.GG', 'ME2', 0.011]]) {
  add({ charNo: '1041', text: 'diameter', unit: 'mm', pos, remark: `Aussen-${D} 27.350 (GG) (${rem})`, nom: 27.31, lt: 27.28, ut: 27.335, f: (p) => 27.315 + off + p.outer });
}
add({ charNo: '1009', text: 'angle', unit: 'degree', pos: '876', remark: 'Winkel 82<U+00B0> Nut zu B', nom: 152, lt: 150, ut: 154, f: () => 152.2 + gauss(0, 0.06) });
// BCD: Zylinder + KR1..KR4, je GG/GN/GX
const KR_NOM = { 1: 16.55, 2: 16.56, 3: 16.56, 4: 16.56 };
const KR_TOL = { 1: [16.53, 16.57], 2: [16.54, 16.58], 3: [16.54, 16.58], 4: [16.54, 16.58] };
const KR_TOL_HP = { 1: [16.525, 16.58], 2: [16.535, 16.59], 3: [16.535, 16.59], 4: [16.535, 16.59] };
const KR_TXT = { 1: ' (Nocke)', 2: '', 3: '', 4: ' (<U+00F8>19.2)' };
for (const fit of ['GG', 'GN', 'GX']) {
  const tolZ = fit === 'GG' ? [16.53, 16.57] : [16.525, 16.58];
  add({ charNo: '1041', text: 'diameter', unit: 'mm', pos: `713.${fit}`, remark: `BCD Zylinder ${fit}`, nom: 16.55, lt: tolZ[0], ut: tolZ[1], f: (p) => p.bcdZ[fit] });
  for (const k of [1, 2, 3, 4]) {
    const tol = fit === 'GG' ? KR_TOL[k] : KR_TOL_HP[k];
    add({ charNo: '1041', text: 'diameter', unit: 'mm', pos: `713.${k}.${fit}`, remark: `BCD KR${k} ${fit} - 8P${KR_TXT[k]}`, nom: KR_NOM[k], lt: tol[0], ut: tol[1], f: (p) => p.bcd[k][fit] });
  }
}
add({ charNo: '1041', text: 'diameter', unit: 'mm', pos: '842', remark: 'BCD Range (Max) (GN-GX)', nom: 0, lt: 0, ut: 0.02, f: (p) => Math.max(...[1, 2, 3, 4].map((k) => p.bcd[k].GN)) - Math.min(...[1, 2, 3, 4].map((k) => p.bcd[k].GX)) });
add({ charNo: '1041', text: 'diameter', unit: 'mm', pos: '842.GG', remark: 'BCD Range (GG)', nom: 0, lt: 0, ut: 0.025, f: (p) => Math.max(...[1, 2, 3, 4].map((k) => p.bcd[k].GG)) - Math.min(...[1, 2, 3, 4].map((k) => p.bcd[k].GG)) });
add({ charNo: '1041', text: 'diameter', unit: 'mm', pos: '892.GG', remark: 'BCD Range (GG)', nom: 0, lt: 0, ut: 0.015, f: (p) => Math.max(...[2, 3, 4].map((k) => p.bcd[k].GG)) - Math.min(...[2, 3, 4].map((k) => p.bcd[k].GG)) });
add({ charNo: '1041', text: 'diameter', unit: 'mm', pos: '884', remark: 'BCD (GG) - KR1 (wie 713.1.GG)', nom: 16.546, lt: 16.531, ut: 16.561, f: (p) => p.bcd[1].GG });
// Steigung
add({ charNo: '1301', text: 'distance', unit: 'mm', pos: '748', remark: 'Gew.Steigung (KR1-KR4)', nom: 17.4, lt: 17.385, ut: 17.415, f: (p) => p.lead.L14 });
add({ charNo: '1301', text: 'distance', unit: 'mm', pos: '748.1', remark: 'Gew.Steigung (KR1-KR2)', nom: 2.9, lt: 2.885, ut: 2.915, f: (p) => p.lead.L12 });
add({ charNo: '1301', text: 'distance', unit: 'mm', pos: '748.2', remark: 'Gew.Steigung (KR3-KR4)', nom: 2.9, lt: 2.885, ut: 2.915, f: (p) => p.lead.L34 });
// Kern-ø (Durchmesser mit .GG, kein BCD)
add({ charNo: '1041', text: 'diameter', unit: 'mm', pos: '751.GG', remark: `Kern-${D} (Zyl 1-5 GG)`, nom: 16.85, lt: 16.8, ut: 16.9, f: (p) => p.core });
for (let k = 1; k <= 5; k++) add({ charNo: '1041', text: 'diameter', unit: 'mm', pos: `751.${k}.GG`, remark: `Kern-${D} (${k})${k === 1 ? ' (Nocke)' : ''}`, nom: 16.85, lt: 16.8, ut: 16.9, f: (p) => p.core + gauss(0, 0.006) });
// Lagersitz mit Eingriffsgrenzen
add({ charNo: '1041', text: 'diameter', unit: 'mm', pos: '769.GG', remark: `${D}24.5 Lagersitz (Zylinder)`, nom: 24.509, lt: 24.502, ut: 24.515, lcl: 24.504, ucl: 24.514, f: () => 24.5088 + gauss(0, 0.0009) });
// Zylindrizität
add({ charNo: '1106', text: 'cylindricity', unit: 'mm', pos: '743', remark: `Zyl Aussen-${D} (ME1&ME2)`, nom: 0, lt: 0, ut: 0.05, f: () => Math.abs(0.027 + gauss(0, 0.004)) });
add({ charNo: '1106', text: 'cylindricity', unit: 'mm', pos: '792', remark: 'Zyl Gew. Max - 8P', nom: 0, lt: 0, ut: 0.03, lcl: 0, ucl: 0.02, f: (p) => Math.max(...p.cyl) });
for (let k = 1; k <= 4; k++) add({ charNo: '1106', text: 'cylindricity', unit: 'mm', pos: `792.${k}`, remark: `Zyl Gew. KR${k} - 8P${KR_TXT[k]}`, nom: 0, lt: 0, ut: k === 1 ? 0.03 : 0.025, f: (p) => p.cyl[k - 1] });
add({ charNo: '1106', text: 'cylindricity', unit: 'mm', pos: '793', remark: 'Zyl Gew Gesamt. - 32P', nom: 0, lt: 0, ut: 0.035, f: (p) => Math.max(...p.cyl) + 0.009 + Math.abs(gauss(0, 0.002)) });
// Lage
add({ charNo: '1510', text: 'position', unit: 'mm', pos: '851', remark: 'Koax Gew zu H', nom: 0, lt: 0, ut: 0.08, lcl: 0, ucl: 0.05, f: (p) => 2 * Math.hypot(p.ex, p.ey) });
add({ charNo: '5032', text: 'offset', unit: 'mm', pos: '851.MW.X', remark: 'X-Vers Gew. zu H - (MW)', nom: 0, lt: -0.04, ut: 0.04, f: (p) => p.ex });
add({ charNo: '5032', text: 'offset', unit: 'mm', pos: '851.MW.Y', remark: 'Y-Vers Gew. zu H - (MW)', nom: 0, lt: -0.04, ut: 0.04, f: (p) => p.ey });
add({ charNo: '1080', text: 'roundness', unit: 'mm', pos: '1137', remark: `Rund. I${D}19.2 (Max. ME3, ME4, ME5)`, nom: 0, lt: 0, ut: 0.02, f: () => 0.055 + Math.abs(gauss(0, 0.008)) });

// ---------- Aufträge ----------
const MACH = ['90011', '90012', '90013', '90014'];
const ORD = [
  { start: '2026-10-02 06:40:53', m: 0, reimportErst: '2026-10-05 08:15:30' },
  { start: '2026-10-07 07:14:25', m: 0, nachmOnly: true },
  { start: '2026-10-05 13:34:09', m: 1, dupOf: 1 },
  { start: '2026-10-22 13:34:52', m: 2 },
  { start: '2026-10-23 13:02:28', m: 0, erstOneSample: true, reimportErst: '2026-10-28 07:34:40' },
  { start: '2026-10-23 13:02:28', m: 3 },
  { start: '2026-11-02 10:33:33', m: 1, shift: 3.5 },
  { start: '2026-11-02 10:33:33', m: 2 },
  { start: '2026-11-03 08:44:30', m: 3, leadShift: 2, el: 8 },
  { start: '2026-11-03 08:44:30', m: 0 },
].map((o, i) => Object.assign(o, { order: String(90020011 + i * 3), batch: String(7200301 + i * 2), off: gauss(0, 2.5) + (o.shift || 0), loff: gauss(0, 1.6) + (o.leadShift || 0) }));

function parseTs(s) { const [d, t] = s.split(' '); const [y, m, dd] = d.split('-').map(Number); const [H, M, S] = t.split(':').map(Number); return Date.UTC(y, m - 1, dd, H, M, S); }
function fmtTs(ms) { return new Date(ms).toISOString().slice(0, 19).replace('T', ' '); }
const DST_END_LOCAL = parseTs('2026-10-25 03:00:00');
const utcOf = (ms) => ms - (ms >= DST_END_LOCAL ? 1 : 2) * 3600e3;

function makePart(o, drift) {
  const p = { bcd: {}, bcdZ: {}, cyl: [], lead: {} };
  const po = gauss(0, 2) + drift;
  const BASE = { 1: -1.5, 2: 4.7, 3: 2.0, 4: -2.5 };
  for (const k of [1, 2, 3, 4]) {
    const gg = KR_NOM[k] + (BASE[k] + o.off + po + gauss(0, 1)) / 1000;
    const hp = (25 + gauss(0, 3)) / 1000;
    p.bcd[k] = { GG: gg, GN: gg + hp / 2 + gauss(0, 0.0008), GX: gg - hp / 2 + gauss(0, 0.0008) };
    p.cyl.push(Math.max(0.004, 0.006 + hp * 0.3 + gauss(0, 0.0015)));
  }
  p.bcdZ.GG = [1, 2, 3, 4].reduce((s, k) => s + p.bcd[k].GG, 0) / 4;
  p.bcdZ.GN = Math.max(...[1, 2, 3, 4].map((k) => p.bcd[k].GN)) - Math.abs(gauss(0, 0.0003));
  p.bcdZ.GX = Math.min(...[1, 2, 3, 4].map((k) => p.bcd[k].GX)) + Math.abs(gauss(0, 0.0004));
  p.lead.L14 = 17.4 + (6 + o.loff + gauss(0, 1.4)) / 1000;
  p.lead.L12 = 2.9 + (1 + gauss(0, 0.35)) / 1000;
  p.lead.L34 = 2.9 + (3.4 + gauss(0, 0.45)) / 1000;
  p.outer = gauss(0, 0.004);
  p.core = 16.81 + gauss(0, 0.014);
  p.ex = gauss(0, 0.011); p.ey = gauss(0.005, 0.012);
  return p;
}

const specId = new Map(plan.map((c, i) => [c.pos, 6000101 + i]));
const rows = [];
function emit(o, ev) {
  // ev: {part, sampleNo, sample, tool, uuid, remark, startLocal, utcMs}
  let t = ev.utcMs;
  for (const c of plan) {
    t += 120; // ~0,1 s je Merkmal
    rows.push({
      strMaterialNo: '9990002', strMaterialtext: '9990002', strInspectionOrder: `${o.order}/0200/P_TURN `, strSAPOrder: o.order,
      strOrdertype: 'SPC', strProcessNo: '0200', strProcess: 'P_TURN', strSiteNo: '1000', strBatchNo: o.batch,
      strMachineNo: MACH[o.m], strMachineText: 'Hartdrehmaschine', strCharNo: c.charNo, intCharType: 1, strCharTextEN: c.text,
      strUnit: c.unit, strPosition: c.pos, strRemark: c.remark, intOrderInGIP: 1, intOrderInIP: c.orderInIP, intInspectionPlanVersion: 7,
      decNominal: c.nom, decLTol: c.lt, decUTol: c.ut, value: r6(ev.part.vals[c.pos]),
      decLIntTol: null, decUIntTol: null, decLCL: c.lcl, decUCL: c.ucl,
      intSampleNo: ev.sampleNo, intSample: ev.sample, intTool: ev.tool, intPartNo: null, strUUID: ev.uuid,
      strGaugeNo: 'GEO-02.Datafile', strGageGroupNo: '300 300', datInspStart: ev.startLocal, Remark: null,
      intMeasurementNo: ev.sampleNo, intMeasurementNoSample: 1, intSampleData: ev.sample,
      datInspUTC: fmtTs(t), datInsp: ev.startLocal, decY: 0, strCharAll: `${c.orderInIP} - ${c.text} ${c.pos}`,
      strProcessAll: '0200/P_TURN', idtblSFS_CAQArchive_Specification: specId.get(c.pos), blnNoCAQ: 'TRUE', strRevision: 'B',
      strSampleRemark: ev.remark, strAcqType: '2',
    });
  }
}
function finalize(part) { part.vals = Object.fromEntries(plan.map((c) => [c.pos, c.f(part)])); return part; }

const ERST = 'Erstst<U+00FC>ckpr<U+00FC>fung', LETZT = 'Letztst<U+00FC>ckpr<U+00FC>fung';
const ERST_BAD = 'Erstst<U+00C3><U+00BC>ckpr<U+00C3><U+00BC>fung';
const nachmParts = [];
for (const o of ORD) {
  const t0 = parseTs(o.start);
  if (o.nachmOnly) {
    for (let i = 0; i < 5; i++) {
      const part = finalize(makePart(o, 0)), uuid = hex32();
      const ev = { part, sampleNo: 11 + i, sample: 11 + i, tool: 1, uuid, remark: 'Nachm GRAP', startLocal: o.start, utcMs: utcOf(t0) - 6300e3 + i * 14 * 60e3 };
      nachmParts.push(ev);
      emit(o, ev);
    }
    continue;
  }
  if (o.dupOf != null) {
    const own = finalize(makePart(o, 0));
    emit(o, { part: own, sampleNo: 11, sample: 11, tool: 1, uuid: hex32(), remark: `${LETZT} Nachm`, startLocal: o.start, utcMs: utcOf(t0) - 6300e3 });
    nachmParts.forEach((ev, i) => emit(o, Object.assign({}, ev, { sampleNo: 12 + i, sample: 12 + i, utcMs: ev.utcMs + 13000e3 + i * 20e3 })));
    continue;
  }
  const erst = [];
  for (let i = 0; i < 5; i++) {
    const part = finalize(makePart(o, o.el ? -o.el / 2 : -0.8)), uuid = hex32();
    const ev = o.erstOneSample
      ? { part, sampleNo: 1, sample: i + 1, tool: i + 1, uuid, remark: ERST, startLocal: o.start, utcMs: utcOf(t0) - 2300e3 + i * 14 * 60e3 }
      : { part, sampleNo: i + 1, sample: i + 1, tool: 1, uuid, remark: ERST, startLocal: o.start, utcMs: utcOf(t0) - 6300e3 + i * 14 * 60e3 };
    erst.push(ev);
    emit(o, ev);
  }
  const tL = t0 + (24 + Math.floor(rnd() * 30)) * 3600e3;
  const startL = fmtTs(tL);
  for (let i = 0; i < 5; i++) {
    const part = finalize(makePart(o, o.el ? o.el / 2 : 0.8));
    const sn = o.erstOneSample ? 7 + i : 6 + i;
    emit(o, { part, sampleNo: sn, sample: sn, tool: 1, uuid: hex32(), remark: LETZT, startLocal: startL, utcMs: utcOf(tL) - 1800e3 + i * 14 * 60e3 });
  }
  if (o.reimportErst) {
    const tr = utcOf(parseTs(o.reimportErst));
    erst.forEach((ev, i) => {
      const sn = o.erstOneSample ? 2 + i : 11 + i;
      emit(o, Object.assign({}, ev, { sampleNo: sn, sample: sn, tool: 1, remark: ERST_BAD, utcMs: tr + i * 15e3 }));
    });
  }
}

rows.sort((a, b) => a.intOrderInIP - b.intOrderInIP || a.strSAPOrder.localeCompare(b.strSAPOrder) || a.datInspUTC.localeCompare(b.datInspUTC));
const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const lines = [HEADER.map(q).join(';')];
for (const r of rows) lines.push(HEADER.map((h) => (r[h] === null || r[h] === undefined ? 'NA' : QUOTED.has(h) ? q(r[h]) : String(r[h]))).join(';'));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'ascii');
console.log(`${rows.length} Messwerte, ${plan.length} Merkmale, ${ORD.length} Fertigungsaufträge → ${OUT}`);
