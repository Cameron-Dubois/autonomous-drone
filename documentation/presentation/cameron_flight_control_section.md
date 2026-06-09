# Presentation Prep — Cameron's Flight Control Section

Paste-ready content and notes for the CSE 123 design presentation (15 min + 5 min Q&A).
Cameron owns one principle-feature slide (~2 min) plus a short add-on to the prototype slide.
The slides support the talk — keep on-slide text minimal and say the rest.

---

## 1. Team deck outline (12 slides)

Bring this to the group to confirm owners and order. Slides 2, 10, and 12 are gaps in the
current deck that need owners before final formatting.

| # | Slide | Rubric area | Suggested presenter | Time |
|---|-------|-------------|---------------------|------|
| 1 | Title + team names | — | Anyone | 0:15 |
| 2 | Introduction — agenda / what we'll cover | Tell them what you'll tell them | Ethan or Stephen | 1:30 |
| 3 | Need & Goal Statements | Required | Ethan | 2:00 |
| 4 | Design Objectives | Required | Ethan | 1:30 |
| 5 | Design Overview + principle features (high level) | Overview | Stephen | 2:00 |
| 6 | Block Diagram | Required | Stephen | 2:00 |
| 7 | Wiring Diagram | Required | Stephen / Winnie | 1:30 |
| 8 | State Transition Diagrams | Principle features | Darin | 2:00 |
| 9 | Principle Feature — Flight Control & Validation | Principle features | Cameron | 2:00 |
| 10 | Design for Manufacture & Maintenance | Required | Abhiram / Winnie | 2:00 |
| 11 | Functional Prototype (brief) — what was prototyped + results | Required | Darin leads, Cameron adds ~0:30 | 2:00 |
| 12 | Aesthetic Prototype + Conclusion | Required + summary | Winnie / Abhiram + Ethan closes | 2:00 |

Three-part structure: intro (slide 2), body (slides 3–11), conclusion (slide 12).

---

## 2. Slide 9 — Cameron's primary slide (paste-ready)

**Title:** Principle Feature — Flight Control & Validation

**Bullets (4–5 max):**
- Two-layer control: the phone sends follow *intent*; the flight controller runs the inner loop
- Onboard loop at 100 Hz: IMU -> attitude estimation -> PID -> motor mixing -> ESCs
- Hardware-in-the-loop sim validates the same firmware against a software physics model before flight
- Barometric altitude brought up on the bench; product targets baro + GNSS fusion
- Designed but not yet demonstrated: closed-loop autonomous flight on the flight controller

**Visual (pick one, no code on slide):**
- `documentation/images/block_diagram.png` with the flight-controller path highlighted, or
- A simple flow: Sensors -> PID loop -> Motors, with a side path Phone -> NAV intent -> FC

