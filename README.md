# Subtracteract

Analyse von **Steigungs- und BCD-Differenzen bei Kugelgewindetrieben**. Läuft komplett lokal im Browser: `index.html` öffnen, CAQ-Export hineinziehen. Es wird nichts hochgeladen, es gibt keinen Server und keine externen Bibliotheken.

**Ausgewertet und dargestellt werden nur BCD und Steigung.** Alle anderen Merkmale der Exporte (Härte, Rändel, Form, Lage, sonstige Durchmesser, BCD-Spannen …) werden beim Einlesen ignoriert. Der Einlesebericht nennt nur ihre Anzahl.

| Schritt | Stand |
|---|---|
| 1 · Spindel charakterisieren | ✅ |
| 2 · Mutter charakterisieren | ✅ |
| 3 · Paarung (Matrix aller Spindel- × Mutter-Aufträge, ΔBCD und ΔSteigung) | ✅ |

## Benutzung

1. `index.html` im Browser öffnen (Chrome, Edge oder Firefox, Doppelklick genügt).
2. CAQ-Exporte (`.csv`) auf die Fläche ziehen, Spindel und Mutter gern gleichzeitig. Die App erkennt den Teiletyp an den Merkmalen und legt jede Datei im passenden Reiter ab (*1 · Spindel*, *2 · Mutter*). Mehrere Dateien je Teil werden zusammengeführt, doppelte Messwerte entfernt.
3. **Einlesebericht prüfen.** Dort stehen Material, Prozess, Zeitraum, Hinweise und die *Merkmalszuordnung* (wie die App jedes Merkmal verstanden hat).
4. Fertigungsaufträge auswählen bzw. ausschließen (Haken). Ausschlüsse merkt sich der Browser.
5. Steckbrief, Diagramme, Auftragsvergleich und Kennwerte ansehen und bei Bedarf als CSV exportieren (Semikolon, Dezimalkomma, für Excel).
6. Reiter *3 · Paarung*: Matrix aller einbezogenen Spindel-Aufträge gegen alle einbezogenen Mutter-Aufträge. Eine Zelle anklicken, um das Paar im Detail zu sehen. Die Matrix lässt sich als CSV exportieren.

Zum Ausprobieren: `testdata/synthetisch_spindel_P_HEAT.csv` und `testdata/synthetisch_mutter_P_TURN.csv`.

**Bildschirme:** Die Oberfläche ist für Full HD (1920 px) und 32″-4K-Monitore ausgelegt (2560 px bei 150 % Skalierung, 3840 px bei 100 %). Ab 1600 px stehen die Diagramme nebeneinander, ab 2400 px auch Auftragsvergleich und Kennwerte. Schrift und Diagramme wachsen stufenweise mit (14 → 15 → 17 → 20 px Grundschrift). Auf schmalen Fenstern wird alles untereinander angeordnet.

## Auswertungslogik

- **Auswerteeinheit ist der Fertigungsauftrag (`strSAPOrder`) bzw. die Charge (`strBatchNo`).** Einzelteile (`intSampleNo`, `decY`) werden bewusst nicht unterschieden, weil später auf Batch-Ebene gepaart wird.
- Kennwerte je Merkmal: n, x̄, s, Min, Max. Ob ein Wert außerhalb der Toleranz liegt, wird **je Messwert mit dessen eigener Toleranz** bewertet. Ändert sich eine Toleranz innerhalb der Daten, erscheint ein Hinweis.
- Neben den einzelnen Aufträgen gibt es die gepoolte Auswertung über alle einbezogenen Aufträge.

### Teiletyp

Mutter = Prüfplantexte mit Kugelrillen „KR1…KR4“, Spindel = „Gang n“ bzw. Steigungsfenster „G1-G7“. Der Materialtext zählt nur als Zusatzhinweis (beim Mutter-Export steht dort nur die Nummer). Landet eine Datei trotzdem im falschen Reiter, meldet der Einlesebericht einen Fehler.

