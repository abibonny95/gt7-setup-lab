# Changelog

All notable changes are listed here. The project follows semantic versioning; `0.x` means the first, still evolving releases.

## 0.0.0 - first release
- Setup generator from weight, weight distribution, engine position, drivetrain, aspiration, center of gravity, front/rear tyres, PP, surface (tarmac, dirt, snow), circuit profile and driving style.
- Installed-parts awareness: only the settings the car can adjust are shown (suspension, LSD, center differential, aero, brake controller, transmission, 4WS, ECU, restrictor, ballast).
- Editable min/max/step and optional current values for every parameter.
- Live effect bars (under/oversteer, turn-in, stability, exit traction, braking, grip) and 17 quick fixes grouped by symptom.
- PP planner with ECU, power restrictor and ballast (weight and position), plus a loop that corrects its estimate from the PP read in the game.
- Levels (auto, weak, neutral, strong or a percentage) for downforce, top speed and rear steering.
- Final drive and individual gear ratios as a percentage of each gear's range.
- Info popup on every option, glossary, saved sheets with export/import.
- Optional data from the game's left panel (low/high-speed stability, rotational G at three speeds), weight split as front:rear, estimated centre of gravity.
- GT7-style layout selector (FF, FR, MR, RR, 4WD) and unit selectors (kg/lb, CV/kW/hp, Nm/kgfm/lb-ft).
- Measure button (marks the setup you have in the car), per-value difference from it, undo and previous-setup restore, values summary.
- English and Italian, installable offline PWA.