**Speaker notes (put in the slide's notes field):**
> Slide 7 showed our target flight states. This slide is the control architecture behind them.
> Two layers: the phone computes follow geometry from GPS and sends high-level commands; the
> flight controller runs a 100 Hz stabilization loop and owns all safety limits. Because we
> couldn't fly yet, I built a hardware-in-the-loop simulator that runs the exact same control
> firmware against a physics model, so we can tune PID without risking the airframe. We also
> validated barometric altitude on the bench. The remaining work is closing the loop so the FC
> fully executes follow commands.

**Keep off the slide:** PID gain numbers, file paths, brainstorming, morphological charts.

---

## 3. Slide 11 — Cameron's add-on to the Functional Prototype slide

This section must stay brief team-wide (~2 min total). Cameron contributes only his rows.
Optionally add 1–2 of these as bullets; otherwise just say them.

| Design element | Prototyped? | One-liner |
|----------------|-------------|-----------|
| PID attitude loop | Partially | Bench logging, props off |
| HIL simulation | Yes | Same firmware in a desktop physics loop |
| Follow navigation | Partially | Phone-side nav + commands to firmware; FC logs only |
| Barometer altitude | Yes | Relative altitude in telemetry |
| Autonomous flight | No | Designed, not demonstrated |

**Spoken (~30 sec):**
> On the bench we validated sensing, the command protocol, and the control logic in simulation.
> We did not demonstrate closed-loop flight — that's the next integration step on the production board.

---

## 4. Cameron's full script (~2 min)

Read this at a conversational pace. Target **1:50–2:10**. Pause briefly after each bullet so the audience can read the slide.

### Opening — 15 sec

> "I'm Cameron — I'll cover **flight control**: how the product is designed to fly, and how we validated that **without a flying prototype**."

*Point at the two-layer diagram if it's on screen.*

### Body — 90 sec

**Layer 1 — phone (20 sec)**

> "Darin's slide showed our target flight states — takeoff, hover, follow. My work is the **control architecture** behind those states.
>
> There are **two layers**. The **phone** reads its own GPS and the drone's GPS over Wi‑Fi, computes follow geometry — distance, bearing — and sends **high-level intent** over BLE: things like forward, hold, rotate. That's roughly **1–5 Hz**, which is fine for navigation."

**Layer 2 — flight controller (35 sec)**

> "The **flight controller** runs a much faster **inner loop at 100 Hz** — that's once every 10 milliseconds. At that rate it reads the IMU, fuses accelerometer and gyro into an attitude estimate, runs PID on pitch, roll, and yaw, and mixes motor commands for our X-quad layout.
>
> **Why 100 Hz?** A small quad's body can oscillate around 2–3 Hz. You need the control loop to run **much faster** than that — industry rule of thumb is **10–20×** — so corrections land before the frame tips further. Our IMU is also configured at 100 Hz, so the loop matches the sensor rate.
>
> Critically, **safety stays on the drone**: arm/disarm, emergency stop, and a link-loss timeout that disarms if the phone stops talking."

**Validation path (25 sec)**

> "We couldn't do closed-loop flight on the bench yet, so I built a **hardware-in-the-loop simulator**. The **exact same firmware** — same fusion, same PID, same mixer — runs on an ESP32, but instead of real motors and a real IMU, a Python physics model on my laptop feeds simulated sensor data over USB. That let us tune gains and test disturbances like wind **without risking the airframe**.
>
> On the bench we also brought up **barometric altitude** in telemetry — relative height from a pressure sensor — which the product will fuse with GPS for altitude hold."

**Close — 20 sec**

> "So the **design** includes a complete inner control loop and a real validation path. What's **left** is closing the outer loop: the FC fully executing those `NAV_*` follow commands on the production board. Darin will walk through what we **did** demonstrate on the bench next."

### Handoff

> "Next slide, please." *(or agreed gesture)*

### If you're running long — cut these first

1. Drop the "why 100 Hz" paragraph (save it for Q&A).
2. Shorten HIL to one sentence: "Same firmware, simulated physics, no airframe risk."
3. Skip barometer unless someone asks.

### If you're running short — add one line

> "Solid lines on our architecture diagram are what we demonstrated; dashed lines are designed but not yet integrated on the prototype firmware."

---

## 5. Slide 11 add-on script (~30 sec)

Use only if Darin hands to you on the prototype slide.

> "For my pieces: we **partially** validated the PID attitude loop on the bench with props off — IMU and control logging. **HIL simulation is fully working** — same firmware in a desktop physics loop. **Follow navigation** works on the phone side and commands reach the firmware, but the FC **logs** them rather than executing closed-loop flight yet. **Barometer altitude** is in telemetry. **Autonomous flight** — designed, not demonstrated. That's the next integration step on the production board."

---

## 6. Q&A cheat sheet

**Format:** one sentence first, then one sentence of detail only if they push. Don't recite PID gains or file paths unless asked.

### High-probability questions

| Question | Short answer | If they push |
|----------|--------------|--------------|
| **Why 100 Hz?** | The inner loop runs every 10 ms because attitude control needs to be much faster than how fast the frame can tip — roughly 10–20× the body's natural oscillation frequency. | Our quad's pitch/roll dynamics are around 2–3 Hz; 100 Hz gives enough samples per oscillation to correct before it grows. The IMU is also set to 100 Hz ODR, so we're not wasting or starving data. BLE nav commands are slow; only stabilization needs to be fast. |
| **Why didn't the drone fly?** | This quarter we prioritized comms integration, protocol, and validating control in simulation and on the bench — not closed-loop autonomous flight. | Executing `NAV_*` commands on the FC is in the design and the app already sends them; prototype firmware logs them. Next step is tethered hover, then follow on the production PCB. |
| **Is follow-me safe on the phone?** | No — and that's intentional. The phone only sends **intent**; the FC enforces limits and can stop motors independently. | Documented failsafes: `ESTOP`, disarm on link-loss timeout (~6 s after last BLE command), speed/altitude limits on board. Phone GPS can be stale or wrong; the FC must not blindly obey. |
| **What is HIL / how does it work?** | Hardware-in-the-loop: real flight-controller firmware on an ESP32, but sensors and motors are replaced by a Python physics sim on a PC over USB serial. | Same `pid.c`, same complementary filter, same X-quad mixer as `flight_control/`. PC sends accel/gyro packets; ESP32 returns motor duties; physics integrates thrust and updates attitude. We used it to tune PID, test wind gusts, and check hover duty before touching props. |
| **What is the two-layer model?** | Outer layer: phone computes where the drone should go relative to the user. Inner layer: FC stabilizes attitude and thrust at 100 Hz. | Outer → `NAV_FORWARD`, `NAV_HOLD`, etc. over BLE. Inner → IMU → complementary filter → PID → motor mix → ESCs. Product design adds a navigation executor on the FC that turns outer intent into inner setpoints. |
| **What's left for production?** | Unified firmware on the custom PCB that executes navigation commands with geofencing and full failsafes. | Merge split prototype images, close the `NAV_*` execution path, altitude hold from baro + GNSS, manufacturing test FLT-01 hover/failsafe gate. |
| **What did you personally build?** | Flight control firmware architecture, HIL simulator, bench validation of IMU/PID path and baro telemetry integration. | `flight_control/` attitude loop, `flight_sim/` bridge + physics, design-doc flight architecture section, tethered bring-up checklist in firmware. |

### Technical follow-ups (medium probability)

| Question | Short answer | If they push |
|----------|--------------|--------------|
| **What is PID?** | Proportional–integral–derivative control: P reacts to current error, I removes steady drift, D dampens overshoot. We run separate PID on pitch, roll, and yaw. | Pitch/roll are angle-mode (level the frame). Yaw is rate-mode (hold zero spin). Gains were tuned in HIL first, then bench with props off, then tethered bring-up mode with capped throttle. |
| **What is a complementary filter?** | It blends accelerometer (good long-term, noisy short-term) with gyro (good short-term, drifts long-term) to estimate tilt. | We use α = 0.98 — mostly trust gyro between samples, gently correct with gravity vector from accel. Standard approach for small quads without a full Kalman filter on the MCU. |
| **What is motor mixing?** | Converts "correct pitch/roll/yaw" into four individual motor speeds for an X-quad layout. | Differential thrust: nose-up command speeds rear motors, slows front motors. We verified mix direction on the bench with props off before any tether test. |
| **Why not run everything on the phone?** | Latency and reliability — BLE/Wi‑Fi jitter and OS scheduling can't guarantee a 10 ms control loop. | Phone is fine for 1 Hz navigation. Stabilization must be hard-real-time on the FC. Same reason commercial drones don't fly from an app inner loop. |
| **How accurate is phone GPS for follow?** | Fine for walking-speed follow at several meters offset; we filter stale fixes and flag weak accuracy. | App ignores fixes older than a threshold and can enter `WEAK_PHONE_GPS`. Product FC should hold or slow if quality drops — not only the phone's job. |
| **Barometer vs GPS altitude?** | Baro gives smooth relative height indoors and fast updates; GPS altitude is noisier but absolute outdoors. | Product targets fusion: baro for hold, GNSS for global position. Bench demo streams BMP280 relative `altM` in telemetry. |
| **What sensors on the FC?** | IMU for attitude (demonstrated), barometer for altitude (demonstrated in telemetry), GNSS + magnetometer for outdoor nav (product / partial bench). | ICM-42670-P IMU on prototype; BMP280 baro on wifi_gps bench build; follow uses phone + drone GNSS with compass for heading. |

### Skeptical / rubric questions

| Question | Short answer |
|----------|--------------|
| **You didn't fly — is the design validated?** | We validated the **risky** part — fast attitude control — in HIL and on the bench. We validated **comms, protocol, and phone-side nav** end-to-end. Full closed-loop flight is the remaining integration step, and we have a defined bring-up checklist for it. |
| **How is this different from a toy drone app?** | Toy apps often do manual RC over Bluetooth. We designed **autonomous follow** with a documented binary protocol, dual-link architecture, and safety-critical logic on the FC — closer to how real products split phone UX from onboard control. |
| **What if the sim is wrong?** | HIL de-risks tuning; it doesn't replace flight test. We model thrust, battery sag, wind, and crashes — but we still have tethered and open-hover steps before claiming flight readiness. Sim and firmware share the same PID code so findings transfer directly. |
| **Who owns what in the stack?** | Cameron: inner loop + HIL + flight architecture doc. Darin: states / prototype integration. Mobile team: phone nav + `NAV_*` mapping. Winnie/others: server, DFM, etc. *(Adjust to match your actual split.)* |

### Questions to deflect gracefully

| Question | Response |
|----------|----------|
| **What are your PID gains?** | "Tuned per airframe mass in HIL — happy to share offline; the slide stays at architecture level." |
| **Show me the code.** | "The repo has `flight_control/` and `flight_sim/`; this talk is the system design view." |
| **When will it fly?** | "Tethered hover is the next hardware milestone on the production board; autonomous follow after `NAV_*` execution is integrated." |

### One-liner reminders (memorize these)

- **100 Hz:** "Fast enough to catch tipping before it runs away; slow enough for our MCU and IMU."
- **Two layers:** "Phone says *where*; drone says *how* — and owns the motors."
- **HIL:** "Same firmware, fake physics, real confidence."
- **Not flown:** "Designed and partially validated — integration, not invention, is what's left."

---

## 7. Team logistics / rehearsal checklist

- Slide driver: one person advances; others signal verbally ("Next slide, please") or with an agreed gesture.
- Daily review: check formatting consistency (fonts, colors, bullet style) across all 12 slides.
- Practice target: full run-through under 14 minutes leaves buffer; Cameron's segment should never exceed 2.5 min.
- Confirm owners for the three gap slides (2 intro, 10 DFM, 12 conclusion) before final formatting.
- Final deliverable: export the Google Slides deck as a single PDF and submit after the Week 10 presentation.

**Conclusion slide content (team) — repeat the three design pillars:**
1. Smartphone-only control over a dual BLE + Wi-Fi link
2. Autonomous follow-me using phone + drone GNSS
3. Modular, repairable hardware with a defined path to closed-loop flight

---

## 8. Assets to pull from the repo

- `documentation/images/block_diagram.png` — system context for slide 9
- `documentation/markdown/5_Evaluation.md` — prototype vs product status (source for slide 11 rows)
- `flight_sim/README.md` — HIL architecture diagram (screenshot if a second visual is wanted)
- `documentation/images/app_home.png` — only if the prototype slide needs one app image; prefer still hardware photos per the rubric
