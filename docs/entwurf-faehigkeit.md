> **Umgesetzt (Stufe 1) am 07.11.2026** in `index.html` als Bewertung „Fähigkeit (Cpk_Δ)“, mit den Entscheidungen aus Abschnitt 8 (siehe `CLAUDE.md`). Abweichungen vom Text unten: Statusregel Variante b (außerhalb bei Cpk_Δ < 1,00, knapp nur bei nicht nachgewiesener Fähigkeit, **keine Stufe 1,33**, **keine Option „streng“**); Vertrauensniveau fest 95 % und Mindestwert fest 1,00, ohne Eingabefelder; „Mittelwerte“ entfernt. Die Zahlen aus Abschnitt 7 werden mit Variante b unverändert erreicht (lokaler Test mit den echten Exporten). Noch nicht umgesetzt (Stufe 2): Anderson-Darling und Block „Annahmen prüfen“, Gegenrechnung Zwei-Gruppen/Drift bei E/L, Punktstreifen der Einzelwerte.
>
> **Ursprünglicher Entwurf.** Erarbeitet am 07.11.2026 aus drei unabhängigen Entwürfen (Cpk der Differenz, statistisches Toleranzintervall, verteilungsfrei über alle Teilekombinationen). Zwei Gutachter haben sie bewertet (statistisch und aus Sicht der Serienfertigung), danach wurden sie zu einer Spezifikation zusammengeführt. Die Aufträge heißen hier S1…S11 (Spindel) und M1…M9 (Mutter), chronologisch nach der ersten Messung. Die Zuordnung zu den echten Nummern steht bewusst nicht im öffentlichen Repo. Die erwähnten Prototyp-Skripte lagen nur im Arbeitsverzeichnis der damaligen Sitzung und sind nicht erhalten; alle Formeln und Referenzwerte stehen in diesem Dokument.

# Spezifikation: Bewertung „Fähigkeit (Cpk_Δ)“ in der Paarung

Die Basis ist Entwurf A (Cpk_Δ der Differenz mit unterer Vertrauensgrenze). Die Statusregel kommt aus C. Aus B kommen „Streuung je Auftrag“, die Untergrenze für die Auflösung, die Darstellung in µm und der Rechenweg. Den Erst-/Letztstück-Befund (C) und den prädiktiven Anteil (Gutachten 1) habe ich ebenfalls übernommen. Alle Zahlen sind neu gerechnet, mit der Einstellung wie im Browser: Anlauf-Auftrag ausgeschlossen, 11 × 9 = 99 Paare, nur BCD und Steigung, Mutter mit 4 Gängen (KR1…KR4).

Die Aufträge heißen hier S1…S11 und M1…M9, chronologisch nach erster Messung; S0 ist der Anlauf-Auftrag. Die Zuordnung zu den echten Nummern steht nur lokal in `/tmp/claude-0/-home-user-Subtracteract/23816b74-e095-5233-8595-c3eb65d7c6fd/scratchpad/design/S_syn/alias_NICHT_INS_REPO.txt` und gehört nicht ins Repo. Die Prototypen liegen in `/tmp/claude-0/-home-user-Subtracteract/23816b74-e095-5233-8595-c3eb65d7c6fd/scratchpad/design/S_syn/`: `proto.js` (Auswertung), `sim.js` und `sim_n1.js` (Simulation der Überdeckung), `erstletzt.js` (Erst-/Letztstück), `ref.js` und `refpy.py` (Referenzwerte, in JS und Python gegengeprüft). Die Dateien `cells_*.json` dort enthalten echte Nummern.

---

## 1. Empfehlung

Als dritte Bewertung kommt „Fähigkeit“ dazu: Je Auftragspaar und sichtbarem Ort berechnet die App die Paarungsfähigkeit Cpk_Δ der Differenz Mutter − Spindel und ihre untere 95-%-Vertrauensgrenze. Grundlage sind σ_Δ² = σ_M² + σ_S² und die Streuung des einzelnen Auftrags. Die Zelle übernimmt den schlechtesten Ort: **außerhalb** bei Cpk_Δ < 1,00, **knapp** bei Cpk_Δ < 1,33 oder wenn die Fähigkeit nicht nachgewiesen ist (Cpk_unten < 1,00), sonst **ok**.

Warum: Min/Max hängt am Stichprobenumfang. Bei 10 × 10 Teilen deckt es im Mittel nur etwa 94 % der zufälligen Montagen ab, bei n = 1 nur etwa 50 %. Cpk_Δ bündelt Lage, Streuung und Schätzunsicherheit in einer Kennzahl, die du kennst. Von fünf geprüften Arten, die Streuung zu schätzen, hielt nur die Streuung je Auftrag in allen simulierten Fällen das Vertrauensniveau (0,93–0,95 statt Soll 0,95).

Was du davon hast: Bei Gauss werden aus 0 Paaren „außerhalb“ 6 Paare. Alle liegen an den bekannten Brennpunkten (G17/KR4, G1/KR1), 4 davon mit M7, dessen Streuung aus einem Versatz von 8 µm zwischen Erst- und Letztstücken entsteht. Keine Zelle wird besser, und jede Zahl lässt sich im Rechenweg von Hand nachrechnen.

