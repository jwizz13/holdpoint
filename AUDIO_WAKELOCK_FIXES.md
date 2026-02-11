# HoldPoint — Audio Recovery & Wake Lock Fixes

## Overview

Versions 0.3.1 and 0.3.2 addressed two critical issues that made HoldPoint unusable when the screen locked or the app went to the background on iOS:

1. **Timer bell going silent** after the screen locked and never recovering, even after unlocking
2. **Screen locking during sessions** despite the "Keep Screen On" toggle being enabled

Both problems stemmed from iOS aggressively suspending web resources (AudioContext, Wake Lock) when the app loses focus, and the original code not recovering from those states.

---

## v0.3.1 — Audio Recovery After Screen Lock

### The Problem

When an iPhone's screen auto-locked during a HoldPoint session (e.g., 2-minute screen timer), the Web Audio API's `AudioContext` was suspended by iOS. After unlocking:

- The `AudioContext` stayed in a suspended or `'interrupted'` state
- The bell never played again for the rest of the session
- No error was visible to the user — it just silently failed

### Root Cause

iOS uses a non-standard `'interrupted'` state for `AudioContext` (in addition to the standard `'suspended'` and `'running'`). The original code only checked for `'suspended'`, so when iOS put the context into `'interrupted'` (triggered by screen lock, phone calls, Siri, notification banners), the recovery code never ran.

Additionally, the `unlockAudio()` function only played the HTML5 silent audio hack once (using `{ once: true }` on the event listener), but iOS can re-suspend audio after any background event, so the hack needs to replay every time.

### What Changed

**`getAudioContext()`** — Now handles three non-running states:

| State | Cause | Recovery |
|-------|-------|----------|
| `'suspended'` | Standard browser suspension | Call `.resume()` |
| `'interrupted'` | iOS-specific: screen lock, phone call, Siri, notification | Call `.resume()` |
| `'closed'` | Context permanently destroyed (rare) | Recreate the `AudioContext` entirely |

**`unlockAudio()`** — Two changes:

1. If `resume()` fails, force-recreates the `AudioContext` as a nuclear fallback
2. The HTML5 silent audio hack now replays on every gesture (not just once), because iOS can re-suspend the audio session after background events

**`playBell()`** — Added pre-play recovery:

1. Before playing any bell, checks if `AudioContext` is in `'running'` state
2. If not running, tries `resume()`
3. If still not running after resume, force-recreates the `AudioContext`
4. Then plays the bell through the new (or recovered) context

**`recoverFromBackground()`** — New centralized recovery function:

This replaced the old individual `visibilitychange` and `focus` handlers. When the app returns from background, it:

1. Ensures the timer tick loop is alive (`ensureTimerRunning()`)
2. Re-requests the wake lock if the timer is running
3. Attempts to resume the `AudioContext`

