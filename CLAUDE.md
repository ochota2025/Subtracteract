# Subtracteract – Projektgedächtnis

Diese Datei wird in jeder neuen Claude-Code-Sitzung automatisch geladen. Sie hält fest, was in früheren Sitzungen entschieden wurde. Technische Details stehen in `README.md`; hier steht das *Warum* und alles, was nicht aus dem Code hervorgeht.

**Das Repository ist öffentlich.** Echte Kennungen gehören weder hierher noch in Code, Testdaten oder Commit-Texte: Material-, Auftrags-, Chargen-, Maschinen- und Messmittelnummern sowie UUIDs.

## Zusammenarbeit

- Den Nutzer duzen, auf Deutsch antworten. Klar widersprechen, wenn etwas fachlich nicht passt; bei Entscheidungen das stärkste Gegenargument nennen; Risiken einmal kurz ansprechen.
- Der Nutzer ist Qualitätsingenieur und will gründliche, nachvollziehbare Arbeit („lass dich nicht bremsen“). Unabhängige Reviews mit Gegenprüfung (Workflow: Prüfer + adversarialer Verifizierer) haben jeweils echte Fehler gefunden und sind ausdrücklich erwünscht.
- Arbeitsbranch: `claude/brave-albattani-efzqxa`. Nach jedem abgeschlossenen Schritt testen, committen und pushen. Pull Request nur auf ausdrücklichen Wunsch.
- Während ein Review-Workflow auf dem Hauptverzeichnis läuft, Änderungen in einem `git worktree` machen und erst danach zusammenführen.
- Vor jedem Commit prüfen, dass keine echten Kennungen enthalten sind (Liste der Kennungen aus den hochgeladenen Exporten erzeugen und mit `grep -F -f` gegen alle Repo-Dateien laufen lassen).

## Echte Daten

- Der Nutzer lädt die CAQ-Exporte jeweils in die Sitzung hoch (sie liegen dann unter `/root/.claude/uploads/…`). Sie werden **nie** ins Repo kopiert; `.gitignore` sperrt `*.csv` außerhalb von `testdata/`.
- Lokale Mitprüfung: `CAQ_REAL=<spindel.csv> CAQ_REAL_NUT=<mutter.csv> node tests/run-tests.js`.
- Bisher bekannt: ein Spindel-Export (Prozess Wärmebehandlung, 12 Aufträge × 10 Spindeln, 39 Merkmale) und ein Mutter-Export (Prozess Hartdrehen, 10 Aufträge, 338 Merkmale, 112 Messungen, davon 26 Re-Importe).

## Fachliche Vorgaben des Nutzers (entschieden)

1. **Nur BCD und Steigung** werden ausgewertet und dargestellt. Alles andere wird ignoriert (auch BCD-Spannen „BCD Range“ und Kopien „wie 713.1.GG“). Wir sagen „BCD“, nicht „TKD“.
2. **GG / GN / GX = Gauss / Hüll / Pferch.** Hüll liegt bei Spindel und Mutter über Pferch.
3. **Auswerteeinheit ist der Fertigungsauftrag (Batch).** Einzelteile werden nicht unterschieden (`decY`, `intSampleNo` ignorieren). Gepaart wird nur auf Auftragsebene; in der Montage wird aus einem Spindel- und einem Mutter-Auftrag zufällig kombiniert.
4. **Die Mutter hat 4 Gänge:** KR1…KR4 = Gang 1…4 der Mutter. Eine aus Nennmaßen abgeleitete KR-Lage gibt es nicht mehr.
5. **Sichtbarkeit (Paarung):** Die Mutter fährt über das ganze gemessene Spindelgewinde. Bei 17 Spindelgängen: Gang 1 sieht KR1, Gang 2 KR1–2, Gang 3 KR1–3, Gang 4–14 alle, Gang 15 KR2–4, Gang 16 KR3–4, Gang 17 KR4 („der letzte sieht nur KR4, der vorletzte KR3 und 4 …“; „Gang 3 sieht KR1–3“).
6. **Δ = Mutter − Spindel.** Grenzen: ΔBCD 15…85 µm, ΔSteigung ±25 µm. „Knapp“ = Reserve unter 5 µm (Vorschlag von Claude, einstellbar).
7. **Bewertung:** Mittelwerte sind „nicht gut“. Standard ist Min/Max der Einzelwerte, also Min Mutter − Max Spindel … Max Mutter − Min Spindel. Später eventuell Bewertung über die **Fähigkeit** (siehe offene Punkte).
8. **BCD-Auswertung umschaltbar** Gauss / Hüll / Pferch, Standard Gauss; jeweils Mutter-Fit gegen Spindel-Fit gleicher Art.
9. **Steigung:** Mutterfenster `748` KR1–KR4 (Nennlänge 17,4 mm) gegen Spindelfenster G1–G7, G5–G11, G9–G15 (je 17,4 mm), verglichen über gleiche Nennlänge. Die Einzelfenster KR1–KR2 und KR3–KR4 (je 2,9 mm) haben kein Gegenstück.
10. **Teile, die in zwei Fertigungsaufträgen stehen, fliegen raus** („was du nicht zuordnen kannst, fliegt raus“). Ein Auftrag, der dadurch leer wird, entfällt.
11. Ein Spindel-Auftrag aus dem Anlauf (frühester Auftrag, auffällige Zylindrizität) war nur Beispielmaterial und wird im Browser per Haken ausgeschlossen.
12. Oberfläche optimiert für **Full HD und 32″ 4K** (2560 px bei 150 %, 3840 px bei 100 %); schmale Fenster müssen funktionieren, sind aber zweitrangig.

