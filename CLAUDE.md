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
7. **Bewertung:** Mittelwerte sind „nicht gut“ (entfernt). Standard ist Min/Max der Einzelwerte, also Min Mutter − Max Spindel … Max Mutter − Min Spindel. Umschaltbar auf **Fähigkeit (Cpk_Δ)**, siehe Stand.
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

- `index.html`: eine Datei, keine Bibliotheken. `<script id="core">` = `globalThis.SubCore` (reine Funktionen: Einlesen, Dubletten, Zuordnung, Kennwerte, Verteilungsfunktionen, Paarung mit Min/Max und Fähigkeit, Export), `<script id="app">` = Oberfläche mit Reitern 1 Spindel · 2 Mutter · 3 Paarung.
- `tests/run-tests.js`: lädt den Kern per Node-vm; jeder Review-Fund hat einen Regressionstest (99 Tests; mit echten Exporten zusätzlich die Statusverteilung Min/Max gegen Fähigkeit).
- `tools/generate-synthetic*.js` erzeugen `testdata/*.csv` deterministisch mit erfundenen Kennungen und den Eigenheiten der echten Exporte.
- UI-Prüfung mit Playwright (vorinstalliert) bei 1920×1080, 2560×1440, 3840×2160 und 390×844: keine Konsolenfehler, kein Querscrollen, kein „null/undefined/NaN“ im Text. Automatisiert in `tools/ui-check.js` (optional, braucht Playwright; Nutzer wollte es im Repo): `node tools/ui-check.js` bzw. mit echten Exporten `node tools/ui-check.js <spindel.csv> <mutter.csv> --anlauf`.

## Stand und offene Punkte

- Fertig: Spindel, Mutter, Paarungsmatrix (mit Detailansicht, CSV-Export, Grenzen und Sichtbarkeit einstellbar). Zwei unabhängige Reviews: Alle Kennwerte und alle Matrixzellen wurden aus den Roh-CSV in Python nachgerechnet, ohne Abweichung.
- **Fertig (07.11.2026): Bewertung „Fähigkeit (Cpk_Δ)“** in der Paarung, Stufe 1 des Entwurfs `docs/entwurf-faehigkeit.md`. Umgesetzt mit diesen Entscheidungen des Nutzers (Abschnitt 8 des Entwurfs):
  - (1) Statusregel **Variante b**: außerhalb bei Cpk_Δ < 1,00; knapp bei Cpk_Δ ≥ 1,00, wenn die untere 95-%-Vertrauensgrenze unter 1,00 liegt (Fähigkeit nicht nachgewiesen); sonst ok. Keine Stufe 1,33, keine Option „streng“. Vertrauensniveau fest 95 %, Mindestwert fest 1,00 (keine Eingabefelder).
  - (2) **Streuung je Auftrag als einzige Variante.** Aufträge mit weniger als 3 Teilen übernehmen die gepoolte Streuung der übrigen einbezogenen Aufträge, ν = min(d̂₀ nach Smyth, Σν), Marke σ*. Unter 3 Aufträgen mit eigener Streuung: „keine Daten“, kein Rückfall auf Min/Max. Nachmessungen eines Teils werden gemittelt, das Teil zählt einmal.
  - (3) Die Stichprobe (Mutter: 5 Erst- und 5 Letztstücke; Spindel) gilt **dauerhaft** als repräsentativ. σ! (F-Test) und E/L (Welch-Test Erst/Letzt) sind nur Hinweise, gerechnet wird mit der Gesamtstreuung.
  - (4) **Min/Max bleibt Standard**, bis der Nutzer die Fähigkeit an den Daten freigibt; danach `PAIR_DEFAULTS.basis` auf `'cap'` setzen. Die Bewertung „Mittelwerte“ ist entfernt (gespeichert „mean“ fällt auf Min/Max zurück).
  - Alle Verteilungsfunktionen (Φ, Φ⁻¹, t, F, ln Γ, Digamma, Trigamma, ψ′⁻¹) stehen ohne Bibliotheken im Kern.
  - **Entschieden (Nutzer, 07.11.2026): streng.** Fehlen einem einbezogenen Auftrag alle Werte eines Merkmals, das andere einbezogene Aufträge haben, sind die betroffenen Orte „keine Daten“ und die Zellen nicht „passend“ (beide Bewertungen). Begründung des Nutzers: Solche Fälle sollen bei ihm landen, bisher rechnet er von Hand. Einzelne fehlende Werte lösen das nicht aus. In den bisherigen echten Exporten kommt es nicht vor.
  - Review als Workflow (Python-Prüfer mit scipy, Statistik/Code, Bedienung mit Playwright; jeder Fund adversarial gegengeprüft): 14 Funde, 13 bestätigt (3 mittel, 10 niedrig), alle behoben und mit Regressionstests belegt. Eine zweite adversariale Prüfrunde auf die Korrekturen fand 7 weitere (1 mittel: ein Merkmal, das nur ein ausgeschlossener Auftrag hat, machte die ganze Matrix zu „keine Daten“; jetzt zählen für Sichtbarkeit und Orte nur Merkmale mit Werten in einbezogenen Aufträgen), ebenfalls behoben; jede Korrektur ist per Mutationsprobe durch einen Test abgesichert. Die unabhängige Python-Nachrechnung aller 5 841 Orte (99 Paare, Gauss/Hüll/Pferch/Steigung) ergab vor und nach den Korrekturen 0 Abweichungen (Cpk relativ ≤ 1e-12). Hinweis für künftige Workflows: Der Container hat 4 CPUs, ein Workflow lässt deshalb nur 2 Agenten gleichzeitig laufen (Review dauerte rund 1 Stunde). Zwischenstände früh pushen.
