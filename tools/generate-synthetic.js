#!/usr/bin/env node
/*
 * Erzeugt einen synthetischen CAQ-Export für die Spindel – gleiches Format wie der
 * echte Export (50 Spalten, ";" getrennt, R-Stil: NA, FALSE, <U+00E4>-Umlaute).
 *
 * Alle Kennungen (Material, Aufträge, Chargen, Maschine, Messmittel) sind erfunden.
 * Die Merkmalsstruktur (Positionen, Gänge, Gauss/Hüll/Pferch, Steigungsfenster)
 * entspricht dem echten Prüfplan, damit der Parser realistisch getestet wird.
 * Bewusst übernommene Eigenheiten des echten Exports:
 *   - Prüfplantexte bei 432.14.GN/GX und 463.16.GN/GX lauten "BCD GG Gang …"
 *   - Prüfplantext von 448 (Zylindrizität gesamt) lautet "Summenplanlauf …"
 *   - eine von Hand nachgetragene Messwertgruppe (strGaugeNo = NA)
 *   - Zeitumstellung am 25.10.2026 (UTC-Versatz 2 h → 1 h)
 *
 * Aufruf:  node tools/generate-synthetic.js [ausgabe.csv]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || path.join(__dirname, '..', 'testdata', 'synthetisch_spindel_P_HEAT.csv');

// ---------- deterministischer Zufall ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261107);
function gauss(mu = 0, sd = 1) {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const r3 = (x) => Math.round(x * 1000) / 1000;
const num = (x) => (x === null || x === undefined ? 'NA' : String(x));

// ---------- Prüfplan ----------
const HEADER = ['strMaterialNo', 'strMaterialtext', 'strInspectionOrder', 'strSAPOrder', 'strOrdertype', 'strProcessNo', 'strProcess', 'strSiteNo', 'strBatchNo', 'strMachineNo', 'strMachineText', 'strCharNo', 'intCharType', 'strCharTextEN', 'strUnit', 'strPosition', 'strRemark', 'intOrderInGIP', 'intOrderInIP', 'intInspectionPlanVersion', 'decNominal', 'decLTol', 'decUTol', 'value', 'decLIntTol', 'decUIntTol', 'decLCL', 'decUCL', 'intSampleNo', 'intSample', 'intTool', 'intPartNo', 'strUUID', 'strGaugeNo', 'strGageGroupNo', 'datInspStart', 'Remark', 'intMeasurementNo', 'intMeasurementNoSample', 'intSampleData', 'datInspUTC', 'datInsp', 'decY', 'strCharAll', 'strProcessAll', 'idtblSFS_CAQArchive_Specification', 'blnNoCAQ', 'strRevision', 'strSampleRemark', 'strAcqType'];
// Spalten, die als Text (in Anführungszeichen) geschrieben werden – wie im echten Export
const QUOTED = new Set(['strMaterialNo', 'strMaterialtext', 'strInspectionOrder', 'strSAPOrder', 'strOrdertype', 'strProcessNo', 'strProcess', 'strSiteNo', 'strBatchNo', 'strMachineNo', 'strMachineText', 'strCharNo', 'strCharTextEN', 'strUnit', 'strPosition', 'strRemark', 'strUUID', 'strGaugeNo', 'strGageGroupNo', 'Remark', 'strCharAll', 'strProcessAll', 'strRevision', 'strAcqType']);

const BCD_GANGS = [1, 2, 3, 8, 9, 14, 15, 16, 17];
const HP_GANGS = [2, 9, 14, 16, 17];          // Gänge mit Hüll/Pferch
// mittleres BCD-Profil (Abweichung vom Nennmaß in µm)
const BCD_PROFILE = { 1: 5.5, 2: 7.5, 3: 4.8, 8: 4.6, 9: 3.8, 14: 3.3, 15: 3.4, 16: 0, 17: -5 };
const LEAD = [ // Länge über 6 Gänge
  { pos: '404.1', from: 1, to: 7, dev: 2.4 },
  { pos: '404.5', from: 5, to: 11, dev: -3.4 },
  { pos: '404.9', from: 9, to: 15, dev: -0.3 },
];

const plan = [];
let ip = 2;
const add = (c) => plan.push(Object.assign({ orderInIP: ip++ }, c));
add({ charNo: '1043', text: 'surface hardness', unit: 'HV1', pos: 'SH1', remark: 'Oberfl<U+00E4>chenh<U+00E4>rte HV1 // je Ofenkammer (=Nest) ein Teil pr<U+00FC>fen', nom: 680, lt: 680, ut: 780, kind: 'sh' });
add({ charNo: '1317', text: 'case hardness depth', unit: 'mm', pos: 'CHD1', remark: 'CHD 550 HV0,3 // je 10 Ofenkammer-Chargen eine Pr<U+00FC>fung', nom: 0.15, lt: 0.15, ut: 0.35, kind: 'chd' });
add({ charNo: '1041', text: 'diameter', unit: 'mm', pos: '400', remark: 'R<U+00E4>ndel-<U+00F8>', nom: 10, lt: 9.95, ut: 10.06, kind: 'knurl' });
add({ charNo: '1080', text: 'roundness', unit: 'mm', pos: '401', remark: 'Rundheit R<U+00E4>ndel', nom: 0, lt: null, ut: 0.06, kind: 'round' });
add({ charNo: '1918', text: 'concentricity', unit: 'mm', pos: '402', remark: 'Konz R<U+00E4>ndel zu Gewinde (A-B)', nom: 0, lt: null, ut: 0.06, kind: 'conc' });
add({ charNo: '1046', text: 'runout', unit: 'mm', pos: '408', remark: 'Rundlauf Mitte Gewinde zu A-B', nom: 0, lt: null, ut: 0.03, kind: 'runout' });
add({ charNo: '1143', text: 'total runout', unit: 'mm', pos: '434', remark: 'Summenplanlauf zu Gewinde A-B', nom: 0, lt: null, ut: 0.03, kind: 'trunout' });
add({ charNo: '1106', text: 'cylindricity', unit: 'mm', pos: '448', remark: 'Summenplanlauf zu Gewinde A-B', nom: 0, lt: null, ut: 0.03, kind: 'cyltot' }); // Text bewusst falsch (wie im Original)
for (const g of BCD_GANGS) {
  const zone = g >= 16 ? '463' : '432';
  const gg = String(g).padStart(2, '0');
  const tolGG = g >= 16 ? [16.485, 16.515] : [16.49, 16.52];
  const tolHP = g >= 16 ? [16.48, 16.52] : [16.485, 16.525];
  add({ charNo: '1041', text: 'diameter', unit: 'mm', pos: `${zone}.${gg}.GG`, remark: `BCD GG Gang ${g}`, nom: 16.5, lt: tolGG[0], ut: tolGG[1], kind: 'bcd', fit: 'GG', gang: g });
  if (HP_GANGS.includes(g)) {
    const wrong = g === 14 || g === 16; // Prüfplantext wie im Original fehlerhaft
    add({ charNo: '1041', text: 'diameter', unit: 'mm', pos: `${zone}.${gg}.GN`, remark: `BCD ${wrong ? 'GG' : 'GN'} Gang ${g}`, nom: 16.5, lt: tolHP[0], ut: tolHP[1], kind: 'bcd', fit: 'GN', gang: g });
    add({ charNo: '1041', text: 'diameter', unit: 'mm', pos: `${zone}.${gg}.GX`, remark: `BCD ${wrong ? 'GG' : 'GX'} Gang ${g}`, nom: 16.5, lt: tolHP[0], ut: tolHP[1], kind: 'bcd', fit: 'GX', gang: g });
  }
}
for (const g of BCD_GANGS) {
  add({ charNo: '1106', text: 'cylindricity', unit: 'mm', pos: `449.${String(g).padStart(2, '0')}`, remark: `Zyl Einzelgang ${g}`, nom: 0, lt: null, ut: 0.015, kind: 'cylg', gang: g });
}
for (const w of LEAD) {
  add({ charNo: '1014', text: 'length', unit: 'mm', pos: w.pos, remark: `Steigung G${w.from}-G${w.to}`, nom: 17.4, lt: 17.395, ut: 17.413, kind: 'lead', win: w });
}

// ---------- Fertigungsaufträge ----------
const ORDERS = [
  { start: '2026-08-11 14:02:10' }, { start: '2026-08-19 09:41:55' }, { start: '2026-08-27 16:20:03' },
  { start: '2026-09-04 10:12:47' }, { start: '2026-09-15 13:55:21', bcdShift: 9 },
  { start: '2026-09-24 08:33:09', leadShift: -2.5 }, { start: '2026-10-02 15:07:40' },
  { start: '2026-10-13 11:48:12', cylOutlier: true }, { start: '2026-10-22 17:26:30', manualEntry: true },
  { start: '2026-10-29 09:15:58' },
].map((o, i) => Object.assign(o, {
  order: String(90010001 + i * 7),
  batch: String(7100201 + i * 3),
  bcdOff: gauss(0, 2.2),
  leadOff: gauss(0, 0.9),
}));

// ---------- Zeit ----------
function parseTs(s) { const [d, t] = s.split(' '); const [y, m, dd] = d.split('-').map(Number); const [H, M, S] = t.split(':').map(Number); return Date.UTC(y, m - 1, dd, H, M, S); }
function fmtTs(ms) { return new Date(ms).toISOString().slice(0, 19).replace('T', ' '); }
const DST_END_LOCAL = parseTs('2026-10-25 03:00:00');
const utcOf = (localMs) => localMs - (localMs >= DST_END_LOCAL ? 1 : 2) * 3600e3;

// ---------- Messwerte ----------
const rows = [];
let specId = 5000101;
const specIds = new Map(plan.map((c) => [c.pos, specId++]));

function baseRow(o, c) {
  return {
    strMaterialNo: '9990001', strMaterialtext: 'Bauteil Spindel Beispiel - synthetisch',
    strInspectionOrder: `${o.order}/0100/P_HEAT`, strSAPOrder: o.order, strOrdertype: 'SPC',
    strProcessNo: '0100', strProcess: 'P_HEAT', strSiteNo: '1000', strBatchNo: o.batch,
    strMachineNo: '90001', strMachineText: 'OFEN 1', strCharNo: c.charNo, intCharType: 1,
    strCharTextEN: c.text, strUnit: c.unit, strPosition: c.pos, strRemark: c.remark,
    intOrderInGIP: 1, intOrderInIP: c.orderInIP, intInspectionPlanVersion: 3,
    decNominal: c.nom, decLTol: c.lt, decUTol: c.ut,
    decLIntTol: null, decUIntTol: null, decLCL: null, decUCL: null,
    intPartNo: null, strUUID: '', Remark: '',
    strCharAll: `${c.orderInIP} - ${c.text} ${c.pos}`, strProcessAll: '0100/P_HEAT',
    idtblSFS_CAQArchive_Specification: specIds.get(c.pos), blnNoCAQ: 'FALSE', strRevision: 'A',
    strSampleRemark: null, strAcqType: 'R',
  };
}

for (const o of ORDERS) {
  const t0 = parseTs(o.start);
  // Geometrie: 2 Stichproben × 5 Teile, Messung ca. 16 h nach Prüfbeginn
  for (let s = 1; s <= 2; s++) {
    const parts = [];
    for (let k = 0; k < 5; k++) {
      const p = { bcd: {}, hp: {}, cyl: {}, lead: {} };
      const partOff = gauss(0, 1.8);
      for (const g of BCD_GANGS) {
        const out = o.cylOutlier && k === 2 && s === 1 && g === 17;
        p.bcd[g] = 16.5 + (BCD_PROFILE[g] + (o.bcdShift || 0) + o.bcdOff + partOff + gauss(0, 1.1)) / 1000;
        p.hp[g] = (13 + (g >= 16 ? 1.5 : 0) + gauss(0, 2.6) + (out ? 45 : 0)) / 1000;
        p.cyl[g] = Math.max(0.003, 0.0035 + p.hp[g] * 0.42 + gauss(0, 0.0012));
      }
      for (const w of LEAD) p.lead[w.pos] = 17.4 + (w.dev + o.leadOff + (w.from === 5 ? (o.leadShift || 0) : 0) + gauss(0, 1.6)) / 1000;
      p.cylTot = Math.max(...Object.values(p.cyl)) + rnd() * 0.011;
      p.knurl = 10.025 + gauss(0, 0.008);
      p.round = Math.max(0.002, 0.006 + gauss(0, 0.0025));
      p.conc = Math.max(0.002, 0.02 + gauss(0, 0.009));
      p.runout = Math.max(0.004, 0.011 + gauss(0, 0.0025));
      p.trunout = Math.max(0.003, 0.01 + gauss(0, 0.0035));
      parts.push(p);
    }
    let t = t0 + 16 * 3600e3 + (s - 1) * 4 * 60e3 + Math.floor(rnd() * 600) * 1e3;
    for (const c of plan) {
      if (c.kind === 'sh' || c.kind === 'chd') continue;
      t += (7 + Math.floor(rnd() * 4)) * 1e3;
      const manual = o.manualEntry && s === 2 && c.pos === '432.01.GG';
      const tLocal = manual ? t + 3e3 : t;
      parts.forEach((p, k) => {
        let v;
        switch (c.kind) {
          case 'bcd': v = c.fit === 'GG' ? p.bcd[c.gang] : p.bcd[c.gang] + (c.fit === 'GN' ? 1 : -1) * (p.hp[c.gang] / 2 + gauss(0, 0.0005)); break;
          case 'cylg': v = p.cyl[c.gang]; break;
          case 'lead': v = p.lead[c.pos]; break;
          case 'cyltot': v = p.cylTot; break;
          default: v = p[c.kind];
        }
        const r = baseRow(o, c);
        Object.assign(r, {
          value: r3(v), intSampleNo: s, intSample: s, intTool: 1,
          strGaugeNo: manual ? null : 'GEO-01.Datafile', strGageGroupNo: manual ? null : '300 300',
          datInspStart: o.start, intMeasurementNo: k + 1, intMeasurementNoSample: k + 1, intSampleData: k + 1,
          datInspUTC: fmtTs(utcOf(tLocal)), datInsp: fmtTs(tLocal), decY: k + 1,
        });
        rows.push(r);
      });
    }
  }
  // Wärmebehandlung: Oberflächenhärte je Ofenkammer (Werkzeug 1–6), CHD stichprobenartig
  const nSH = 4 + Math.floor(rnd() * 3);
  for (let i = 1; i <= nSH; i++) {
    const c = plan[0];
    const tl = t0 + i * 47 * 60e3;
    const r = baseRow(o, c);
    Object.assign(r, {
      value: Math.round(gauss(741, 14)), intSampleNo: i, intSample: i, intTool: ((i - 1) % 6) + 1,
      strUUID: `${o.order}_${i}`, strGaugeNo: 'HV-01', strGageGroupNo: '550 550', datInspStart: fmtTs(tl),
      intMeasurementNo: i, intMeasurementNoSample: 1, intSampleData: i, datInspUTC: fmtTs(utcOf(tl + 20e3)), datInsp: fmtTs(tl + 20e3), decY: 1,
    });
    rows.push(r);
  }
  const nCHD = 1 + Math.floor(rnd() * 2);
  for (let i = 1; i <= nCHD; i++) {
    const c = plan[1];
    const tl = t0 + (5 + i) * 3600e3;
    const r = baseRow(o, c);
    Object.assign(r, {
      value: r3(gauss(0.238, 0.014)), intSampleNo: i, intSample: i, intTool: i + 1,
      strUUID: `${o.order}_${40 + i}`, strGaugeNo: 'CHD-01', strGageGroupNo: '550 550', datInspStart: fmtTs(tl),
      intMeasurementNo: i, intMeasurementNoSample: 1, intSampleData: i, datInspUTC: fmtTs(utcOf(tl + 30e3)), datInsp: fmtTs(tl + 30e3), decY: 1,
    });
    rows.push(r);
  }
}

// Sortierung wie im Original: Merkmal → Messung → Auftrag
rows.sort((a, b) => a.intOrderInIP - b.intOrderInIP || a.intSampleNo - b.intSampleNo || a.decY - b.decY || a.strSAPOrder.localeCompare(b.strSAPOrder));

const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const lines = [HEADER.map(q).join(';')];
for (const r of rows) {
  lines.push(HEADER.map((h) => {
    const v = r[h];
    if (v === null || v === undefined) return 'NA';
    return QUOTED.has(h) ? q(v) : num(v);
  }).join(';'));
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'ascii');
console.log(`${rows.length} Messwerte, ${ORDERS.length} Fertigungsaufträge → ${OUT}`);