---

## 2. Kenngrößen und Formeln

Alle Werte in µm. Ein Ort ℓ ist bei BCD ein sichtbares Paar Gang g / KR k nach der Treppe, gerechnet mit der gewählten Auswertung (Gauss: 24 Orte, Hüll/Pferch: 13). Bei der Steigung ist ℓ ∈ {748↔404.1, 748↔404.5, 748↔404.9}. Die Grenzen sind L…U = 15…85 bzw. −25…+25.

### 2.1 Streuung je Auftrag i und Merkmal p (nur einbezogene Aufträge)

| Schritt | Formel |
|---|---|
| Auflösung | s_i² ← max(s_i², h_p²/12), h_p aus `char.decimals` (Spindel 1 µm → s ≥ 0,29 µm; Mutter 0,1 µm) |
| n_i ≥ 3 | σ̂_i = s_i, ν_i = n_i − 1, Quelle „eigene“ |
| n_i < 3 | σ̂_i = s_pool = √(Σ_j ν_j s_j² / Σ_j ν_j) über die übrigen einbezogenen Aufträge mit n_j ≥ 3 (Anzahl G); ν_i = min(d̂₀, Σ_j ν_j); Quelle „übernommen“ |
| G < 3 | Ort „keine Daten“ („Streuung nicht schätzbar“); es gibt keinen stillen Rückfall auf Min/Max |
| d̂₀ (Smyth 2004) | e_j = ln s_j² − ψ(ν_j/2) + ln(ν_j/2); V = Σ(e_j − ē)²/(G−1) − (1/G)·Σ ψ′(ν_j/2); V ≤ 0 ⇒ d̂₀ = ∞, sonst d̂₀ = 2·ψ′⁻¹(V) |
| Diagnose „Streuung auffällig“ (nur Anzeige) | F_i = s_i² / s²_pool,(−i); p_i = 1 − F_cdf(F_i; ν_i, Σ_{j≠i} ν_j); Hinweis bei p_i < 0,01 |

d̂₀ gibt die Freiheitsgrade einer übernommenen Streuung an, also wie sicher man sein kann, dass ein Auftrag streut wie die anderen. An den echten Daten liegt d̂₀ meist bei 5…12, nur selten bei ∞. Mit ν = Σν wäre die Grenze zu optimistisch (Überdeckung 0,87–0,90), mit ν = d̂₀ liegt sie bei 0,93–0,96.

### 2.2 Je Auftragspaar (M, S) und Ort ℓ

| Größe | Formel |
|---|---|
| Lage | μ̂ = x̄_M − x̄_S |
| Streuung | σ̂_Δ = √(σ̂_M² + σ̂_S²) |
| Freiheitsgrade (Welch-Satterthwaite) | ν_Δ = σ̂_Δ⁴ / (σ̂_M⁴/ν_M + σ̂_S⁴/ν_S) |
| effektives n | ñ = σ̂_Δ² / (σ̂_M²/n_M + σ̂_S²/n_S) (10/10 ⇒ 10; n_M = 1 ⇒ ≈ 1,3–1,5 bei BCD, ≈ 3,5 bei der Steigung) |
| Fähigkeit | Ĉ_U = (U − μ̂)/(3σ̂_Δ); Ĉ_L = (μ̂ − L)/(3σ̂_Δ); Ĉpk = min(Ĉ_L, Ĉ_U); Cp = (U − L)/(6σ̂_Δ) |
| Untere Grenze (Delta-Methode) | SE_j = √(1/(9ñ) + Ĉ_j²/(2ν_Δ)); Cpk_unten = min_j (Ĉ_j − z_γ·SE_j); z₀,₉₅ = 1,6448536 |
| Anzeigeband | μ̂ ± 3σ̂_Δ; 3σ-Reserve = min(μ̂ − 3σ̂_Δ − L, U − μ̂ − 3σ̂_Δ) = 3σ̂_Δ(Ĉpk − 1), also ≥ 0 ⇔ Ĉpk ≥ 1 |
| Anteil außerhalb, prädiktiv | σ_p = σ̂_Δ·√(1 + 1/ñ); p_ℓ = T_ν(L−μ̂; σ_p) + 1 − T_ν(U−μ̂; σ_p), wobei T_ν die t-Verteilungsfunktion mit ν = ν_Δ ist, ausgewertet an (x)/σ_p |
| Anteil als Punktschätzung (nur Rechenweg) | p⁰_ℓ = Φ(−3Ĉ_L) + Φ(−3Ĉ_U) |
| Ohne Annahme (Tooltip) | k_ℓ = #{(i, j): m_i − s_j ∉ [L, U]} von N = n_M·n_S Kombinationen |

Korrektur zu Entwurf A: Bei n_M = n_S = n und gleichem σ ist ν_Δ = 2(n−1), also SE = √(1/(9n) + Ĉ²/(4(n−1))). Das ist nicht die Bissell-Formel für eine einzelne Stichprobe. Die allgemeine Formel oben ist richtig.

### 2.3 Status je Ort (EPS = 1e-9 wie im Kern)

