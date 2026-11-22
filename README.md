# Effect Tracker — v0.1.2

https://herbybow.github.io/Effect-Tracker/manifest.json


IF ""https://herbybow.github.io/Effect-Tracker/manifest.json"" doesn't open in Browser, tcheck name match filename

IF ""https://herbybow.github.io/Effect-Tracker/index.html"" doesn't open in Browser, code is busted
 
## Changes in v0.1.2
- Fixed SDK readiness handling: `OBR.onReady()` returns an unsubscribe function, not a Promise. Removed the invalid `.catch?.()` chain.
- Added explicit script/startup/API error reporting.
- Added selection polling every 500 ms while the popover is open. The public Player API documents `getSelection()` but no dedicated selection-change event; `player.onChange` is not a selection subscription.
- Added a **Current** panel showing every Effect Tracker effect stored on each selected character token; empty when no effect is present.
- Renamed **Active Bleed** to **Active Effect**.
- Simplified Bleed to five vertically stacked buttons: `3×1` through `3×5`. Clicking a button applies Bleed directly to selected character tokens.
- Removed the damage/tick, initial charges and total damage display, and removed the separate Apply button.
- Kept the test-only charge consumption button; it does not change HP.

## Install/update
Upload the contents of this folder to the same hosting location as the previous version, preserving the paths in `manifest.json`. The manifest version is 0.1.2. In Owlbear, reload the extension/popover after the host has published the new files. If Owlbear caches the old build, remove and re-add the extension using the same manifest URL.

## Current limitations
- Does not yet integrate with Initiative Tracker turn changes.
- Does not yet modify Trackers HP.
- Test button only consumes one Bleed charge.
- Applying Bleed again refreshes the existing Bleed to three charges; separate stacking instances are not implemented.
- Effect data uses scene-item metadata namespace `com.effect-tracker/data`.
