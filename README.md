# Subtracteract

Analyse von **Steigungs- und BCD-Differenzen bei Kugelgewindetrieben**. Läuft komplett lokal im Browser: `index.html` öffnen, CAQ-Export hineinziehen. Es wird nichts hochgeladen, es gibt keinen Server und keine externen Bibliotheken.

| Schritt | Stand |
|---|---|
| 1 · Spindel charakterisieren | ✅ |
| 2 · Mutter charakterisieren | ✅ |
| 3 · Paarung (Differenzen Spindel ↔ Mutter je Fertigungsauftrag) | folgt |

## Benutzung

1. `index.html` im Browser öffnen (Chrome, Edge oder Firefox, Doppelklick genügt).
2. CAQ-Exporte (`.csv`) auf die Fläche ziehen, Spindel und Mutter gern gleichzeitig. Die App erkennt den Teiletyp an den Merkmalen und legt jede Datei im passenden Reiter ab (*1 · Spindel*, *2 · Mutter*). Mehrere Dateien je Teil werden zusammengeführt, doppelte Messwerte entfernt.
3. **Einlesebericht prüfen.** Dort stehen Material, Prozess, Zeitraum, Hinweise und die *Merkmalszuordnung* (wie die App jedes Merkmal verstanden hat).
4. Fertigungsaufträge auswählen bzw. ausschließen (Haken). Ausschlüsse merkt sich der Browser.
5. Spindel-Steckbrief, Diagramme, Auftragsvergleich und Kennwerte ansehen und bei Bedarf als CSV exportieren (Semikolon, Dezimalkomma, für Excel).

Zum Ausprobieren: `testdata/synthetisch_spindel_P_HEAT.csv` und `testdata/synthetisch_mutter_P_TURN.csv`.

**Bildschirme:** Die Oberfläche ist für Full HD (1920 px) und 32″-4K-Monitore ausgelegt (2560 px bei 150 % Skalierung, 3840 px bei 100 %). Ab 1600 px stehen die Diagramme nebeneinander, ab 2400 px auch Auftragsvergleich und Kennwerte. Schrift und Diagramme wachsen stufenweise mit (14 → 15 → 17 → 20 px Grundschrift). Auf schmalen Fenstern wird alles untereinander angeordnet.

## Auswertungslogik

- **Auswerteeinheit ist der Fertigungsauftrag (`strSAPOrder`) bzw. die Charge (`strBatchNo`).** Einzelteile (`intSampleNo`, `decY`) werden bewusst nicht unterschieden, weil später auf Batch-Ebene gepaart wird.
- Kennwerte je Merkmal: n, x̄, s, Min, Max. Ob ein Wert außerhalb der Toleranz liegt, wird **je Messwert mit dessen eigener Toleranz** bewertet. Ändert sich eine Toleranz innerhalb der Daten, erscheint ein Hinweis.
- Neben den einzelnen Aufträgen gibt es die gepoolte Auswertung über alle einbezogenen Aufträge.

### Teiletyp

Mutter = Prüfplantexte mit Kugelrillen „KR1…KR4“, Spindel = „Gang n“ bzw. Steigungsfenster „G1-G7“. Der Materialtext zählt nur als Zusatzhinweis (beim Mutter-Export steht dort nur die Nummer). Landet eine Datei trotzdem im falschen Reiter, meldet der Einlesebericht einen Fehler.

### Dubletten

- **Mit Teile-UUID** (`strUUID`, 32 Hex-Zeichen – Mutter-Export): gleiche UUID + gleiches Merkmal + identischer Wert = Re-Import. Gezählt wird nur der zuerst gemessene Eintrag. Steht dasselbe Teil in zwei Fertigungsaufträgen, gibt es eine Warnung mit beiden Auftragsnummern. Abweichende Werte bei gleicher UUID werden beide ausgewertet und gemeldet.
- **Ohne Teile-UUID** (Spindel; die Härteproben-IDs wie `90010008_1` sind keine Teile-IDs): gleicher Wert, gleiches Merkmal, gleiche Stichprobe, gleicher Zeitpunkt.

### Merkmalszuordnung Spindel

Maßgeblich sind `strPosition` und `strCharTextEN`. Der Prüfplantext (`strRemark`) wird nur für die Steigungsfenster gelesen und sonst gegengeprüft, weil er im Export Kopierfehler enthält (z. B. steht bei `432.14.GN` „BCD GG Gang 14“).

| Gruppe | Regel | Beispiel |
|---|---|---|
| BCD | `diameter` mit Position `NNN.GG.Gx`; mittlere Zahl = Gang; `GG` = Gauss, `GN` = Hüll, `GX` = Pferch | `432.02.GN` → BCD Hüll, Gang 2 |
| Steigung | `length` mit Fenster `G<a>-G<b>` im Prüfplantext; Steigung je Gang = Länge / (b − a) | `404.5` „Steigung G5-G11“ → 6 Gänge |
| Zylindrizität | `cylindricity`; Positionsendung = Gang, ohne Endung = Gewinde gesamt | `449.09`, `448` |
| Rändel / Lage | `diameter`, `roundness`, `concentricity`, `runout`, `total runout` ohne BCD-Muster | `400`–`434` |
| Wärmebehandlung | `surface hardness`, `case hardness depth` | `SH1`, `CHD1` |

### Merkmalszuordnung Mutter