Called from three event handlers:
- `visibilitychange` — fires when switching apps or unlocking screen
- `focus` — catches notification banners and alerts (especially on iOS PWA where `visibilitychange` doesn't always fire)
- `pageshow` — fires when page is restored from the browser's back-forward cache

---

## v0.3.2 — Always-On Wake Lock

### The Problem

Even with "Keep Screen On" toggled on in Settings, the screen was still locking during timer sessions. iOS releases the Wake Lock API when:

- The app goes to the background (even briefly, e.g., pulling down notification center)
- A notification banner appears
- The OS decides to reclaim resources

The original code requested the wake lock once at timer start but never re-requested it after iOS released it.

### Design Decision

The "Keep Screen On" toggle was removed from Settings entirely. The wake lock is now always active during timer sessions because HoldPoint doesn't work without it — the timer and audio both break when the screen locks. Making it a toggle just led to confusion and frustration when users had it on but the screen locked anyway.

### What Changed

**`requestWakeLock()`** — Three changes:

1. Removed the `state.wakeLockEnabled === false` early return — wake lock is always requested during timer sessions
2. Added a `release` event listener that auto-re-requests the wake lock if the timer is still running:
   ```
   OS releases wake lock → release event fires → is timer running? → yes → requestWakeLock() again
   ```
3. Releases any existing lock before requesting a fresh one (prevents stale references)

**`recoverFromBackground()`** — Added wake lock re-request:

When the app returns from background, if the timer is running but the wake lock is null (released by OS), it immediately re-requests.

**Settings UI (index.html)** — Changed the "Keep Screen On" row:

- Before: Toggle switch that saved to `wakeLockEnabled` in localStorage
- After: Static "Always On" text label — informational only, no toggle

**Service Worker (sw.js):**
- Bumped `CACHE_NAME` to `holdpoint-v9`
- Updated asset URLs to `?v=8`
- `self.skipWaiting()` was already added in a prior fix to ensure updates deploy immediately

---

## Files Changed

| File | v0.3.1 Changes | v0.3.2 Changes |
|------|----------------|----------------|
| `js/app.js` | Added `'interrupted'` + `'closed'` handling in `getAudioContext()`. Updated `unlockAudio()` with force-recreate fallback and repeating HTML5 hack. Added pre-play recovery in `playBell()`. Added `recoverFromBackground()` with visibility/focus/pageshow handlers. | Removed `wakeLockEnabled` check from `requestWakeLock()`. Added `release` event listener with auto-re-request. Added wake lock re-request to `recoverFromBackground()`. Removed old standalone wake lock visibility handler. |
| `index.html` | Version bumped to v0.3.1 | Changed "Keep Screen On" toggle to "Always On" label. Version bumped to v0.3.2. |
| `sw.js` | — | CACHE_NAME → `holdpoint-v9`, assets → `?v=8` |

---

## Recovery Architecture

Here's the full chain of how HoldPoint recovers from any background event:

```
Screen locks / notification / app switch
    ↓
iOS suspends AudioContext + releases Wake Lock
    ↓
User unlocks / returns to app
    ↓
visibilitychange / focus / pageshow fires
    ↓
recoverFromBackground() runs:
  ├── ensureTimerRunning() — restart rAF loop if it died
  ├── requestWakeLock()   — re-acquire if timer is running
  └── audioCtx.resume()   — try to wake up audio
    ↓
User taps anywhere on screen
    ↓
unlockAudio() runs (gesture-triggered):
  ├── getAudioContext()   — handles interrupted/closed states
  ├── resume() or force-recreate AudioContext
  ├── Silent buffer play  — unlocks Web Audio on iOS
  └── HTML5 Audio hack    — upgrades audio session past mute switch
    ↓
Next pose change fires
    ↓
playBell() runs:
  ├── Pre-play check: is AudioContext running?
  ├── If not → resume() → still not? → force-recreate
  └── Play the bell tone
```

**Watchdog timer** (every 2 seconds): If the `requestAnimationFrame` loop dies for any reason while the timer should be running, the watchdog detects it and restarts the loop.

**Background timer** (500ms `setInterval`): Runs alongside the rAF loop as a backup. If a pose/phase has expired while the app is backgrounded (where rAF doesn't run), the background timer catches it and triggers the tick.

---

## Testing

These scenarios were tested and confirmed working on iOS:

| Scenario | Result |
|----------|--------|
| Screen auto-locks during timer, then unlock | Bell plays on next pose change |
| Notification banner appears during timer | Bell plays after banner dismissed |
| Text message received (banner, no sound from text) | App bell still dings on next pose change |
| Screen set to 30-second auto-lock | Screen stays on throughout session |
| Pull down notification center, then return | Timer continues, bell works |

---

## Lessons Learned

1. **iOS `'interrupted'` state is undocumented** — It's not in the Web Audio API spec. You have to know to check for it. Always handle all possible AudioContext states, not just the documented ones.

2. **Wake Lock must be re-requested aggressively** — iOS will release it for any reason. The only reliable approach is a `release` event listener that immediately re-requests.

3. **`{ once: true }` is dangerous for audio unlock** — iOS can re-suspend audio at any time. The unlock handler must run on every gesture, forever.

4. **One recovery function beats many** — Consolidating timer, audio, and wake lock recovery into `recoverFromBackground()` is cleaner and more reliable than scattered individual handlers.

5. **Don't make essential features optional** — If the app breaks without wake lock, don't let users turn it off. It just creates confusing failure modes.
