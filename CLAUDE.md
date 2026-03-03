# HoldPoint — iOS PWA Yoga & Hangboard Timer

> **Read this entire file before making any changes.**
> This document is your briefing. It tells you what the app is, how it's built, what's fragile, and how to work on it safely.

---

## Quick Context

HoldPoint is an installable iOS PWA (Progressive Web App) for yin yoga and hangboard training. Users select a routine, run a guided timer with audio cues, and track their session history. It's hosted on GitHub Pages, uses Supabase for auth and data sync, and is designed to feel like a native app on iPhone.

**Current version:** v0.3.5
**Live URL:** https://jsheibs.github.io/holdpoint/
**Hosting:** GitHub Pages (deploy by pushing to `main`)
**Auth & Database:** Supabase (PostgreSQL + Row Level Security)
**Users:** Small group (invite-only via Supabase Edge Function)

---

## Architecture

This is a vanilla JS PWA — no frameworks, no build step, no bundler. You edit files and push. That's the deploy.

```
holdpoint/
├── index.html           (607 lines)  All HTML screens in one file, shown/hidden via JS
├── js/
│   ├── app.js           (3722 lines) ALL application logic — state, UI, timers, audio, auth
│   └── data.js          (212 lines)  Routine definitions (yoga poses, hangboard grips)
├── css/
│   └── styles.css       (1877 lines) All styling — dark theme, iOS-safe-area handling
├── sw.js                (86 lines)   Service worker — cache-first for assets, network-only for APIs
├── manifest.json                     PWA manifest — name, icons, orientation, theme color
├── supabase-schema.sql               Database schema (tables, RLS policies, triggers)
├── supabase/functions/
│   └── send-invite/index.ts          Edge Function for invite emails
├── assets/                           PWA icons (192px, 512px, SVG, apple-touch-icon)
├── .gitignore
├── AUDIO_WAKELOCK_FIXES.md           Documentation: iOS audio/wake lock battle scars
├── INVITE_FEATURE.md                 Documentation: invite system implementation
└── HoldPoint-Project-Documentation.docx  Full project documentation (update when adding features)
```

### The Big File: app.js

Almost everything lives in `app.js` inside a single IIFE (`const HP = (() => { ... })()`). This is intentional — it started as a single-file app and was split only for deployment. The major sections in order:

1. **Supabase client init** — connection setup
2. **Logging system** — `[HP]` prefixed, timestamped, 4 levels (DEBUG/INFO/WARN/ERROR)
3. **State management** — single `state` object holds everything (user, settings, history, timer state)
4. **Auth** — Supabase email/password, session persistence
5. **Settings** — user preferences (sounds, wake lock, webhook URL)
6. **Session history** — localStorage per user, with save verification
7. **Hangboard settings** — customizable sets/hang/rest with stepper UI
8. **Screen navigation** — show/hide HTML sections
9. **Routine detail & rendering** — builds the UI for a selected routine
10. **Timer engines** — separate implementations for yoga and hangboard
11. **Audio system** — Web Audio API with iOS workarounds (persistent AudioContext, gesture unlock)
12. **Wake lock** — keeps screen on during timer, recovers after iOS interruptions
13. **Lifecycle handlers** — `forceSaveAllState()` on visibility/pagehide/beforeunload
14. **PWA install prompt**

### Data Model (data.js)

Yoga routines: array of poses with `name`, `duration` (seconds), optional `side` (left/right).
Hangboard routines: object with `grips` array, plus timing parameters (`hangSeconds`, `repRestSeconds`, `setRestSeconds`, `setsPerGrip`, `repsPerSet`). Users can override these via hangboard settings (v0.3.5).

### Supabase

- **Auth:** Email/password signup (invite-only). Users table with RLS.
- **Tables:** `profiles`, `settings`, `session_history`, `invitations`
- **Edge Function:** `send-invite` — sends invite emails via Resend API
- **Important:** Site URL must be set to the GitHub Pages URL in Supabase dashboard, not localhost.

---

## iOS PWA Constraints (Non-Negotiable)

This app runs as an installed PWA on iOS Safari. iOS is hostile to web apps. Every decision must account for these realities:

1. **iOS kills PWA processes without warning.** When the user switches apps, locks their phone, or even waits too long, iOS terminates the WebKit process. There is no graceful shutdown. Any pending I/O (localStorage writes, network requests) may be lost.

2. **localStorage writes are not guaranteed.** Always verify writes with an immediate read-back. Save aggressively on every lifecycle event (`visibilitychange`, `pagehide`, `beforeunload`). Never assume a single `setItem` call will survive.

