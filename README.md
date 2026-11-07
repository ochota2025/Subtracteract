# Subtracteract

Analyse von **Steigungs- und BCD-Differenzen bei Kugelgewindetrieben**. Läuft komplett lokal im Browser: `index.html` öffnen, CAQ-Export hineinziehen. Es wird nichts hochgeladen, es gibt keinen Server und keine externen Bibliotheken.

| Schritt | Stand |
|---|---|
| 1 · Spindel charakterisieren | ✅ dieser Stand |
| 2 · Mutter charakterisieren | folgt |
| 3 · Paarung (Differenzen Spindel ↔ Mutter je Fertigungsauftrag) | folgt |

## Benutzung

1. `index.html` im Browser öffnen (Chrome, Edge oder Firefox, Doppelklick genügt).
2. CAQ-Export der Spindel (`.csv`) auf die Fläche ziehen. Mehrere Dateien sind möglich: Sie werden zusammengeführt, und doppelte Messwerte werden entfernt.
3. **Einlesebericht prüfen.** Dort stehen Material, Prozess, Zeitraum, Hinweise und die *Merkmalszuordnung* (wie die App jedes Merkmal verstanden hat).
4. Fertigungsaufträge auswählen bzw. ausschließen (Haken). Ausschlüsse merkt sich der Browser.
5. Spindel-Steckbrief, Diagramme, Auftragsvergleich und Kennwerte ansehen und bei Bedarf als CSV exportieren (Semikolon, Dezimalkomma, für Excel).

Zum Ausprobieren: `testdata/synthetisch_spindel_P_HEAT.csv`.

**Bildschirme:** Die Oberfläche ist für Full HD (1920 px) und 32″-4K-Monitore ausgelegt (2560 px bei 150 % Skalierung, 3840 px bei 100 %). Ab 1600 px stehen die Diagramme nebeneinander, ab 2400 px auch Auftragsvergleich und Kennwerte. Schrift und Diagramme wachsen stufenweise mit (14 → 15 → 17 → 20 px Grundschrift). Auf schmalen Fenstern wird alles untereinander angeordnet.

## Auswertungslogik

- **Auswerteeinheit ist der Fertigungsauftrag (`strSAPOrder`) bzw. die Charge (`strBatchNo`).** Einzelteile (`intSampleNo`, `decY`) werden bewusst nicht unterschieden, weil später auf Batch-Ebene gepaart wird.
- Kennwerte je Merkmal: n, x̄, s, Min, Max. Ob ein Wert außerhalb der Toleranz liegt, wird **je Messwert mit dessen eigener Toleranz** bewertet. Ändert sich eine Toleranz innerhalb der Daten, erscheint ein Hinweis.
- Neben den einzelnen Aufträgen gibt es die gepoolte Auswertung über alle einbezogenen Aufträge.

### Merkmalszuordnung

Maßgeblich sind `strPosition` und `strCharTextEN`. Der Prüfplantext (`strRemark`) wird nur für die Steigungsfenster gelesen und sonst gegengeprüft, weil er im Export Kopierfehler enthält (z. B. steht bei `432.14.GN` „BCD GG Gang 14“).

| Gruppe | Regel | Beispiel |
|---|---|---|
| BCD | `diameter` mit Position `NNN.GG.Gx`; mittlere Zahl = Gang; `GG` = Gauss, `GN` = Hüll, `GX` = Pferch | `432.02.GN` → BCD Hüll, Gang 2 |
| Steigung | `length` mit Fenster `G<a>-G<b>` im Prüfplantext; Steigung je Gang = Länge / (b − a) | `404.5` „Steigung G5-G11“ → 6 Gänge |
| Zylindrizität | `cylindricity`; Positionsendung = Gang, ohne Endung = Gewinde gesamt | `449.09`, `448` |
| Rändel / Lage | `diameter`, `roundness`, `concentricity`, `runout`, `total runout` ohne BCD-Muster | `400`–`434` |
| Wärmebehandlung | `surface hardness`, `case hardness depth` | `SH1`, `CHD1` |

### Spindel-Steckbrief

| Kennwert | Bedeutung |
|---|---|
| BCD Gauss x̄ | Mittel aller Gauss-Werte über alle Gänge |
| BCD-Verlauf über Gänge | Spanne der Gang-Mittelwerte (Gauss) – zeigt Konizität / Verlauf |
| Hüll − Pferch x̄ | mittlere Differenz Hüll − Pferch über die Gänge mit beiden Werten |
| Steigung p̄ | Mittel der Fenstersteigungen (Länge / Gänge) |
| Steigung zwischen Fenstern | Spanne der Fenstermittel (z. B. G1–G7 vs. G5–G11) |

## Erwartetes Dateiformat

CAQ-Export, eine Zeile je Messwert. Erkannt bzw. verarbeitet wird Folgendes:

- Trennzeichen `;`, `,` oder Tab (automatisch); Dezimalpunkt oder Dezimalkomma
- Kodierung UTF-8 oder Windows-1252; R-Maskierungen wie `<U+00E4>` werden zu „ä“
- fehlende Werte als `NA` oder leer; einseitige Toleranzen über `decLTol = NA`
- Pflichtspalten: `strSAPOrder` (oder `strInspectionOrder`), `strCharTextEN`, `strPosition`, `value`
- **Bitte den Original-Export verwenden, nicht eine in Excel gespeicherte Fassung.** Excel macht aus der Position `404.1` den Wert `404,1` und aus `449.10` den Wert `449,1`. Das Erste erkennt die App und warnt, das Zweite lässt sich nicht zurückrechnen.

## Daten und Datenschutz

Das Repository ist öffentlich. **Echte CAQ-Exporte gehören nicht hierher.** `.gitignore` schließt alle `*.csv` außerhalb von `testdata/` aus.

`testdata/synthetisch_spindel_P_HEAT.csv` wird von `tools/generate-synthetic.js` erzeugt (deterministisch). Alle Kennungen darin sind erfunden. Die Merkmalsstruktur entspricht dem echten Prüfplan, und bewusst übernommen sind dessen Eigenheiten: fehlerhafte Prüfplantexte, ein von Hand nachgetragener Messwert und die Zeitumstellung.

```bash
node tools/generate-synthetic.js
```

## Tests

```bash
node tests/run-tests.js
```

Geprüft wird der Kern aus `index.html` (`<script id="core">`): CSV, Kodierung, Zahlen, Zuordnung, Kennwerte, Dubletten, Excel-Variante und Export. Optional lässt sich ein echter Export lokal mitprüfen, ohne dass er ins Repository gelangt:

```bash
CAQ_REAL=/pfad/zum/export.csv node tests/run-tests.js
```

## Aufbau

```
index.html                  App (Kern + Oberfläche, eine Datei)
testdata/                   synthetische Beispieldaten
tools/generate-synthetic.js Generator für die Beispieldaten
tests/run-tests.js          Tests für den Kern (Node, ohne Abhängigkeiten)
```