| Gruppe | Regel | Beispiel |
|---|---|---|
| BCD | `diameter` mit „BCD“ im Prüfplantext und Position `NNN[.k].Gx`; `k` = Kugelrille KRk, ohne `k` = Zylinder gesamt | `713.3.GN` → BCD Hüll, KR3; `713.GG` → Zylinder |
| BCD-Kennzahlen | „BCD Range …“ und „… (wie 713.1.GG)“ – Spannen bzw. Kopien mit eigener Toleranz, nicht im Profil | `842`, `842.GG`, `892.GG`, `884` |
| Steigung | `distance`/`length` mit „Steigung (KRa-KRb)“; Gangzahl aus dem Nennmaß (kleinstes Fenster = 1 Gang) | `748` KR1–KR4 = 6 Gänge, `748.1` KR1–KR2 = 1 Gang |
| Lage der KR | aus den Steigungsfenstern abgeleitet, KR1 = Gang 1 | KR1 = 1, KR2 = 2, KR3 = 6, KR4 = 7 |
| Zylindrizität Gewinde | `cylindricity` mit „Gew“ im Prüfplantext | `792.1` … `792.4`, `793` |
| übrige | nach Merkmalsart: Durchmesser, Längen/Abstände/Radien, Form, Lage/Koaxialität/Versatz, Lauf/Richtung/Winkel | `707.1.GG` Außen-ø ist **kein** BCD |

### Steckbrief (Spindel / Mutter)

| Kennwert | Spindel | Mutter |
|---|---|---|
| BCD Gauss x̄ | Mittel aller Gauss-Werte über alle Gänge | Gauss-Mittel des Zylinders (`713.GG`, = Mittel der KR) |
| BCD-Verlauf | Spanne der Gang-Mittelwerte (Gauss) | Spanne der KR-Mittelwerte (Gauss) |
| Hüll − Pferch x̄ | Mittel je Gang | Mittel je KR, dazu der Zylinder gesamt |
| Steigung p̄ | Mittel der Fenster mit der größten Gangzahl, je Gang | aus dem 6-Gang-Fenster KR1–KR4, je Gang |
| Steigung zwischen Fenstern / Einzelgänge | Spanne der Fenstermittel (G1–G7, G5–G11, G9–G15) | Spanne KR1–KR2 vs. KR3–KR4 (je 1 Gang) |
| Gewinde: Werte außerhalb Toleranz | Steigung, BCD, BCD-Kennzahlen, Zylindrizität Gewinde; die Zahl für alle Merkmale steht daneben | ebenso |

## Erwartetes Dateiformat

CAQ-Export, eine Zeile je Messwert. Erkannt bzw. verarbeitet wird Folgendes:

- Trennzeichen `;`, `,` oder Tab (automatisch); Dezimalpunkt oder Dezimalkomma
- Kodierung UTF-8 oder Windows-1252; R-Maskierungen wie `<U+00E4>` werden zu „ä“
- fehlende Werte als `NA` oder leer; einseitige Toleranzen über `decLTol = NA`
- Pflichtspalten: `strSAPOrder` (oder `strInspectionOrder`), `strCharTextEN`, `strPosition`, `value`
- **Bitte den Original-Export verwenden, nicht eine in Excel gespeicherte Fassung.** Excel macht aus der Position `404.1` den Wert `404,1` und aus `449.10` den Wert `449,1`. Das Erste erkennt die App und warnt, das Zweite lässt sich nicht zurückrechnen.

## Daten und Datenschutz

Das Repository ist öffentlich. **Echte CAQ-Exporte gehören nicht hierher.** `.gitignore` schließt alle `*.csv` außerhalb von `testdata/` aus.

Die Testdaten werden deterministisch erzeugt; alle Kennungen darin sind erfunden:

- `testdata/synthetisch_spindel_P_HEAT.csv` aus `tools/generate-synthetic.js`. Die Merkmalsstruktur entspricht dem echten Prüfplan; übernommen sind dessen Eigenheiten: fehlerhafte Prüfplantexte, ein von Hand nachgetragener Messwert, die Zeitumstellung.
- `testdata/synthetisch_mutter_P_TURN.csv` aus `tools/generate-synthetic-mutter.js`. Sie enthält nur eine Auswahl von 45 der 338 Merkmale (Gewinde und einige Gegenbeispiele). Übernommen sind die Eigenheiten des echten Exports: Re-Importe mit doppelt kodierten Umlauten, dieselben Teile in zwei Aufträgen, ein Auftrag mit nur einem eigenen Teil, `.GG`-Durchmesser ohne BCD.

```bash
node tools/generate-synthetic.js
```

```bash
node tools/generate-synthetic-mutter.js
```

## Tests

```bash
node tests/run-tests.js
```

Geprüft wird der Kern aus `index.html` (`<script id="core">`): CSV, Kodierung, Zahlen, Teiletyp, Zuordnung Spindel und Mutter, Kennwerte, Dubletten (auch über Teile-UUID), Excel-Variante und Export. Optional lässt sich ein echter Export lokal mitprüfen, ohne dass er ins Repository gelangt:

```bash
CAQ_REAL=/pfad/spindel.csv CAQ_REAL_NUT=/pfad/mutter.csv node tests/run-tests.js
```

## Aufbau

```
index.html                  App (Kern + Oberfläche, eine Datei)
testdata/                   synthetische Beispieldaten
tools/generate-synthetic*.js Generatoren für die Beispieldaten (Spindel, Mutter)
tests/run-tests.js          Tests für den Kern (Node, ohne Abhängigkeiten)
```