3. **AudioContext gets suspended/interrupted.** iOS suspends audio when the screen locks or another app takes focus. The "interrupted" state is undocumented but real. You must handle "suspended", "interrupted", AND "closed" states. Always resume AudioContext on user gesture. Never create new AudioContexts per sound — reuse one persistent instance.

4. **Wake Lock API can be revoked at any time.** iOS revokes wake lock on visibility change. You must re-acquire it when the app returns to foreground. The timer must use wall-clock time (Date.now()), not setInterval counts, because intervals stop when the screen locks.

5. **Service worker caching is aggressive.** If you change any file, you MUST bump the `CACHE_NAME` version in `sw.js` AND update any `?v=N` query strings in `index.html`. Otherwise users will get stale code indefinitely.

6. **No dev tools on device.** You cannot open a console on an installed iOS PWA. Your logging system (`[HP]` prefix) is your only debugging tool. Log everything meaningful. Use Safari's remote debugger via USB cable when you need it.

---

## Rules of Engagement

### Before You Change Anything

1. **Understand the full context.** Read this file. If your change touches the timer, audio, or storage, also read `AUDIO_WAKELOCK_FIXES.md`. If it touches invites, read `INVITE_FEATURE.md`.

2. **Identify what you're changing and what it touches.** app.js is one big file — a change to the timer section can break audio recovery. A change to state management can break history persistence. Think about side effects.

3. **Check the version.** The version string appears in three places: the comment at the top of `app.js`, the console.log in `app.js`, and the footer in `index.html`. All three must match after your change.

### How to Make Changes

1. **Plan first, code second.** Before writing any code, describe what you're going to change and why. Identify which sections of which files are affected. If it's a multi-step feature, break it into discrete steps and do them one at a time.

2. **One thing at a time.** Don't combine unrelated changes. Each commit should be one logical change that can be described in one sentence. If you're fixing a bug AND adding a feature, that's two separate commits.

3. **Test before deploying.** Open `index.html` locally in a browser and verify the change works before pushing. For iOS-specific behavior (audio, wake lock, lifecycle), test on an actual iPhone via Safari remote debugger.

4. **Bump the version.** Every user-facing change gets a version bump. Update all three version locations. Update `CACHE_NAME` in `sw.js` if any cached file changed.

5. **Update documentation.** If you add a feature or fix a significant bug, add a section to `HoldPoint-Project-Documentation.docx`. Keep the living knowledge current — future you (or the next developer) will thank you.

### What NOT to Do

- **Don't remove iOS audio workarounds.** They look redundant. They're not. The HTML5 Audio hack, the persistent gesture listeners, the AudioContext resume-on-touch — all of these exist because of specific iOS behaviors that will break the app if removed. Read `AUDIO_WAKELOCK_FIXES.md` before touching anything audio-related.

- **Don't rely on setInterval for timing.** iOS suspends intervals when the screen locks. The timer must checkpoint wall-clock time and recalculate elapsed time on resume.

- **Don't create new AudioContext instances.** Reuse the single persistent one. Creating new ones on iOS will hit the "maximum audio contexts" limit and silently fail.

- **Don't hardcode user-specific values.** Settings, preferences, and configuration should be stored per-user in localStorage or Supabase. The app should work for any user, not just Jesse.

- **Don't modify data.js routine definitions at runtime.** Use the override pattern (see hangboard settings in v0.3.5) — copy the routine, apply overrides to the copy, leave the original untouched.

---

## Development Best Practices

### Architecture-First Approach

Before building anything significant, follow this process:

1. **Write the plan before the code.** Start with a clear description of what you're building, why, and how it fits into the existing architecture. Identify every file that will be touched and every section within those files.

2. **Break large features into small, testable steps.** Each step should produce a working app. If step 3 of 5 breaks something, you can roll back to step 2 and still have a functioning app. Never make the app non-functional as an intermediate step.

3. **One agent, one task.** When using AI assistance (Claude Code, Cowork, etc.), give each conversation a single focused task. Don't ask one session to build the whole feature — ask it to build step 1, verify it works, then start a new session for step 2 with fresh context. This prevents context overload and keeps changes small.

4. **Test in isolation before integrating.** If you're adding a new capability (e.g., a new timer mode), get it working as a standalone piece first. Then wire it into the existing app. This way you know whether a bug is in your new code or in the integration.

### Code Quality

- **Log meaningful events.** Every state change, every user action, every error. Use the existing logging system: `info('CATEGORY', 'what happened')`. Future debugging depends on this.

- **Fail loudly.** Never silently catch and swallow errors. At minimum, log them. For critical paths (saving data, audio setup), notify the user too.

