# Early-level difficulty: research (reference)

Tier: REFERENCE (rule 5): long, nobody reviews it; the decision page is `docs/difficulty/research-early.html`.
Date: 2026-11-22. Trigger: Duy played Đường Ray and found L1–10 too hard for an opening ("tôi expect ở những level đầu như 5 hay 10 levels đầu nên dễ hơn xí").
Method: Workflow `difficulty-ramp-research` (run wf_f5f2a774-788): 3 web lenses (science, industry, brain-training) + 1 codebase reader, then 3 fact-checkers who reopened every URL; only claims marked confirmed feed the synthesis.
Review label: same vendor, same priors — no external verifier ran.

## Synthesis

Brainy Bits: early-level difficulty for Đường Ray (train), evidence synthesis

1. WHAT THE EVIDENCE SAYS ABOUT EARLY-LEVEL DIFFICULTY

A. When the game sets the difficulty, easier means more play.
- Lomas et al., CHI 2013, Battleship Numberline, 10K and 70K players. "The easier the game, the longer people played." The relationship was linear, with no inverted U (quadratic fit p=0.8). The easiest condition had 63% success against 29% for the hardest, and produced 34% more estimates and 18% more time played. "The shortest time limits were the most disengaging of any design factor." The cost was that the most engaging conditions gave the slowest learning. [MEASURED] https://www.stat.cmu.edu/~brian/463-663/project-part-one/Optimizing%20Challenge.pdf
- Lomas, Koedinger et al., CHI 2017, "Is Difficulty Overrated?": "players almost always preferred the easiest versions"; "early game experiences should minimize difficulty and provide a moderate degree of novelty"; "players who barely won were the most motivated". An inverted U appeared only when players chose their own difficulty. [MEASURED, summary page only] https://hcii.cmu.edu/news/chi-preview-researchers-hcii-believe-difficulty-can-be-overrated-games
- Jansen et al. 2013 (Math Garden, 207 children): the higher the preset success rate, the more problems the children attempted and the more they improved. [MEASURED] https://dare.uva.nl/id/789fc422-4935-49ca-bcba-803239522951
- Brändle, Wu, Schulz 2025, Scientific Reports. Across about 1.8M ratings of levels (Mario Maker, Trackmania, Robozzle), at the low-difficulty end "players preferred simpler levels". Success raised engagement. Levels whose difficulty matched what players expected scored best (that last finding comes from their controlled experiment). [MEASURED] https://charleywu.github.io/downloads/braendle2025leveling.pdf

B. Failed levels predict quitting, most of all early on.
- Ascarza, Netzer, Runge 2023, field RCT on an F2P puzzle game. Across L1-100, level difficulty correlates 0.880 with the share of players who quit for 30 days at that level. After a failed level, players are 14% more likely to pause for 10 minutes or more. Lowering difficulty raised engagement by about 20%, plus retention and spend. Next-day return rises with the number of levels passed that day. Caveat: the RCT covered only players past level 20. [MEASURED] https://business.columbia.edu/sites/default/files-efs/citation_file_upload/ascarza_netzer_runge_2023-12-04.pdf
- Roohi et al., CHI PLAY 2020, Rovio, Angry Birds Dream Blast, 95,266 players, 168 levels. Churn without completing a level correlates with difficulty (Spearman r = -0.586). "Average churn rate in early levels is higher than in the later levels", because low-skill and low-persistence players leave early. The low-skill-players reading is the authors' explanation, not a direct measurement. [MEASURED] https://arxiv.org/abs/2008.12937
- King (GDC 2024 via MobileGamer.biz): "If you make the level harder, the probability that more people churn goes up." Hard levels pay off mainly through conversion, and "retention always wins" (attributed to Jan Wedekind). "If a level is really hard, it should also be really short." [OPINION] https://mobilegamer.biz/how-king-defines-a-good-candy-crush-saga-level-and-why-it-constantly-prunes-the-bad-ones/
- Playrix: several hard levels in a row demoralize players. They simplified an early high-dropout level (L93) and kept the change despite a small monetization loss. [OPINION] https://gameworldobserver.com/2019/09/27/playrix-levels-elements-match-3