### Dubletten

1. **Exakt gleiche Zeilen**, also dieselbe Messung in mehreren Dateien oder überlappenden Exporten (gleicher Auftrag, gleiches Merkmal, gleiche Stichprobe, gleicher Zeitpunkt, gleicher Wert): Sie werden still entfernt (Hinweis).
2. **Re-Import** (nur mit echter Teile-UUID `strUUID`, 32 Hex-Zeichen – Mutter-Export): Eine Messung (UUID + Auftrag + Stichprobe), deren Werte **alle** einer früheren Messung desselben Teils gleichen, fällt weg. Gezählt wird die zuerst gemessene. Weichen die Werte ab, gilt sie als Nachmessung. Dann bleiben beide Messungen, und es erscheint eine Warnung.
3. **Teile in mehreren Fertigungsaufträgen** sind nicht eindeutig zuordenbar und werden ganz verworfen (Vorgabe). Bleibt ein Auftrag danach leer, entfällt er.

Die Härteproben-IDs der Spindel (z. B. `90010008_1`) sind keine Teile-IDs und laufen nur durch Stufe 1.

### Merkmalszuordnung Spindel

Maßgeblich sind `strPosition` und `strCharTextEN`. Der Prüfplantext (`strRemark`) wird nur für die Steigungsfenster gelesen und sonst gegengeprüft, weil er im Export Kopierfehler enthält (z. B. steht bei `432.14.GN` „BCD GG Gang 14“).

| Gruppe | Regel | Beispiel |
|---|---|---|
| BCD | `diameter` mit Position `NNN.GG.Gx`; mittlere Zahl = Gang; `GG` = Gauss, `GN` = Hüll, `GX` = Pferch | `432.02.GN` → BCD Hüll, Gang 2 |
| Steigung | `length` mit Fenster `G<a>-G<b>` im Prüfplantext; Steigung je Gang = Länge / (b − a) | `404.5` „Steigung G5-G11“ → 6 Gänge |
| ignoriert | alles andere (Zylindrizität, Rändel/Lage, Wärmebehandlung …) | `448`, `449.xx`, `400`–`434`, `SH1`, `CHD1` |

### Merkmalszuordnung Mutter

| Gruppe | Regel | Beispiel |
|---|---|---|
| BCD | `diameter` mit „BCD“ im Prüfplantext und Position `NNN[.k].Gx`; `k` = Kugelrille KRk, ohne `k` = Zylinder gesamt | `713.3.GN` → BCD Hüll, KR3; `713.GG` → Zylinder |
| Lage der KR | Die Mutter hat 4 Gänge: KR1…KR4 = Gang 1…4 der Mutter | |
| Steigung | `distance`/`length` mit „Steigung (KRa-KRb)“; verglichen über die Nennlänge (keine Gangzahl nötig) | `748` KR1–KR4 (17,4 mm), `748.1` KR1–KR2 und `748.2` KR3–KR4 (je 2,9 mm) |
| ignoriert | „BCD Range …“, Kopien „… (wie 713.1.GG)“ und alle übrigen Merkmale | `842`, `884`, `707.1.GG` (Außen-ø – **kein** BCD), `792.x` |

### Steckbrief (Spindel / Mutter)

| Kennwert | Spindel | Mutter |
|---|---|---|
| BCD Gauss x̄ | Mittel aller Gauss-Werte über alle Gänge | Gauss-Mittel des Zylinders (`713.GG`, = Mittel der KR) |
| BCD-Verlauf | Spanne der Gang-Mittelwerte (Gauss) | Spanne der KR-Mittelwerte (Gauss) |
| Hüll − Pferch x̄ | Mittel je Gang | Mittel je KR, dazu der Zylinder gesamt |
| Steigung | p̄ = Mittel der drei 6-Gang-Fenster, je Gang | Länge KR1–KR4 (x̄ und Abweichung von 17,4 mm) |
| Steigung zwischen Fenstern / Einzelfenster | Spanne der Fenstermittel (G1–G7, G5–G11, G9–G15) | Spanne KR1–KR2 vs. KR3–KR4 (je 2,9 mm) |
| Werte außerhalb Toleranz | nur BCD und Steigung | ebenso |

