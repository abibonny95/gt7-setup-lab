# Changelog

All notable changes are listed here. The project follows semantic versioning; `0.x` means the first, still evolving releases.

## 0.0.0 - first release
- Setup generator from weight, weight distribution, engine position, drivetrain, aspiration, center of gravity, front/rear tyres, PP, surface (tarmac, dirt, snow), circuit profile and driving style.
- Installed-parts awareness: only the settings the car can adjust are shown (suspension, LSD, center differential, aero, brake controller, transmission, 4WS, ECU, restrictor, ballast).
- Editable min/max/step and optional current values for every parameter.
- Live effect bars (under/oversteer, turn-in, stability, exit traction, braking, grip) and 17 quick fixes grouped by symptom.
- PP planner with ECU, power restrictor and ballast (weight and position), plus a loop that corrects its estimate from the PP read.
- Levels (auto, weak, neutral, strong or a percentage) for downforce, top speed and rear steering.
- Final drive and individual gear ratios as a percentage of each gear's range.
- Info popup on every option, glossary; save everything to a file (JSON) and reopen it later.
- Optional extra data (low/high-speed stability read as numbers and classified automatically, rotational G at three speeds), weight split as front:rear, estimated centre of gravity.
- Layout selector (FF, FR, MR, RR, 4WD) and unit selectors (kg/lb, CV/kW/hp, Nm/kgfm/lb-ft).
- Measure button (marks the setup you have in the car), per-value difference from it, undo and previous-setup restore, values summary.
- English and Italian, installable offline PWA.