C. Where the market leader puts its first spike.
- Royal Match, from a third-party teardown. L11-22 are "short and easy" at about 1.1 attempts per success, roughly 90% or more first-try passes. The first hard level is held back to L39. Normal levels run about 1.2 attempts (≈0.83 first-try pass), hard levels about 1.6 (≈0.62). L1-20 also get extra moves, so the early budget is looser, not just the layouts. [OPINION, analyst estimate] https://www.gamigion.com/why-does-royal-match-wait-22-levels-to-introduce-their-first-live-op/ and https://www.gamigion.com/royal-match-level-design-insights/

D. How onboarding should be structured.
- Linehan et al., CHI PLAY 2014 (Portal, Braid, Lemmings): each skill is introduced on its own in a simple puzzle, and complexity rises only until the next skill arrives. [Structural analysis] https://cora.ucc.ie/handle/10468/3461
- Apple: "Begin with basic elements and allow players to demonstrate competency before moving on"; teach one step at a time. [OPINION] https://developer.apple.com/app-store/onboarding-for-games/
- Andersen et al., CHI 2012, more than 45,000 players: tutorials helped only in the complex game. In simple games the early levels themselves are the tutorial. [MEASURED] https://grail.cs.washington.edu/projects/game-abtesting/chi2012/
- Corsi span task: starts at a length almost everyone passes and allows two attempts per length. [Framework] https://www.millisecond.com/library/corsiblocktappingtask
- Elevate and CogniFit place new players with an onboarding test, then adapt in both directions. [OPINION] https://support.elevateapp.com/hc/en-us/articles/4402971716891-What-is-Difficulty and https://Cognifit.com/cognifit-individualized-training-system

E. Targets that are often quoted but do not apply.
- The "85% rule" (Wilson et al. 2019) is the optimal training accuracy for gradient-descent learners on binary tasks. The authors leave the link to engagement untested ("it will be interesting to test"). It is not an enjoyment or retention target. [Framework] https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579/
- Math Garden targets 0.75 as the steady-state success rate for long-term child practice, and its hardest setting uses 0.6. It is not an onboarding target. [MEASURED] https://pmc.ncbi.nlm.nih.gov/articles/PMC6480732
- Flow theory: challenge-skill balance predicts flow only moderately (meta-analysis of 28 studies) and gives no number. [MEASURED] https://instituteofcoaching.org/resources/challenge%E2%80%93skill-balance-and-antecedents-flow-meta-analytic-investigation

F. Counter-evidence.
- Lumosity, 99,022 new users: exposure closer to threshold early on produced faster learning. This measured learning, not retention, and comes from a conference press release. [MEASURED, weak] https://www.eurekalert.org/news-releases/697360
- Huang et al. 2019: challenge helps players with low or medium engagement. Small sample, not mobile. [MEASURED] https://www.eurekalert.org/news-releases/590150
- Both argue against making L1-10 trivial. Neither argues against making them easier than now.

Net: no source supports a peak at L10 with p*=0.77. Every retention-oriented source points to a high, flat opening (about 0.90 or more first-try), one new element at a time, no back-to-back hard levels, and a first real spike well after L10.

2. GAP ANALYSIS: WHY ĐƯỜNG RAY FEELS HARD AT L1-10

A. The template is front-loaded and spikes early.
- p* drops from 0.92 to 0.888 between L1 and L2, because D(L)=√((L−1)/29) is steepest at the start (js/difficulty.js:47).
- It then slides to 0.831 at L9 and puts a full peak of 0.765 at L10 (PEAK_DIP 0.06).
- Royal Match holds about 0.90 through L22, and its first hard level is at L39.
- L10's 0.765 is about Math Garden's long-term target (0.75), and the weak bot's 0.569 at L10 sits just under Math Garden's hardest setting (0.6).

B. The knobs move as a step function, with two knobs at once.
- L1-5 base: 3.27-3.49. L6-9 base: 2.81-2.93.
- L5→L6: the spawn gap shrinks 11% and a station is added in the same step. Trains on screen go from about 4.6 to about 5.4. Weak bot drops 85.9% → 73.8%.
- L6-10 then add one station (one switch) per level on top of the denser traffic. L7 also moves to 7 columns, so cells get smaller.
- L10 shrinks the gap another 6.4% and adds a station. Weak bot: 67.8% → 56.9%.
- This breaks three findings: one new element at a time (Linehan), the first level with a new element should be easy (Apple), and no back-to-back hard levels (Playrix).
- Spawn gap is time pressure, which Lomas found the strongest disengager.
- L5 was retuned to 5 stations with denser trains, which makes the L6 jump sharper.