| Status | Standardregel (Empfehlung) | Option „streng“ |
|---|---|---|
| außerhalb | Ĉpk < C_min | Ĉpk < C_min |
| knapp | Ĉpk < C_Ziel **oder** Cpk_unten < C_min (Text: „nicht nachgewiesen“) | Cpk_unten < C_Ziel |
| ok | sonst | sonst |
| keine Daten | σ nicht schätzbar | gleich |

Standardwerte: C_min = 1,00, C_Ziel = 1,33, γ = 95 %. Die Reserve von 5 µm für „knapp“ gilt in diesem Modus nicht.

### 2.4 Aggregation je Zelle (BCD und Steigung getrennt)

- Der Status ist der schlechteste Status über **alle** Orte. Er wird nicht aus dem Ort mit dem kleinsten Cpk_unten abgeleitet; das war ein Fund aus Gutachten 1.
- Ist ein Ort „keine Daten“, wird das Kriterium „keine Daten“. Das ist konservativ, und das Paar zählt wie heute nicht als „passend“.
- Maßgeblicher Ort ist der Ort mit dem schwersten Status; bei Gleichstand der mit kleinerem Ĉpk, danach der mit kleinerem Cpk_unten. Ihn zeigen Matrix, Export und Startauswahl.
- Zusätzlich werden Ĉpk_min und Cpk_unten,min berechnet; sie können an verschiedenen Orten liegen und werden mit Ort angezeigt.
- Montage-Ebene, nur als Information (Boole-Schranken, gelten ohne Annahme zur Korrelation): max_ℓ p_ℓ ≤ P(mind. ein Ort außerhalb) ≤ min(1, Σ_ℓ p_ℓ).
- Gesamtstatus der Zelle aus BCD und Steigung wie heute.
- Rangfolge (worstBcd/worstLead, Startauswahl): zuerst nach Status, dann nach Ĉpk.

---

## 3. Kleine n und Unsicherheit

**n = 10 (Normalfall).** Jeder Auftrag rechnet mit seiner eigenen Streuung (ν = 9), daraus folgt ν_Δ ≈ 10…18 und ñ = 10. Die untere Grenze liegt deshalb 0,3–0,45 unter Ĉpk. Für „ok“ braucht es also mehr als 1,33:

| Fall | ok ab Ĉpk (Standard) | ok ab Ĉpk (streng) |
|---|---|---|
| ñ 10, ν_Δ 18 | 1,43 | 1,87 |
| ñ 10, ν_Δ 14 | 1,50 | 1,97 |
| ñ 10, ν_Δ 10 | 1,62 | 2,13 |
| n_M = 1 (ñ 1,4, ν_Δ 24) | 1,60 | 1,99 |

Die strenge Regel aus A verlangt praktisch Ĉpk ≈ 1,9–2,1. Das ist bei n = 10 kaum noch trennscharf; Gutachten 2 kommt in seiner Simulation auf eine Test-Retest-Übereinstimmung von 81 %, mit der Standardregel auf 89 %.

**Warum Streuung je Auftrag?** Ich habe nachsimuliert: Überdeckung von Cpk_unten (Soll 0,95), wahres Cpk_Δ 1,33, 8 Mutter- und 11 Spindel-Aufträge zu je 10 Teilen, 3000 Läufe (Standardfehler ≈ 0,004).

| Szenario | je Auftrag | Pool | robust gepoolt (A) | max(s_i, s_p) | moderiert (emp. Bayes) |
|---|---|---|---|---|---|
| Streuung homogen | 0,946 | 0,949 | 0,939 | 0,983 | 0,946 |
| Streuung schwankt zwischen Aufträgen (d₀ = 6, wie echt) | 0,937 | 0,789 | 0,803 | 0,976 | 0,892 |
| ein Auftrag 1,5-fach | 0,930 | 0,163 | 0,413 | 0,913 | 0,497 |
| ein Auftrag 2,4-fach (wie M7) | 0,933 | 0,000 | 0,876 | 0,931 | 0,607 |
| Median Ĉpk bei wahrem 1,33 | 1,36 | 1,25–2,36 | 1,32–1,65 | **1,14–1,24 (verzerrt)** | 1,33–1,68 |

Gepoolte Varianten sind zu optimistisch, sobald ein Auftrag anders streut, und genau das ist der relevante Fall. max(s_i, s_p) drückt den Punktschätzer nach unten und verfälscht damit die Regel „außerhalb, wenn Ĉpk < 1“. Die moderierte Varianz aus Gutachten 1 schrumpft einen abweichenden Auftrag zur Mitte hin; bei M7 sinkt s an KR4 von 4,53 auf 3,74 µm. Ein weiterer Vorteil der eigenen Streuung: Ein Auftrag mit n ≥ 3 ist unabhängig davon, welche anderen Aufträge ein- oder ausgeschlossen sind. Der Pool-Effekt aus A entfällt; nur Aufträge mit n < 3 hängen am Pool.