- **Keep functions focused.** If a function does more than one thing, consider splitting it. app.js is already large — don't make it harder to navigate.

- **Use descriptive variable names.** `hbSettings.setRest` is better than `s.r`. Someone reading this code in 6 months should understand it without comments.

- **Comment the "why", not the "what".** Don't comment `// increment counter` above `counter++`. Do comment `// iOS requires AudioContext resume on user gesture — without this, audio silently fails after screen lock`.

### Deployment Checklist

Before every push to `main` (which is an immediate deploy to GitHub Pages):

1. ☐ Version bumped in all three locations (app.js comment, app.js console.log, index.html footer)
2. ☐ `CACHE_NAME` in sw.js updated if any cached files changed
3. ☐ Tested locally in browser — app loads, navigation works, no console errors
4. ☐ If timer/audio changes: tested on actual iOS device
5. ☐ Git diff reviewed — no accidental changes, no leftover debug code
6. ☐ Single logical change per commit with a clear message

---

## Key Technical Patterns

### State Management
All app state lives in a single `state` object. This makes it easy to save/restore but means you need to be careful about mutations. Always update state, then save to localStorage, then verify the save.

### localStorage Keys
All keys are namespaced per user: `hp_history_{email}`, `hp_settings_{email}`, `hp_hb_settings_{email}`. This means multiple users on the same device get independent data.

### iOS Lifecycle Recovery
The `forceSaveAllState()` function is the safety net. It's called on three different lifecycle events to maximize the chance of data surviving an iOS process kill. Any new persistent state you add should be included in this function.

### Routine Overrides (Hangboard)
Base routine data in `data.js` is never mutated. User preferences are stored separately and applied at runtime via `applyHbOverrides()`, which returns a shallow copy with user values. This pattern should be used for any future customization features.

### Audio on iOS
The audio system uses a persistent AudioContext created once, resumed on every user gesture via a document-level touchstart/click listener. Sounds are generated via OscillatorNode (not audio files) to avoid loading/caching issues. The "interrupted" AudioContext state is handled explicitly because iOS uses it but it's not in the Web Audio spec.

---

## File Quick Reference

| File | Lines | What It Does |
|------|-------|--------------|
| `index.html` | 607 | All HTML screens. Show/hide via JS. Loads Supabase CDN, app.js, data.js. |
| `js/app.js` | 3722 | Everything: auth, state, UI, timers, audio, wake lock, lifecycle, settings. |
| `js/data.js` | 212 | Yoga routines (poses + durations) and hangboard routines (grips + timing). |
| `css/styles.css` | 1877 | Full stylesheet. Dark theme. iOS safe-area insets. Mobile-first. |
| `sw.js` | 86 | Service worker. Cache-first for assets, network-only for API calls. |
| `manifest.json` | 24 | PWA manifest. App name, icons, theme color, orientation. |
| `supabase-schema.sql` | 150 | Database tables, RLS policies, triggers, indexes. |
| `supabase/functions/send-invite/index.ts` | ~80 | Supabase Edge Function for invite emails via Resend. |

---

## Current State (Update This Every Session)

**Last worked on:** Feb 27, 2026
**Last change:** Added customizable hangboard settings (v0.3.5) — sets, hang time, rep rest, set rest with stepper UI. Updated project documentation docx.
**Pushed to GitHub:** v0.3.4 is live. v0.3.5 code is complete but NOT YET PUSHED.
**What's next:** Push v0.3.5. Consider adding per-routine setting memory (so different hangboard routines can have different defaults). Session history syncing to Supabase (currently localStorage only).

---

## Don't Waste Time On (Dead Ends & Known Limitations)

- **Notifications API on iOS PWAs** — doesn't work. iOS doesn't support web push notifications for installed PWAs. Don't try to use it for timer alerts.
- **Creating new AudioContext instances per sound** — iOS has a limit on concurrent audio contexts and will silently fail. Always reuse the single persistent AudioContext.
- **setInterval for accurate timing** — iOS suspends intervals when the screen locks or app backgrounds. Always use wall-clock time (Date.now()) and recalculate elapsed time on resume.
- **Removing any iOS audio workaround that "looks redundant"** — the HTML5 Audio hack, persistent gesture listeners, and AudioContext resume-on-touch are all load-bearing. Read AUDIO_WAKELOCK_FIXES.md before touching audio code.
- **Testing PWA behavior in desktop Safari** — it doesn't reproduce iOS PWA behavior. You must test on an actual iPhone for audio, wake lock, lifecycle, and localStorage issues.
- **Single localStorage.setItem() calls for critical data** — iOS can kill the process before the write flushes. Always use forceSaveAllState() pattern with lifecycle event hooks and read-back verification.