C. Calibration is on the median bot, and only L1-5 have a gate for weaker players.
- Gate G1 (weak ≥ 0.85) covers only L1-5. No gate covers L6-9 (docs/DIFFICULTY-RULES.md:81 already notes this).
- Roohi's data say early levels contain the weakest population the game will ever see, so the weak profile, not the median, should set the early floor.

D. The bot is a better player than a first-time phone player, so even the weak-bot numbers are optimistic:
- It knows the rules from the first train. It never flips the wrong switch, double-taps one back, or misreads a side.
- It never flips too early. Flipping early and misrouting the train ahead is probably the most common novice error, and the sim cannot produce it.
- It always handles the train with the earliest deadline first. It never panics or freezes.
- A remembered route costs a flat 200 ms.
- A touch slip only ever means "no flip". It never means "flipped the neighbouring switch", and cell size has no effect.
- Reaction times come from lab go/no-go tasks, with no glance-away gaps.
- Learning is off on the first attempt, and all its cost constants are unsourced.
- In the other direction, the bot ignores the 3.6 s countdown, which a human can use to pre-set switches.

Net: the owner's "too hard at L1-10" is consistent with everything above. The curve targets onboarding pass rates that are too low and steps two knobs at once. It is calibrated on an optimistic bot, whose L6-10 numbers no gate checks against weaker players.

3. RECOMMENDATION

Options:

A. Retune train knobs only and keep the template.
- Gain: one file (js/levels/train.js). Fast, and other games are untouched.
- Lose: the template still asks for 0.765 at L10, and gate B rejects an L10 that is much easier than about 0.815, so the L10 peak cannot be removed.
- Risk: the other 4 games keep the same early spike, and nobody has played them with this in mind.

B. Change the template for all 5 games, add a weak-bot gate for L6-10, then retune train first.
- Gain: fixes the cause, not one game, and the gates enforce it from now on.
- Lose: all 5 games need recalibration, and L11-30 shift.
- Risk: early levels that are too easy could feel boring. The evidence (Lomas, Brändle) says this risk is small, and later levels still ramp.

C. Make the bot model more novice-like (early-flip errors, wrong-neighbour taps, panic under density), then recalibrate.
- Gain: the simulated pass rates come closer to real players.
- Lose: every new constant would also be unsourced. Without real-player data, this swaps one guess for another.
- Risk: it gives false precision and delays the fix.

Pick B, with train as the first game recalibrated. Leave C until real play data exists. Instead, add a conservative margin: calibrate early levels on the weak bot.

Proposed p* for L1-10:
- Median bot: L1 0.97, L2 0.96, L3 0.95, L4 0.95, L5 0.94, L6 0.93, L7 0.92, L8 0.92, L9 0.91, L10 0.90.
- New weak-bot floors: ≥ 0.90 on L1-5, ≥ 0.82 on L6-10. The current gate is weak ≥ 0.85 on L1-5 only.
- No peak before L15. Make L15 the first, mild peak (median about 0.84, weak ≥ 0.70), with the breather at L16.
- Get the tension in L1-10 from novelty (a new layout or station count) and close wins, not from failure.

These numbers are my judgement, not a figure from any source. The sources support the direction: about 0.90 first-try through the first session (Royal Match), "minimize early difficulty" (Lomas 2017), higher preset success leading to more practice (Jansen). The weak-bot floor and the bot's optimism set the margin.

Template mechanics:
- Replace the √ drop for L ≤ 10 with a plateau that declines about 0.007 per level from 0.97.
- Set SAW_FROM_PERIODS so the first peak lands at L15.
- Extend gate G1 (weak floor) to L1-10.
- Keep B_EASY_OK_BEFORE_SAW.

Train knob direction (starting values to recalibrate, not final):
- Change one knob per level. A level that adds a station holds the spawn gap. The next level then tightens the gap a little (about 3%).
- Undo the L5 retune so L5 has no denser traffic than L4.
- Stop the L5→L6 cliff: L6 keeps base at about 3.4 with 6 stations.
- Ramp base gradually toward the current L6-9 band (2.8-2.9) by about L12-14, not at L6.
- Keep L7 (the move to 7 columns) at a looser gap, because cells shrink there.
- When the first peak comes at L15, make it short (fewer trains or a shorter round), not only denser (King).
- Cheap extras the evidence supports: one free retry on L1-5 (Corsi pattern), and a visible "challenge level" cue before the first peak so its difficulty matches what the player expects (Brändle).