**n = 1 (M2, ein Letztstück).** Die Streuung wird übernommen (s_pool, ν = d̂₀, z. B. 5,4 an KR1), die Unsicherheit der Lage geht über ñ ≈ 1,4 voll in Cpk_unten ein. Die Zelle bekommt die Markierung „σ übernommen“; der Spaltenkopf behält „1 Teil“ mit Warnung. Beispiele:

- Gauss S7×M2, G1/KR1: Ĉ 1,38 / unten 0,73 → knapp. Min/Max sagt ok mit +9,2 µm.
- Pferch S7×M2, G2/KR1: Ĉ 0,54 / unten 0,06 → außerhalb. Min/Max sagt knapp mit +2,0 µm, weil es die Streuung der Mutter bei n = 1 nicht sieht.
- Steigung S4×M2, 748/404.5: Ĉ 1,57 / unten 0,9997 → knapp, angezeigt als 0,99.

**Unsicherheit sichtbar machen.**
- Cpk_unten steht immer neben Ĉpk.
- Der angezeigte Anteil p_ℓ ist prädiktiv, enthält also die Schätzunsicherheit. Er wird nur als Größenordnung gezeigt (2 signifikante Stellen, aufgerundet) und bestimmt nie den Status.
- Im Rechenweg steht p⁰ daneben. Beispiel Handrechnung: Ĉ 1,63 ergibt 0,5 ppm als Punktschätzung, aber 161 ppm prädiktiv bei eigener Streuung 9/9. Mit 10 + 10 Teilen ist „< 1 ppm“ nicht belegbar.

---

## 4. Annahmen, Prüfung und Kennzeichnung