## Eigenheiten der CAQ-Exporte (alle im Parser abgefangen und getestet)

- R-Export: `;`, Dezimalpunkt, `NA`, Umlaute als `<U+00E4>`. Im Mutter-Export kommen zusätzlich doppelt kodierte Umlaute vor (`<U+00C3><U+00BC>` = „Ã¼“).
- Absolute Toleranzgrenzen in `decLTol`/`decUTol`; `NA` heißt einseitig.
- Spindel: `datInsp` ist die lokale Messzeit (Versatz zu UTC wechselt bei der Zeitumstellung). Mutter: `datInsp` ist der Prüfbeginn, die echte Messzeit steht in `datInspUTC`. Der zuerst gemessene Eintrag wird über UTC bestimmt.
- Spindel-Prüfplantexte enthalten Kopierfehler (z. B. `432.14.GN` mit Text „BCD GG Gang 14“). Zugeordnet wird deshalb über die Position.
- Mutter: Teile-UUID in `strUUID` (32 Hex-Zeichen). Re-Importe tragen dieselbe UUID mit identischen Werten. Fünf Teile standen in zwei Aufträgen, und ein Auftrag bestand nur aus diesen fünf Teilen.
- Spindel: `strUUID` der Härteproben (Form `Auftrag_n`) ist keine Teile-ID.
- Mutter: Viele `.GG`-Durchmesser sind kein BCD (Außen-ø, Kern-ø, Lagersitz). BCD nur mit „BCD“ im Prüfplantext.
- Mutter-Prüfplan: `748` „Gew.Steigung (KR1-KR4)“ hat 17,4 mm Nennmaß, `748.1`/`748.2` haben je 2,9 mm. Das passt nicht zu „4 Gänge à 2,9 mm“ (dann wären es 8,7 mm). Nicht geklärt; die App vergleicht über gleiche Nennlänge, das ist davon unabhängig.
- In Excel gespeicherte Exporte verfälschen Positionen (`404.1` → `404,1`, `449.10` → `449,1`). Die App warnt; immer den Original-Export verwenden.

## Architektur (Kurzfassung, Details in README.md)

- `index.html`: eine Datei, keine Bibliotheken. `<script id="core">` = `globalThis.SubCore` (reine Funktionen: Einlesen, Dubletten, Zuordnung, Kennwerte, Paarung, Export), `<script id="app">` = Oberfläche mit Reitern 1 Spindel · 2 Mutter · 3 Paarung.
- `tests/run-tests.js`: lädt den Kern per Node-vm; jeder Review-Fund hat einen Regressionstest.
- `tools/generate-synthetic*.js` erzeugen `testdata/*.csv` deterministisch mit erfundenen Kennungen und den Eigenheiten der echten Exporte.
- UI-Prüfung mit Playwright (vorinstalliert) bei 1920×1080, 2560×1440, 3840×2160 und 390×844: keine Konsolenfehler, kein Querscrollen, kein „null/undefined/NaN“ im Text.

## Stand und offene Punkte

- Fertig: Spindel, Mutter, Paarungsmatrix (mit Detailansicht, CSV-Export, Grenzen und Sichtbarkeit einstellbar). Zwei unabhängige Reviews: Alle Kennwerte und alle Matrixzellen wurden aus den Roh-CSV in Python nachgerechnet, ohne Abweichung.
- **Offen: Bewertung über die Fähigkeit.** Ein Entwurf (drei Ansätze: Cpk der Differenz, statistische Toleranzintervalle, verteilungsfrei über alle Teilekombinationen; zwei Gutachter; Synthese) wurde erstellt. Das Ergebnis steht in `docs/entwurf-faehigkeit.md`: Empfehlung Cpk_Δ je Ort mit Streuung je Auftrag und unterer 95-%-Vertrauensgrenze, Status außerhalb unter 1,00 und knapp unter 1,33 bzw. bei nicht nachgewiesener Fähigkeit. Entscheidungen des Nutzers dazu (Abschnitt 8):
  - (3) Die Stichprobe der Mutter (5 Erst- und 5 Letztstücke) und die der Spindel gilt **dauerhaft** als repräsentativ für den Auftrag, nicht nur vorläufig.
  - (4) Min/Max bleibt Standard, bis der Nutzer die Fähigkeit an den Daten freigibt; danach wird „Fähigkeit“ Standard. Die Bewertung „Mittelwerte“ wird entfernt.
  - (1) Der Nutzer hat mit „1,00“ geantwortet. Geklärt werden muss noch, ob nur die Grenze 1,00 gilt oder zusätzlich die Stufe „knapp“ (unter 1,33 bzw. nicht nachgewiesen).
  - (2) Streuung je Auftrag: Der Nutzer hat um eine Erklärung gebeten; die Entscheidung steht noch aus. Der Nutzer entscheidet über den Vorschlag; danach als dritte Bewertungsart „Fähigkeit“ neben Min/Max und Mittelwerten umsetzen.
- Offen: Widerspruch beim Nennmaß von `748` (siehe oben), nur falls der Nutzer ihn klären möchte.
- Ergebnis mit den echten Daten (Min/Max, Gauss): kein Paar außerhalb der Grenzen, kleinste BCD-Reserve +1,5 µm am Spindelanfang (Gang 2/KR1). Mit Hüll und Pferch gibt es einzelne Paare außerhalb, nämlich an den Spindelenden: Am Ende fällt der BCD der Spindel um rund 13 µm ab, am Anfang ist KR1 der Mutter nominell 10 µm kleiner. Die Steigung ist bei ±25 µm unkritisch.