## Paarung (Reiter 3)

Ziel ist, im Umlauf befindliche Spindel- und Mutter-Aufträge matrixweise zu prüfen, ob irgendwo ungünstige BCD- oder Steigungsdifferenzen entstehen, und bei Bedarf gezielt zu paaren.

- **Δ = Mutter − Spindel**, in µm.
- **Bewertung (Standard: Min/Max der Einzelwerte):** Je Paar zählt der ungünstigste Fall aus den Einzelteilen, also Min Mutter − Max Spindel bis Max Mutter − Min Spindel. Umschaltbar auf die Differenz der Auftragsmittel. Eine Bewertung über die Fähigkeit ist vorgesehen, aber noch offen.
- **BCD (Standard: Gauss, umschaltbar auf Hüll oder Pferch):** Je Spindelgang wird mit jeder Kugelrille (KR) der Mutter verglichen, die über diesen Gang läuft. Hüll und Pferch gibt es bei der Spindel nur an den Gängen 2, 9, 14, 16 und 17.
- **Steigung:** Verglichen werden Fenster gleicher Nennlänge: das Mutterfenster KR1–KR4 (17,4 mm) gegen jedes Spindelfenster G1–G7, G5–G11 und G9–G15 (je 17,4 mm). Die Einzelfenster KR1–KR2 und KR3–KR4 (2,9 mm) haben auf der Spindel kein Gegenstück.
- **Grenzen (Standard):** ΔBCD 15…85 µm, ΔSteigung ±25 µm. „Knapp“ heißt, die Reserve zur Grenze liegt unter 5 µm. Alle Werte sind einstellbar und werden im Browser gemerkt.
- **Sichtbarkeit (Standard, Vorgabe):** Die Mutter hat 4 Gänge, KR1…KR4 = Gang 1…4. Sie fährt über das ganze gemessene Gewinde der Spindel. Bei 17 Gängen heißt das: Gang 1 sieht KR1, Gang 2 KR1–2, Gang 3 KR1–3, die Gänge 4–14 alle KR, Gang 15 KR2–4, Gang 16 KR3–4, Gang 17 KR4. KR-Versatz und Hub sind einstellbar.
- Ausgeschlossene Aufträge aus den Reitern Spindel und Mutter fehlen auch in der Matrix.

## Erwartetes Dateiformat

CAQ-Export, eine Zeile je Messwert. Erkannt bzw. verarbeitet wird Folgendes:

- Trennzeichen `;`, `,` oder Tab (automatisch); Dezimalpunkt oder Dezimalkomma
- Kodierung UTF-8 oder Windows-1252; R-Maskierungen wie `<U+00E4>` werden zu „ä“, doppelt kodierte Umlaute („Ã¼“) werden repariert
- `NA` in Textspalten (Auftrag, Charge, Bemerkung …) gilt als leer; fehlt `strSAPOrder`, wird der Auftrag aus `strInspectionOrder` genommen
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

Geprüft wird der Kern aus `index.html` (`<script id="core">`): CSV, Kodierung, Zahlen, Teiletyp (auch gemischte Dateien), Zuordnung Spindel und Mutter, Kennwerte, Dubletten (Re-Import, Nachmessung, überlappende Exporte, Teile in zwei Aufträgen), Excel-Variante, Paarung (Sichtbarkeit, Min/Max- und Mittelwert-Differenzen, Status, Export). Jeder Fund aus dem Review hat einen eigenen Regressionstest. Optional lässt sich ein echter Export lokal mitprüfen, ohne dass er ins Repository gelangt:

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