---

## Testing Checklist

Before pushing any change to main (which is an immediate deploy):

### Quick Test (every change)
1. Open `index.html` in a local browser
2. App loads without console errors
3. Can navigate between screens (home → routine detail → back)
4. Version number is correct in the footer

### Timer Test (if timer/audio changes)
1. Start a yoga routine — timer counts, audio cues play, screen stays on
2. Start a hangboard routine — sets/reps count correctly, rest timers work
3. Lock the phone during a timer — unlock and verify it recovered correctly
4. Switch to another app during timer — come back and verify recovery

### Data Test (if storage/history changes)
1. Complete a session — verify it appears in history
2. Close the app completely — reopen and verify history persisted
3. Complete two sessions back-to-back — verify BOTH appear in history
4. Check localStorage in Safari dev tools to confirm data is there

### Hangboard Settings Test (if settings UI changes)
1. Open a hangboard routine detail — settings panel visible
2. Adjust each setting — detail view updates (grip counts, rest rows, total duration)
3. Start the timer — uses the custom settings
4. Close and reopen app — settings are remembered
5. Open a yoga routine — settings panel is hidden

---

## Tech Debt & Known Issues

- **app.js is 3700+ lines in one file.** It works, but navigating it is painful. A future refactor could split it into modules (auth.js, timer.js, audio.js, history.js). Not urgent but would help maintainability.
- **Version string in three places.** The version appears in the app.js comment header, the console.log, and the index.html footer. These must be updated manually in sync. Easy to miss one.
- **Session history is localStorage only.** If a user clears their browser data or switches devices, they lose everything. Supabase sync is designed in the schema but not yet implemented in the app.
- **No automated tests.** Everything is tested manually. As the app grows, a simple test runner (even just a manual checklist script) would help.
- **Service worker cache versioning is manual.** You have to remember to bump CACHE_NAME in sw.js when files change. A build step could automate this, but we don't have a build step (and the simplicity of "edit and push" is valuable).
- **One-time recovery code (v0.3.4) is still in app.js.** The recovery migration for the missing 2/26 session runs once per user and is gated by a localStorage flag. It's harmless but could be removed after all active users have run it.

---

## Preferred Tools & Stack Decisions

These are deliberate choices — don't suggest alternatives unless asked:

- **Vanilla JS, no frameworks.** No React, no Vue, no build step. The simplicity of "edit file, push to GitHub, it's live" is a feature. Don't introduce a bundler or transpiler.
- **Supabase for backend.** Auth, database, edge functions, storage. Not Firebase, not AWS.
- **GitHub Pages for hosting.** Push to main = deploy. No CI/CD pipeline, no server.
- **Web Audio API for sounds.** OscillatorNode-generated tones, not audio files. Avoids loading/caching issues on iOS.
- **localStorage for client-side persistence.** With the forceSaveAllState() resilience pattern. Supabase sync is planned but localStorage is the primary store for now.
- **PWA, not native app.** No App Store, no Xcode, no Swift. The trade-off is iOS limitations (see constraints section above), but the simplicity of web deployment is worth it.

---

## Jesse's Working Style

- **Self-sufficient.** Jesse wants to understand how things work so he can maintain and extend them himself, not depend on someone else. Explain decisions, don't just make them.
- **Product thinker.** Everything gets built with the mindset that it could become a product. Modular code, clean interfaces, config over hardcoding.
- **Building MCP servers.** Jesse is building toward having Claude interact with his tools conversationally via MCP (Model Context Protocol) — custom integrations that let AI agents call into his automation scripts, APIs, and services directly. Keep code modular enough that functions can be exposed as MCP tool endpoints later.
- **One thing at a time.** Don't rush ahead. Plan the work, do one step, verify, then move to the next.
- **Learning git.** Be patient and clear with git operations. Explain what commands do.

---

## Version History

| Version | Date | What Changed |
|---------|------|--------------|
| v0.3.0 | Feb 9, 2025 | Multi-file split, PWA installation, Supabase auth |
| v0.3.1 | Feb 9, 2025 | Audio fixes, wake lock recovery, iOS interruption handling |
| v0.3.2 | Feb 11, 2025 | Invite system via Supabase Edge Function |
| v0.3.3 | Feb 11, 2025 | Fix invite email delivery chain |
| v0.3.4 | Feb 26, 2026 | iOS localStorage persistence fix (forceSaveAllState + lifecycle handlers + save verification) |
| v0.3.5 | Feb 27, 2026 | Customizable hangboard settings (sets, hang time, rest times) with stepper UI |