4. WHAT REMAINS UNVERIFIED

- No published benchmark for first-try pass rates on L1-10 of casual mobile games. The Royal Match figures are a third-party teardown. Studios (King, Playrix, Dream Games, Peak, Elevate, Lumosity) publish none.
- No study measures enjoyment or retention at 85% success in humans.
- The causal RCT (Ascarza) covers players past L20. Applying it to L1-10 is an extrapolation.
- Lomas 2017 per-condition numbers, Allart 2017, Fernandes & Levieux 2022, Constant & Levieux 2019, and the Sensor Tower FTUE study were not read in full.
- No data on Gen Z or Vietnamese players' tolerance for early failure. Bryter and Plarium are indirect and self-reported.
- Brainy Bits has no real-player data. All bot cost constants are unsourced, and the bot is probably optimistic in specific, known ways. So how a given median-bot p* maps to a real first-time pass rate is unknown, and the proposed numbers will need checking against real play (even the owner's own runs, logged).
- Trains per round and trains on screen are derived figures, not simulator output. I did not run the simulator on the proposed curve, so whether the train knobs can reach it is untested.
- Same vendor, same priors: no external verifier ran on this synthesis.

## Appendix: codebase report (train)

Only two knobs change from L1 to L12: `stations` and `base` (the spawn gap). The biggest cliff is L5→L6, where trains come 11% closer together and the map gains a station. No gate covers L6–9, and in the simulator the weak bot drops from 86% to 74% there. The bot is also more skilled than a first-time phone player in several concrete ways (section 3). All file references are relative to `/Users/edwardpham/Documents/Programming/Vibe/brainy-bits`.

## 1. What changes per level, L1–L12

**Constant on every level:**
- **Round time** is 90 s (`js/train.js:23`).
- **Pass bar** is 80% (`js/train.js:590`; sim `scripts/sim/adapters/train.mjs:27`).
- **Train speed:** `speedF` is 0.28 on every row (`js/levels/train.js:50`), so speed = 2.6·0.28 = 0.728 cells/s (`js/train.js:101`, adapter `:100`).
- **Bursts:** `burstP` is 0 (`js/levels/train.js:50`).
- **First train** comes 1.0 s after the start (`js/train.js:86`), following a 3.6 s countdown (`js/train.js:566`).

**What changes:**
- `stations`: `L<=2||L===5 ? 5 : L<=6 ? 6 : min(L,15)` (`js/levels/train.js:41`).
- `base` (spawn gap): the `BASE` array at `js/levels/train.js:43-45`.
- The real gap is `base × U(0.75–1.35)` with 82% chance, or `base × U(1.5–2.1)` as a rest with 18% chance (`js/train-map.js:30-35`). That makes the mean gap about 1.185·base. I derived that figure; the 1.14 comment at `js/levels/train.js:5` describes the v1 mix with bursts.
- Grid columns are 6 for ≤6 stations, 7 for 7–11 and 8 for 12+ (`js/train-map.js:39-40`). More columns means smaller cells on the same phone.
- A tree with n stations has n−1 switches. I measured switches and depth with `mapPool` over 10 maps per station count.

| L | kind | p* | stations | switches | avg switches on a route | base | mean gap (s) | trains/round* | trains on screen* | sim weak / median pass |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | step | .920 | 5 | 4 | 2.5 | 3.41 | 4.04 | ~23 | ~4.4 | .873 / .950 |
| 2 | step | .888 | 5 | 4 | 2.5 | 3.37 | 3.99 | ~23 | ~4.5 | .876 / .928 |
| 3 | step | .875 | 6 | 5 | 2.8 | 3.49 | 4.14 | ~22 | ~4.5 | .864 / .919 |
| 4 | step | .865 | 6 | 5 | 2.8 | 3.43 | 4.06 | ~22 | ~4.6 | .851 / .910 |
| 5 | step | .857 | 5 | 4 | 2.5 | 3.27 | 3.87 | ~24 | ~4.6 | .859 / .900 |
| 6 | step | .849 | 6 | 5 | 2.8 | **2.91** | 3.45 | ~26 | ~5.4 | **.738** / .865 |
| 7 | step | .843 | 7 (7 cols) | 6 | 2.9 | 2.93 | 3.47 | ~26 | ~5.6 | .734 / .843 |
| 8 | step | .836 | 8 | 7 | 3.2 | 2.88 | 3.41 | ~27 | ~5.8 | .697 / .832 |
| 9 | step | .831 | 9 | 8 | 3.3 | 2.81 | 3.33 | ~27 | ~6.1 | .678 / .833 |
| 10 | peak | .765 | 10 | 9 | 3.5 | **2.63** | 3.12 | ~29 | ~6.5 | **.569** / .765 |
| 11 | breather | .820 | 11 | 10 | 3.7 | 3.12 | 3.70 | ~25 | ~6.0 | .694 / .844 |
| 12 | step | .815 | 12 (8 cols) | 11 | 3.9 | 3.30 | 3.91 | ~23 | ~6.1 | .673 / .813 |

\* Derived by me. Trains/round = 87.5 s spawn window ÷ mean gap + 1. Trains on screen = mean route length ÷ 0.728 ÷ mean gap.

The pass rates come from `docs/difficulty/calibration-train.json` (N=1200, 2026-11-22, `levels[].profiles`).

## 2. The biggest jumps between consecutive levels

1. **L5→L6, the biggest cliff.**
   - `base` drops 3.27 → 2.91 (−11%) and stations go 5 → 6, so two knobs harden at once.
   - Weak bot: 85.9% → 73.8% (−12 points). Median: 90.0% → 86.5%.
   - L1–5 sit almost flat (base 3.27–3.49), then L6–9 sit on a lower plateau (2.81–2.93). The difficulty is effectively a step function at L6, not a ramp.
   - The team already noted this drop and that no gate catches it: `docs/DIFFICULTY-RULES.md:81`.
   - L5 was retuned down to 5 stations with denser trains (`js/levels/train.js:24-27`). That makes the L6 jump in gap even sharper.
2. **L9→L10, the first peak.** `base` drops 2.81 → 2.63 (−6.4%) and a station is added. Weak bot: −11 points (.678 → .569). Median: −6.8 points.
3. **L6→L10, one station per level.** Stations rise every level (5 → 10, switches 4 → 9) while the gap barely changes.
   - L7 moves to 7 columns (`js/train-map.js:40`). L12 moves to 8 columns, so cells shrink.
   - Cell size does not enter the bot's cost model at all.
4. **The target curve itself is front-loaded.** p* falls 0.920 → 0.888 from L1 to L2 because the curve uses √(L−1) (`js/difficulty.js:47`).

## 3. How the bot models a human, and why it is likely more skilled than a first-time phone player

**How it works:**
- **Reaction time:** ex-Gaussian, taken from lab go/no-go tasks, not from a game.
  - Median profile: μ451/σ47/τ147 ms (`scripts/sim/human.mjs:74`).
  - Weak profile: 526/93/305 ms, which is the "older adults" row (`scripts/sim/human.mjs:63`).
- **Lapse:** 3% (median) or 5% (weak) per train. A lapse sends the train to a wrong station (`scripts/sim/human.mjs:67,78`; adapter `:112,138`). It is marked `[NEW]`, meaning a prior with no source.
- **Mis-tap:** 0.2% / 0.4% per tap (`scripts/sim/human.mjs:68,79`).
- **Working memory:** at most floor(K) trains with planned flips, with K ~ N(4,1) or N(3.5,1) (`scripts/sim/human.mjs:65,76`; adapter `:106,140`).
- **Thinking costs** (all `[NEW]`, unsourced):
  - Search: 40 ms per station.
  - Route tracing: 150 ms per switch.
  - Recall of an already-seen station: 200 ms.
  - Planned tap: 250 ms.
  - Source: `scripts/sim/adapters/train.mjs:28-31`, applied at `:137,157`.
- **Learning:** a power law, T = A + B(n+E)^−R (`scripts/sim/human.mjs:107-111`).
  - It is off for the first attempt (`scripts/sim/human.mjs:115-116`; `scripts/sim/calibrate.mjs:69`).
  - It is on only for the G8 "pass within 3 attempts" retries (`scripts/sim/calibrate.mjs:73`).
  - The parameters are placeholders: "shape only" (`scripts/sim/human.mjs:105-107`).

**Why it is probably more skilled than a first-timer on a phone:**
1. **It knows the rules perfectly from the first train.** The routes and the correct side of every switch are computed exactly (`scripts/sim/adapters/train.mjs:49-59`). Its only error modes are a whole-train lapse and a "no flip" mis-tap (`:138,160`).
   - It never flips the wrong switch.
   - It never double-taps a switch back.
   - It never misreads which side leads where.
   - It never "rescues" one train and breaks another.
   - The "first attempt" has the profile's full skill. Nothing models learning what a switch does.
2. **It always knows the right moment to flip.** It waits until the previous train that needs the other side has cleared, and only then flips (`scripts/sim/adapters/train.mjs:147-152`). It also skips switches already set correctly (`:156`).
   - A real player flips early and misroutes the train ahead. That failure cannot happen in the sim, and it is likely the most common novice error in this kind of game.
3. **It schedules perfectly.** It always handles the train with the earliest deadline first, knowing every train's exact clear time (`scripts/sim/adapters/train.mjs:120-131`). It never panics, freezes or chases the wrong train as density rises.
4. **Remembered routes are almost free.** Once a station has been seen, rerouting to it costs a flat 200 ms (`scripts/sim/adapters/train.mjs:30,136-137`). This assumes the map is memorized after one look.
5. **Touch is too precise.** A slip only ever means "no flip", never "flipped the neighbouring switch".
   - Hit radius is `max(32, TR+16)` px (`js/train.js:288`). Switches can sit √2 cells apart (`scripts/sim/adapters/train.mjs:175-187`).
   - Cell size and the shrinking grid at L7 and L12 do not change any bot cost.
6. **The reaction times come from a lab.** They are go/no-go numbers (`scripts/sim/human.mjs:63,74`), not mobile play with divided attention. Only one lapse is drawn per train, so there are no notification or glance-away gaps longer than that.
7. **The "median" bot is the median of a lab population, not a first-time casual player.** Even the "weak" profile, labelled "novice" (`scripts/sim/human.mjs:59`), is protected only on L1–5, where gate G1 requires weak ≥ 85% (`docs/DIFFICULTY-RULES.md:210`).
8. **One place where the bot is weaker than a human.** It does not use the 3.6 s countdown, even though the screen tells the player to pre-set switches (`js/train.js:503`).
9. **One rule may not match people.** In the sim, a faster train is easier (`js/levels/train.js:65-66`). That is unverified for humans.

## 4. Where the p* targets come from

- **Formula:** `pStar(L) = max(floor, P_TOP − (P_TOP − pBottom)·D(L) − (peak ? PEAK_DIP : 0) + (breather ? BREATHER_OFFSET : 0))` at `js/difficulty.js:57-64`.
  - P_TOP = 0.92 (`js/difficulty.js:32`).
  - PEAK_DIP = 0.06 (`js/difficulty.js:33`).
  - BREATHER_OFFSET = 0 (`js/difficulty.js:34`).
  - E1 = 'A' (`js/difficulty.js:15`) selects l30Peak 0.69 and floor 0.65 (`js/difficulty.js:40`), so pBottom = 0.69 + 0.06 = 0.75 (`js/difficulty.js:59`).
  - D(L) = √((L−1)/29), with REF_L = 30 (`js/difficulty.js:27,47`).
- **Level kind:** `kind(L)` (`js/difficulty.js:51-56`) with PERIOD 5 and SAW_FROM_PERIODS 2 (`js/difficulty.js:28,31`). That gives no peak before L10, a peak at L10 and a breather at L11.
- **Owner decisions** are recorded in `gates/01-spec/DIFFICULTY-DECISIONS.md`, referenced at `js/difficulty.js:13`.
- **Gates during calibration:**
  - Gate B uses BAND = 0.05 (`scripts/sim/calibrate.mjs:13`). On L1–9 it fails a level only when it is too hard, because `B_EASY_OK_BEFORE_SAW` is on (`js/difficulty.js:30`; `docs/DIFFICULTY-RULES.md:209`). Making L1–9 easier therefore breaks no gate.
  - The only other floor in the early levels is G1, weak ≥ 0.85 on L1–5 (`docs/DIFFICULTY-RULES.md:210`).

## Not verified

- No real-player data exists. Every human cost constant marked `[NEW]` is unsourced, by the code's own admission (`scripts/sim/human.mjs:20`).
- Trains/round and trains-on-screen are my own derivations, not simulator output.
- Switch counts and depth are averaged over the 390×700 map pool only.

I edited no project files. The only file I wrote is the scratch measurement script `/private/tmp/claude-501/-Users-edwardpham-Documents-Programming-Vibe/2a443e3d-2689-4f66-a354-70e286b7302a/scratchpad/tr.mjs`.