- **Offen:** Freigabe der Fähigkeit als Standard durch den Nutzer (Entscheidung 4). Aus Stufe 2 umgesetzt: Punktstreifen der Einzelwerte am maßgeblichen Ort (Detailansicht). Bewusst nicht umgesetzt (Nutzer einverstanden): Anderson-Darling/„Annahmen prüfen“ (bei n = 10 und 1 µm Auflösung wenig aussagekräftig) und Gegenrechnung Zwei-Gruppen/Drift (ändert an den Daten keinen Status).
- Nennmaß `748` (siehe oben): ungeklärt, für den Nutzer vorerst nicht relevant („Gauss reicht erstmal“). Durchgerechnet: Lägen die KR in Gang 1, 2, 6, 7 (KR-Versatz 0, 1, 5, 6), ändert sich bei Gauss kein Status, bei Hüll/Pferch höchstens 3 Zellen; die Spindelenden bleiben gleich.
- Ergebnis mit den echten Daten (Min/Max, Gauss): kein Paar außerhalb der Grenzen, kleinste BCD-Reserve +1,5 µm am Spindelanfang (Gang 2/KR1). Mit Hüll und Pferch gibt es einzelne Paare außerhalb, nämlich an den Spindelenden: Am Ende fällt der BCD der Spindel um rund 13 µm ab, am Anfang ist KR1 der Mutter nominell 10 µm kleiner. Die Steigung ist bei ±25 µm unkritisch.
- Ergebnis mit „Fähigkeit“ (99 Paare, ok/knapp/außerhalb, Min/Max → Fähigkeit): Gauss 94/5/0 → 84/9/6, Hüll 63/28/8 → 44/35/20, Pferch 80/13/6 → 66/17/16, Steigung 99/0/0 → 98/1/0. Keine Zelle wird besser. Kritischstes Paar bei Gauss: Gang 17/KR4 mit dem Mutter-Auftrag, dessen Letztstücke rund 6–8 µm unter den Erststücken liegen (σ!, E/L), Cpk_Δ 0,72 (untere Grenze 0,41). Der lokale Test mit CAQ_REAL/CAQ_REAL_NUT vergleicht diese Zahlen automatisch, solange die Exporte dieselbe Struktur haben.