| # | Annahme | Prüfung in der App | Kennzeichnung |
|---|---|---|---|
| 1 | Zufällige Kombination in der Montage, M ⟂ S | nicht prüfbar (deine Vorgabe) | Legende; bei Selektivpaarung gilt das Modell nicht |
| 2 | Stichprobe vertritt den Auftrag | **Mutter: je Auftrag 5 Erst- und 5 Letztstücke** (`strSampleRemark`). Versatz δ = x̄_Letzt − x̄_Erst je KR mit Welch-t-Test; Hinweis bei p < 0,01. Echte Daten: 9 von 32 Kombinationen Auftrag × KR (Gauss), am stärksten M7 mit δ = −6,0…−7,9 µm an KR1–4 (p < 0,001; s gesamt 4,53, innerhalb der Gruppen 1,89 µm). Spindel: 10 Teile in etwa 6 Minuten gemessen, vermutlich eine Ofencharge; nicht prüfbar | Marke „E/L“ an Zelle und Rechenweg. Gerechnet wird mit der Gesamtstreuung (bei monotoner Drift und bei Sprung konservativ). Gegenrechnung im Detail: Zwei-Gruppen-Modell und lineare Drift |
| 3 | Normalverteilung im Auftrag | gepoolte, standardisierte Residuen je Merkmal: Schiefe, Exzess, Anzahl \|z\| > 3,5, Anderson-Darling (A*² = A²(1 + 0,75/N + 2,25/N²), p nach D'Agostino/Stephens). Hinweis „Auflösung 1 µm: Bindungen, AD-p nur eingeschränkt deutbar“ | Block „Annahmen prüfen“. Ausreißer werden gemeldet („Messfehler prüfen“, z. B. S8 an 463.17.GN mit s 7,96 statt 2,06 µm), nie entfernt |
| 4 | Gleiche Streuung über Aufträge: **nicht nötig** (eigene Streuung), nur bei n < 3 | F-Test als Diagnose (α 1 %), d̂₀ als Maß dafür, wie stark die Streuung zwischen Aufträgen schwankt. Auffällig bei Gauss: S6 (432.01/.02/.09.GG), S1 (463.17.GG), S4 (404.5), M7 (713.2–.4.GG) | Marke „σ!“ |
| 5 | Messunsicherheit steckt in s | – | konservativ, nur Text |
| 6 | Die Delta-Methode ist eine Näherung | simuliert: 0,93–0,95 | Text im Rechenweg |
| 7 | Orte sind nicht unabhängig (KR untereinander r ≈ 0,75–0,97) | Boole-Schranken max…Σ | Das Minimum über 24 Orte ist keine gemeinsame 95-%-Aussage; Text in der Legende |

Bezeichnung in der Oberfläche: „Paarungsfähigkeit Cpk_Δ“. Das ist keine Teilefähigkeit nach ISO 22514.

---

## 5. Darstellung

**Bedienleiste.** Neuer Eintrag im Umschalter: „Bewertung: Min/Max Einzelwerte | Mittelwerte | Fähigkeit (Cpk_Δ)“. Nur bei „Fähigkeit“ sichtbar:
- „Cpk-Ziel [1,33]“ und „nicht fähig unter [1,00]“, mit Prüfung Mindestwert < Ziel;
- „Vertrauen [90 | 95 | 99 %]“ als Segment;
- „Regel [Standard | streng]“ als Segment.

„knapp unter … µm Reserve“ wird ausgeblendet. „Standard“ setzt alles zurück. Gespeichert wird wie bisher über Object.assign mit PAIR_DEFAULTS; ungültige Werte fallen auf den Standard zurück.

**Matrixzelle.** Zwei Zeilen wie heute, Format „BCD [Status-Symbol] 0,72 (0,41)“ und „Stg. [Status-Symbol] 2,61 (1,95)“: Ĉpk des maßgeblichen Orts, in Klammern Cpk_unten, beide auf 2 Stellen abgerundet (zur Grenze hin). Marken hinter der Zahl: „σ*“ (übernommen), „σ!“ (auffällig), „E/L“ (Versatz), jeweils nur am maßgeblichen Ort.

Tooltip und aria-label, Beispiel: „Gang 17/KR4 · μΔ 74,7 µm · σΔ 4,73 µm (Mutter eigene 4,53, Spindel eigene 1,35) · μΔ ± 3σΔ 60,5…88,9 µm · Cpk_Δ 0,72, untere 95-%-Grenze 0,41 · außerhalb erwartet ≈ 3,2 % · alle Orte ≤ 4,8 % · 0 von 100 Kombinationen außerhalb · Min/Max 67,2…82,4 µm“. Bei „knapp“ steht der Grund dabei: „Cpk 1,14 < 1,33“ oder „nicht nachgewiesen: untere Grenze 0,85 < 1,00“. Die Spalten „passend“ bleiben (ok + knapp).

**Kacheln.**
- „BCD nicht fähig (Cpk_Δ < 1,00)“ mit Anzahl, darunter „x knapp (davon y nur nicht nachgewiesen)“; ebenso für die Steigung.
- „Kleinster Cpk_Δ BCD“ bzw. „… Steigung“ mit Paar, Ort und unterer Grenze.
- „Hinweise“: Liste der Aufträge mit σ!, E/L und σ*, z. B. „M7: KR2–KR4 s 3,8–4,5 µm statt ≈ 1,9; Erst→Letzt −6,6…−7,9 µm“.

**Legende.** „ok = Cpk_Δ ≥ 1,33 und mit 95 % ≥ 1,00 nachgewiesen · knapp = Cpk_Δ < 1,33 oder nicht nachgewiesen · außerhalb = Cpk_Δ < 1,00 · Zahl = Cpk_Δ (untere Grenze) am maßgeblichen Ort · Paarungsfähigkeit der Differenz, keine Teilefähigkeit“.

**Detailansicht.**
- Kacheln ΔBCD und ΔSteigung: maßgeblicher Ort, Ĉpk, Cpk_unten, μΔ ± 3σΔ, Anteil; „Anteil Montagen mit mind. einem Ort außerhalb: zwischen max und Σ“.
- Tabelle Gang × KR: je Ort „Ĉ (unten)“ mit Status-Symbol, Tooltip wie oben.
- Diagramm (`drawPairBcd`): Balken μΔ ± 3σΔ, Punkt μΔ, dünner Strich Min…Max zum Vergleich, Grenzband wie heute.
- Steigungstabelle mit den Spalten Fenster | n_M × n_S | Min…Max | μΔ | σΔ (Quelle) | ν_Δ | Ĉpk | Cpk_unten | Anteil | k/N | Status.
- Aufklappbar „Rechenweg“ für die 5 maßgeblichsten Orte und alle 3 Steigungsfenster: n_M, n_S, x̄_M, x̄_S, s_M und s_S mit Quelle, μ̂, σ̂_Δ, ν_Δ, ñ, Ĉ_L, Ĉ_U, SE, Cpk_unten, p (prädiktiv), p⁰ und die Formeln.
- Aufklappbar „Annahmen prüfen“ für die beteiligten Merkmale: s_i, s_pool, F-Test-p, d̂₀, δ_E/L mit p, Anzahl |z| > 3,5, AD-p. Dazu die Gegenrechnung bei E/L, z. B. „Zwei-Gruppen-Modell: Cpk-Äquivalent 0,98 (≈ 1 700 ppm), lineare Drift: 1,15 (≈ 300 ppm), Normalmodell: 0,72“.
- Ein Punktstreifen der Einzelwerte von Mutter und Spindel am maßgeblichen Ort, Erst- und Letztstücke unterschiedlich markiert.

**CSV-Export.** Die bestehenden Spalten bleiben. Spalte „Bewertung“ = „Fähigkeit (Cpk_Δ, 95 %, Standard)“. In diesem Modus enthalten dBCD_min/max die Hülle aus μ ± 3σ und die Reserve die 3σ-Reserve. Am Ende werden immer Spalten angehängt, gefüllt nur bei „Fähigkeit“: `BCD_Cpk; BCD_Cpk_unten; BCD_Ort; BCD_muDelta_um; BCD_sigmaDelta_um; BCD_nu; BCD_Anteil_ppm_max; BCD_Anteil_ppm_Summe; BCD_Streuung_Quelle; BCD_Hinweise` und dasselbe mit `Stg_`. Cpk wird abgerundet, ppm aufgerundet.

---

## 6. Umsetzung im Kern und Tests

**Kern (`<script id="core">`, etwa 200 Zeilen)**

1. Verteilungsfunktionen, auf SubCore exportiert (Namenskollisionen vorher prüfen):
   - `erfc` (Numerical Recipes, Chebyshev-Näherung), `normCdf`, `normInv` (Acklam plus ein Halley-Schritt);
   - `lnGamma` (Lanczos, g = 7), `betaI` (Kettenbruch nach Lentz), `tCdf(t, ν)` über betaI, `fCdf`;
   - `digamma` und `trigamma` (Rekursion bis x ≥ 8, dann asymptotische Reihe), `trigammaInv` (Bisektion in ln x, monoton);
   - `adPValue(A2star)`.
   - Die Prototypen dafür liegen in `…/design/A_cpk/stat.js` und `…/design/S_syn/proto.js`.
2. `describe(recs)`: zusätzlich `tags[]` parallel zu `values` (/^\s*erst/i → 'E', /^\s*letzt/i → 'L', sonst null).
3. `spreadTable(units, getStats, o)` → `Map(position → { byOrder: Map(id → {n, mean, s, sUsed, df, src: 'own'|'borrowed', fP, flagged, el: {d, p, flagged}|null}), pool: {s, df, k}, d0, h })`. Wird je pairing()-Aufruf einmal je Teil und Auswertung gebaut, nur über einbezogene Aufträge.
4. `capDiff(a, b, L, U, o)` → `{mu, sd, nu, nEff, cp, cpk, cpkL, cpkU, cpkLo, side, lo: mu−3sd, hi: mu+3sd, pPred, pPlug, kOut, N, srcM, srcS}`; `capStatus(c, o)` → 'ok' | 'warn' | 'out' | 'na'.
5. `pairing()`:
   - neue Basis `'cap'`; jedes Item trägt immer `mm: {lo, hi}` (Min/Max), bei 'cap' zusätzlich die Felder aus capDiff;
   - `agg()` setzt bei 'cap' den Status über capStatus, bildet den schlechtesten Status, `worst` = maßgeblicher Ort, `score` = Ĉpk (bei Min/Max weiter die Reserve), dazu `cpkMin`, `cpkLoMin`, `pMax`, `pSum`, `flags`;
   - `counts` bleiben gleich; worstBcd/worstLead nach (Status, score); `pm.spread` für die Oberfläche.
   - `PAIR_DEFAULTS += { capMin: 1.0, capTarget: 1.33, capConf: 0.95, capRule: 'std' }`.
6. `exportPairingCSV()` wie in Abschnitt 5.
7. Oberfläche (etwa 150 Zeilen): segGroup, bedingte Felder, cellNode/rngB/rngL, Startauswahl über score, Kacheln, Legende, Detailtabelle, Diagramm, Rechenweg.

Umsetzung in zwei Stufen. Stufe 1: Punkte 1–7 ohne AD. Stufe 2: Block „Annahmen prüfen“ mit AD, die Gegenrechnung für Erst/Letzt und der Punktstreifen. Danach README (Abschnitt „Bewertung über die Fähigkeit“) und CLAUDE.md (getroffene Entscheidung) nachziehen. Die Laufzeit ist unkritisch: keine Integrale, 99 × 24 Orte in Millisekunden.

**Tests (`tests/run-tests.js`, synthetisch; Referenzwerte unabhängig in JS und Python nachgerechnet)**

| # | Test | Referenz |
|---|---|---|
| a | Verteilungen | Φ(−3) = 0,0013498980316 (relativ < 2e-7); Φ⁻¹(0,95) = 1,6448536270; Φ⁻¹(0,995) = 2,5758293035; tCdf(2,262157; 9) = 0,975 und tCdf(−1,812461; 10) = 0,05 (±1e-6); F_cdf(2,5; 9, 99) = 0,987228; ψ(1) = −0,5772156649; ψ(0,5) = −1,9635100260; ψ′(1) = π²/6; ψ′(0,5) = π²/2; ψ′⁻¹(π²/6) = 1; adPValue(0,752) ≈ 0,050 |
| b | capDiff, Handbeispiel: M {16,560 mm; s 0,002; n 10; df 63}, S {16,4864; 0,0012; n 10; df 81}, 15…85 | μ 73,6; σ_Δ 2,33238; ν 105,855; ñ 10; Cp 5,00204; Ĉpk 1,62924; Cpk_unten 1,37629; p⁰ 0,5101 ppm; p_pred 4,619 ppm |
| b2 | wie b mit n_M = 1 | ñ 1,31274; Cpk_unten 1,11648; p_pred 182,85 ppm |
| b3 | wie b mit eigener Streuung, df 9/9 | ν 14,7365; Cpk_unten 1,10605; p_pred 161,14 ppm |
| c | gleiches s, 10/10, df 9/9 | ν_Δ = 18 und ñ = 10 exakt |
| d | Smyth: s² = [1; 1,5; 2; 2,5; 3; 4; 5; 8], df 9 | d̂₀ = 10,93356; s₀² = 2,842125. Homogene Liste → d̂₀ = ∞, Begrenzung auf Σν |
| e | Auftrag mit n = 1 | src 'borrowed', σ = s_pool der n ≥ 3, ν = min(d̂₀, Σν); bei G < 3 → 'na' |
| f | 10 gleiche Werte bei 1 µm Auflösung | s = 1/√12 = 0,2887 µm |
| g | Status-Schwellen | Ĉ = 1,00 → nicht außerhalb (EPS); Cpk_unten = 0,9997 → knapp; strenge Regel |
| h | Zellstatus = schlechtester Ort | Ort A: Ĉ 1,40 / unten 0,90 (knapp, n = 1); Ort B: Ĉ 1,36 / unten 1,05 (ok) → Zelle knapp, maßgeblich ist A |
| i | Unabhängigkeit vom Ausschluss | Ein fremder Auftrag wird aus- oder eingeschlossen → Cpk eines Paars mit n ≥ 3 bleibt unverändert; ausgeschlossene Aufträge gehen weder in s_pool noch in d̂₀ ein |
| j | Min/Max bleibt erhalten | item.mm.lo/hi = lo/hi aus basis 'minmax' |
| k | Erst/Letzt | synthetische Mutter mit 5 Erst- und 5 Letztstücken und +8 µm Versatz → markiert, δ ≈ 8 |
| l | Export | Kopfzeile bei allen Bewertungen gleich; Spalten für die Fähigkeit nur bei 'cap' gefüllt; Cpk abgerundet, ppm aufgerundet |
| m | Überdeckung (mulberry32 nur im Test, 2000 Läufe, homogen, eigene Streuung) | 0,93…0,97 |
| n | Lokal mit CAQ_REAL/CAQ_REAL_NUT | Ausgabe der Statusverteilung; erwartet Gauss 84/9/6, Hüll 44/35/20, Pferch 66/17/16, Steigung 98/1/0; ohne Kennungen im Erwartungstext |

Dazu `tools/generate-synthetic-mutter.js` um einen Auftrag mit Versatz zwischen Erst- und Letztstücken ergänzen. Oberflächenprüfung mit Playwright im Modus „Fähigkeit“ bei 1920×1080, 2560×1440, 3840×2160 und 390×844.

---

## 7. Ergebnisse an den echten Daten

99 Paare, Standardregel, 95 %. Angegeben ist ok / knapp / außerhalb.

| Merkmal | Min/Max | Fähigkeit | Wechsel |
|---|---|---|---|
| BCD Gauss | 94 / 5 / 0 | **84 / 9 / 6** | ok→ok 84, ok→knapp 8, ok→außerhalb 2, knapp→knapp 1, knapp→außerhalb 4 |
| BCD Hüll | 63 / 28 / 8 | **44 / 35 / 20** | ok→ok 44, ok→knapp 19, knapp→knapp 16, knapp→außerhalb 12, außerhalb→außerhalb 8 |
| BCD Pferch | 80 / 13 / 6 | **66 / 17 / 16** | ok→ok 66, ok→knapp 12, ok→außerhalb 2, knapp→knapp 5, knapp→außerhalb 8, außerhalb→außerhalb 6 |
| Steigung | 99 / 0 / 0 | **98 / 1 / 0** | ok→knapp 1 (S4×M2, n = 1) |

In keiner Auswertung wird eine Zelle besser als bei Min/Max. Das ist eine Beobachtung an diesen Daten, keine allgemeine Eigenschaft: Bei sehr kleinem σ kann knapp → ok vorkommen. Von den 9 knappen Zellen bei Gauss sind 7 nur „nicht nachgewiesen“ (Ĉ ≥ 1,33). M7 ist an 10 der 15 nicht-ok-Zellen bei Gauss beteiligt. Der Median der Zell-Minima liegt bei BCD bei Cpk_Δ 2,42, bei der Steigung bei 2,82.

**Kritischste Paare, BCD Gauss**

| Paar · Ort | Min/Max am Ort (Zelle) | μΔ | σΔ (M/S) | ν_Δ | Ĉpk | unten | Anteil prädiktiv (Punktschätzung) | Fähigkeit |
|---|---|---|---|---|---|---|---|---|
| S4×M7 · G17/KR4 | 67,2…82,4 (knapp, +2,6) | 74,7 | 4,73 (4,53 E/L / 1,35) | 10,6 | 0,72 | 0,41 | 3,2 % (1,5 %) | außerhalb |
| S7×M3 · G1/KR1 | 17,5…30,9 (knapp, +1,5) | 22,3 | 3,15 (2,56 / 1,83) | 16,3 | 0,77 | 0,49 | 2,1 % (1,0 %) | außerhalb |
| S1×M7 · G17/KR4 | 63,2…82,4 (knapp, +2,6) | 71,6 | 5,07 | 13,3 | 0,87 | 0,54 | 1,3 % | außerhalb |
| S6×M7 · G17/KR4 | 64,2…79,4 (**ok**, +5,6) | 71,9 | 4,69 | 10,3 | 0,92 | 0,55 | 1,2 % | außerhalb |
| S5×M7 · G17/KR4 | 63,2…78,4 (**ok**, +6,6) | 71,1 | 4,65 | 10,0 | 0,99 | 0,58 | 0,88 % | außerhalb |
| S4×M6 · G17/KR4 | 73,3…82,7 (knapp, +2,3) | 77,3 | 2,58 | 14,9 | 0,99 | 0,65 | 0,61 % | außerhalb |
| S3×M7 · G17/KR4 | 64,2…77,4 (ok, +7,6) | 71,1 | 4,60 | 9,6 | 1,00 | 0,58 | 0,87 % | knapp |
| S1×M6 · G17/KR4 | 69,3…82,7 (knapp, +2,3) | 74,2 | 3,16 | 18,0 | 1,14 | 0,78 | 0,22 % | knapp |
| S7×M2 · G1/KR1 (n = 1) | (ok, +9,2) | – | σ_M übernommen | – | 1,38 | 0,73 | – | knapp |

Plausibilität:
- **Gegenrechnung für das erste Paar.** Gerechnet mit der Streuung innerhalb der Erst- bzw. Letztstücke (1,89 µm): Zwei-Gruppen-Modell Cpk-Äquivalent 0,98 (≈ 1 700 ppm), lineare Drift 1,15 (≈ 300 ppm). Das Paar bleibt in jedem Modell nicht ok; die ppm-Zahl hängt um den Faktor 10–100 am Modell und wird deshalb nur als Größenordnung gezeigt.
- **Hüll**, schlechtestes Paar S4×M6, G16/KR3: Min/Max 73,1…88,2 (−4,0), 7 von 100 Kombinationen über 85 µm, Ĉ 0,50 / unten 0,28.
- **Pferch**, S7×M3, G2/KR1: 64 von 100 Kombinationen unter 15 µm, Ĉ −0,13. Min/Max sagt dazu nur „außerhalb“; k/N zeigt, wie schwer der Fall ist.

**Empfindlichkeit (ok / knapp / außerhalb)**

| Variante | Gauss | Hüll | Pferch | Steigung |
|---|---|---|---|---|
| **Standard** | **84/9/6** | **44/35/20** | **66/17/16** | **98/1/0** |
| nur Punktschätzung (ohne Vertrauensgrenze) | 91/2/6 | 53/26/20 | 74/9/16 | 99/0/0 |
| Vertrauen 90 % | 89/4/6 | 51/28/20 | 71/12/16 | 99/0/0 |
| Vertrauen 99 % | 69/24/6 | 26/53/20 | 45/38/16 | 94/5/0 |
| Regel streng (A) | 68/25/6 | 23/56/20 | 39/44/16 | 92/7/0 |
| Cpk-Ziel 1,67 | 79/14/6 | 35/44/20 | 54/29/16 | 98/1/0 |
| Streuung robust gepoolt (A) | 85/8/6 | 58/22/19 | 75/11/13 | 98/1/0 |
| Streuung moderiert (Gutachten 1) | 90/7/2 | 56/25/18 | 77/12/10 | 99/0/0 |
| max(eigene, Pool) | 83/9/7 | 37/36/26 | 63/18/18 | 98/1/0 |

Die Zahl der Zellen „außerhalb“ ist stabil (6 bei Gauss), solange die Streuung je Auftrag oder robust gepoolt geschätzt wird. Die moderierte Streuung verliert 4 dieser 6 Zellen.

---

## 8. Deine Entscheidungen

1. **Statusregel und Schwellen.** Empfehlung: Standardregel mit 1,00 / 1,33 / 95 % (außerhalb unter 1,00; knapp unter 1,33 oder nicht nachgewiesen). Die strenge Regel bleibt als Option. Stärkstes Gegenargument: Bei der Standardregel kann „ok“ auch bedeuten, dass Cpk_unten nur knapp über 1,00 liegt, das Ziel 1,33 also nicht nachgewiesen ist. Die strenge Regel verlangt dagegen bei n = 10 praktisch Ĉ ≈ 2 und macht 25 Zellen bei Gauss knapp, sogar 7 bei der unkritischen Steigung.
2. **Streuung je Auftrag** (Übernahme nur bei n < 3). Empfehlung: ja, als einziger Modus. Gegenargument: breitere Grenzen, 7 Zellen werden nur durch die Unsicherheit knapp. Dafür ist die Bewertung als einzige Variante robust, wenn ein Auftrag abweichend streut, und ein Auftrag beeinflusst die anderen nicht.
3. **Stichprobe der Mutter (5 Erst- + 5 Letztstücke) als repräsentativ für den Auftrag akzeptieren.** Empfehlung: vorerst ja, mit Gesamtstreuung (konservativ) und Marke „E/L“. Parallel mit der Prüfplanung klären, ob in der Mitte des Auftrags korrigiert wird. Dasselbe gilt für die Spindel (10 Teile in etwa 6 Minuten = eine Ofencharge?). M7 an der Maschine ansehen: Versatz Erst→Letzt −8 µm.
4. **Umschalter und Standard.** Empfehlung: Min/Max bleibt Standard, bis du die Fähigkeit an den Daten freigegeben hast; danach wird „Fähigkeit“ Standard. „Mittelwerte“ entfernen: Du hast das Mittel abgelehnt, und μΔ steht in der Fähigkeit ohnehin im Tooltip. Gegenargument: Ein Vergleich mit älteren Exporten im Modus „Mittelwerte“ ist dann nur noch über den Kern möglich.
