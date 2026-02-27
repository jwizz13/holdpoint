/**
 * HoldPoint — Main Application
 * Version: 0.3.3 (Fix invite email delivery)
 *
 * Logging is built into every layer. To view logs:
 *   - Open browser console (F12 or Cmd+Option+I)
 *   - Filter by [HP] to see all HoldPoint logs
 *   - Timestamps on every entry for tracing issues
 */

const HP = (() => {
  'use strict';

  // ============================================
  // SUPABASE CLIENT
  // ============================================
  const SUPABASE_URL = 'https://yvrbjpdtlirnrhrdizyy.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cmJqcGR0bGlybnJocmRpenl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1OTUzMzUsImV4cCI6MjA4NjE3MTMzNX0.IKrj5DrUHUuoDM0U5FiSDFbV1jP0aww7cIHZ1k-o6Ss';

  let supabase = null;
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.error('[HP] Failed to initialize Supabase client:', e);
  }

  console.log('%c[HP] HoldPoint v0.3.3 loaded', 'color: green; font-weight: bold;');

  // ============================================
  // LOGGING SYSTEM
  // ============================================
  const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
  let currentLogLevel = LOG_LEVELS.DEBUG; // Show everything during development
  const logHistory = []; // Keep last 500 entries for export

  function log(level, category, message, data = null) {
    const now = new Date();
    const ts = now.toISOString().substring(11, 23); // HH:MM:SS.mmm
    const entry = { ts: now.toISOString(), level, category, message, data };

    logHistory.push(entry);
    if (logHistory.length > 500) logHistory.shift();

    if (LOG_LEVELS[level] < currentLogLevel) return;

    const prefix = `[HP ${ts}] [${level}] [${category}]`;
    const style = {
      DEBUG: 'color: #94a3b8',
      INFO: 'color: #2F5630; font-weight: bold',
      WARN: 'color: #d97706; font-weight: bold',
      ERROR: 'color: #dc2626; font-weight: bold'
    }[level];

    if (data) {
      console.log(`%c${prefix} ${message}`, style, data);
    } else {
      console.log(`%c${prefix} ${message}`, style);
    }
  }

  // Convenience methods
  const debug = (cat, msg, data) => log('DEBUG', cat, msg, data);
  const info = (cat, msg, data) => log('INFO', cat, msg, data);
  const warn = (cat, msg, data) => log('WARN', cat, msg, data);
  const error = (cat, msg, data) => log('ERROR', cat, msg, data);

  // Export logs for troubleshooting
  function exportLogs() {
    const blob = new Blob([JSON.stringify(logHistory, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `holdpoint-logs-${new Date().toISOString().substring(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    info('LOG', 'Logs exported to file');
  }

  // ============================================
  // APP STATE
  // ============================================
  const state = {
    currentScreen: null,
    previousScreen: null,
    user: null, // Will hold user object after login
    workoutType: 'yoga', // 'yoga' or 'hangboard'
    corePoseMinutes: 5, // 1-10, default 5
    selectedRoutine: null, // Current routine name
    timerState: null, // Timer runtime state
    sessionHistory: [], // Loaded from Supabase later, localStorage for now
    bellEnabled: true,
    wakeLockEnabled: true,
    sheetsEnabled: true,
    sheetsUrl: '',
    sheetId: '1PLM_8mN82UuHeP2aIEqAps0FlGRC1k-EiSPArSCMoMo',
    sheetTab: 'Daily View',
    customRoutines: [],
    posePhotos: {},
    photoFilter: 'all',
    editingPoseName: null
  };

  // ============================================
  // SCREEN NAVIGATION
  // ============================================
  function showScreen(screenId) {
    const prev = state.currentScreen;
    debug('NAV', `Navigating: ${prev} → ${screenId}`);

    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

    // Show target screen
    const target = document.getElementById(screenId);
    if (!target) {
      error('NAV', `Screen not found: ${screenId}`);
      return;
    }
    target.classList.add('active');

    // Toggle bottom nav visibility
    const nav = document.getElementById('bottom-nav');
    const hideNavScreens = ['screen-login', 'screen-signup', 'screen-timer', 'screen-settings', 'screen-my-routines', 'screen-community', 'screen-photos', 'screen-builder'];
    if (hideNavScreens.includes(screenId)) {
      nav.classList.add('hidden');
      debug('NAV', 'Bottom nav hidden');
    } else {
      nav.classList.remove('hidden');
      debug('NAV', 'Bottom nav visible');
    }

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.screen === screenId);
    });

    state.previousScreen = prev;
    state.currentScreen = screenId;
    info('NAV', `Screen active: ${screenId}`);

    // Scroll to top on screen change
    window.scrollTo(0, 0);
  }

  // ============================================
  // AUTH (Supabase)
  // ============================================
  async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    info('AUTH', `Login attempt for: ${email}`);
    clearFormErrors();

    if (!email) {
      showFormError('login-error', 'Please enter your email');
      return;
    }
    if (!password) {
      showFormError('login-error', 'Please enter your password');
      return;
    }

    if (!supabase) {
      showFormError('login-error', 'Connection error. Please refresh.');
      error('AUTH', 'Supabase client not initialized');
      return;
    }

    // Show loading state
    const btn = e.target.querySelector('button[type="submit"]');
    const origText = btn?.textContent;
    if (btn) { btn.textContent = 'Signing in...'; btn.disabled = true; }

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        showFormError('login-error', authError.message);
        warn('AUTH', `Login failed: ${authError.message}`);
        return;
      }

      const user = data.user;
      state.user = {
        id: user.id,
        email: user.email,
        displayName: user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0],
        initials: (user.user_metadata?.full_name || user.email).substring(0, 2).toUpperCase()
      };

      info('AUTH', `Login successful: ${email}`, { id: user.id });
      saveUserToStorage(state.user);
      await onLoginSuccess();
    } catch (err) {
      showFormError('login-error', 'Something went wrong. Please try again.');
      error('AUTH', 'Login exception', err);
    } finally {
      if (btn) { btn.textContent = origText; btn.disabled = false; }
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    info('AUTH', `Signup attempt: ${email}, name: ${name}`);
    clearFormErrors();

    if (!name) { showFormError('signup-error', 'Please enter your name'); return; }
    if (!email) { showFormError('signup-error', 'Please enter your email'); return; }
    if (!password || password.length < 6) { showFormError('signup-error', 'Password must be at least 6 characters'); return; }

    if (!supabase) {
      showFormError('signup-error', 'Connection error. Please refresh.');
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const origText = btn?.textContent;
    if (btn) { btn.textContent = 'Creating account...'; btn.disabled = true; }

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: 'https://jwizz13.github.io/holdpoint/'
        }
      });

      if (authError) {
        showFormError('signup-error', authError.message);
        warn('AUTH', `Signup failed: ${authError.message}`);
        return;
      }

      // Check if email confirmation is required
      if (data.user && !data.session) {
        showFormError('signup-error', 'Check your email to confirm your account, then log in.');
        info('AUTH', 'Signup successful, email confirmation required');
        return;
      }

      const user = data.user;
      const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
      state.user = {
        id: user.id,
        email: user.email,
        displayName: name,
        initials: initials
      };

      info('AUTH', `Signup successful: ${email}`, { id: user.id });
      saveUserToStorage(state.user);
      await onLoginSuccess();
    } catch (err) {
      showFormError('signup-error', 'Something went wrong. Please try again.');
      error('AUTH', 'Signup exception', err);
    } finally {
      if (btn) { btn.textContent = origText; btn.disabled = false; }
    }
  }

  async function handleLogout() {
    info('AUTH', `Logging out user: ${state.user?.email}`);
    if (supabase) {
      await supabase.auth.signOut();
    }
    state.user = null;
    localStorage.removeItem('hp_user');
    showScreen('screen-login');
  }

  async function onLoginSuccess() {
    debug('AUTH', 'Running post-login setup');
    updateUserUI();

    // Load from Supabase first, fall back to localStorage
    await loadSettingsFromDB();
    await loadSessionHistoryFromDB();
    await loadCustomRoutinesFromDB();
    loadPosePhotos(); // Photos stay in localStorage for now (too large for DB)

    renderRoutines();
    showScreen('screen-home');
    info('APP', 'App ready, showing home screen');
  }

  function saveUserToStorage(user) {
    try {
      localStorage.setItem('hp_user', JSON.stringify(user));
      debug('STORAGE', 'User saved to localStorage');
    } catch (e) {
      error('STORAGE', 'Failed to save user', e);
    }
  }

  async function loadUserFromStorage() {
    // First try Supabase session
    if (supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const user = session.user;
          state.user = {
            id: user.id,
            email: user.email,
            displayName: user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0],
            initials: (user.user_metadata?.full_name || user.email).substring(0, 2).toUpperCase()
          };
          info('AUTH', `Restored Supabase session: ${state.user.email}`);
          return true;
        }
      } catch (e) {
        warn('AUTH', 'Supabase session check failed, trying localStorage', e.message);
      }
    }

    // Fall back to localStorage
    try {
      const saved = localStorage.getItem('hp_user');
      if (saved) {
        state.user = JSON.parse(saved);
        info('STORAGE', `Restored user session: ${state.user.email}`);
        return true;
      }
    } catch (e) {
      error('STORAGE', 'Failed to load user', e);
    }
    return false;
  }

  // ============================================
  // FORM HELPERS
  // ============================================
  function showFormError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
      el.textContent = message;
      el.classList.add('visible');
      debug('UI', `Form error shown: ${message}`);
    }
  }

  function clearFormErrors() {
    document.querySelectorAll('.form-error').forEach(el => {
      el.classList.remove('visible');
      el.textContent = '';
    });
  }

  // ============================================
  // UI UPDATES
  // ============================================
  function updateUserUI() {
    if (!state.user) return;
    debug('UI', 'Updating user UI elements');

    // Avatar initials
    document.querySelectorAll('[data-user-initials]').forEach(el => {
      el.textContent = state.user.initials;
    });

    // Profile name/email
    const nameEl = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    if (nameEl) nameEl.textContent = state.user.displayName;
    if (emailEl) emailEl.textContent = state.user.email;
  }

  // ============================================
  // WORKOUT TYPE TABS
  // ============================================
  function setWorkoutType(type) {
    debug('UI', `Switching workout type: ${state.workoutType} → ${type}`);
    state.workoutType = type;

    document.querySelectorAll('.tab-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.type === type);
    });

    // Show/hide core time control (only for yoga)
    const timeControl = document.getElementById('core-time-control');
    if (timeControl) {
      timeControl.style.display = type === 'yoga' ? 'block' : 'none';
      debug('UI', `Core time control ${type === 'yoga' ? 'shown' : 'hidden'}`);
    }

    renderRoutines();
    info('UI', `Workout type set to: ${type}`);
  }

  // ============================================
  // CORE POSE TIME
  // ============================================
  function adjustCoreTime(delta) {
    const prev = state.corePoseMinutes;
    state.corePoseMinutes = Math.max(1, Math.min(10, state.corePoseMinutes + delta));
    debug('TIMER', `Core time adjusted: ${prev} → ${state.corePoseMinutes} (delta: ${delta})`);

    document.getElementById('core-time-value').textContent = `${state.corePoseMinutes}:00`;
    renderRoutines(); // Recalculate all session times
  }

  // ============================================
  // ROUTINE RENDERING
  // ============================================
  function renderRoutines() {
    const container = document.getElementById('routine-list');
    if (!container) return;

    debug('RENDER', `Rendering routines for type: ${state.workoutType}, core: ${state.corePoseMinutes}min`);
    container.innerHTML = '';

    const routines = state.workoutType === 'yoga'
      ? HP_DATA.yogaRoutines
      : HP_DATA.hangboardRoutines;

    let count = 0;
    for (const [name, routine] of Object.entries(routines)) {
      const duration = routine.type === 'yoga'
        ? HP_DATA.calcYogaDuration(routine, state.corePoseMinutes)
        : HP_DATA.calcHangboardDuration(routine);

      const poseCount = routine.type === 'yoga'
        ? routine.poses.length
        : `${routine.grips.length} grips`;

      const focus = routine.focus || routine.description || '';

      const card = document.createElement('div');
      card.className = 'routine-card';
      card.dataset.routine = name;
      card.innerHTML = `
        <div class="routine-header">
          <div class="routine-name">${name}</div>
          <div class="routine-time">${duration} min</div>
        </div>
        <div class="routine-info">${poseCount}${routine.type === 'yoga' ? ' poses' : ''}</div>
        <div class="routine-tag">${focus}</div>
      `;
      card.addEventListener('click', () => openRoutineDetail(name));
      container.appendChild(card);
      count++;
    }

    // Add custom yoga routines to the yoga tab
    if (state.workoutType === 'yoga' && state.customRoutines && state.customRoutines.length > 0) {
      state.customRoutines.forEach((routine, idx) => {
        const totalMin = Math.round(routine.poses.reduce((s, p) => s + p.duration, 0));
        const card = document.createElement('div');
        card.className = 'routine-card';
        card.dataset.routine = routine.name;
        card.innerHTML = `
          <div class="routine-header">
            <div class="routine-name">${routine.name}</div>
            <div class="routine-time">${totalMin} min</div>
          </div>
          <div class="routine-info">${routine.poses.length} poses · Custom</div>
          <div class="routine-tag">${routine.focus || ''}</div>
        `;
        card.addEventListener('click', () => openRoutineDetail(routine.name));
        container.appendChild(card);
        count++;
      });
    }

    info('RENDER', `Rendered ${count} routine cards`);
  }

  // ============================================
  // ROUTINE DETAIL
  // ============================================
  function openRoutineDetail(routineName) {
    info('NAV', `Opening routine detail: ${routineName}`);
    state.selectedRoutine = routineName;

    // Check custom routines first, then built-ins
    const customRoutine = (state.customRoutines || []).find(r => r.name === routineName);
    const routines = { ...HP_DATA.yogaRoutines, ...HP_DATA.hangboardRoutines };
    const routine = customRoutine || routines[routineName];
    if (!routine) {
      error('DETAIL', `Routine not found: ${routineName}`);
      return;
    }

    const isYoga = routine.type === 'yoga';
    debug('DETAIL', `Routine type: ${routine.type}, yoga: ${isYoga}`);

    // Update header
    document.getElementById('detail-title').textContent = routineName;

    if (isYoga) {
      const isCustom = customRoutine || routine._isCustom;
      let duration;
      if (isCustom) {
        duration = Math.round(routine.poses.reduce((s, p) => s + p.duration, 0));
      } else {
        duration = HP_DATA.calcYogaDuration(routine, state.corePoseMinutes);
      }
      document.getElementById('detail-meta').textContent = isCustom
        ? `${routine.poses.length} poses · ${duration} min · Custom`
        : `${routine.poses.length} poses · ${duration} min · Core: ${state.corePoseMinutes}:00`;
      document.getElementById('detail-focus').textContent = routine.focus || '';

      // Render pose list
      const list = document.getElementById('pose-list');
      list.innerHTML = '';
      routine.poses.forEach((pose, i) => {
        const dur = isCustom ? pose.duration : HP_DATA.getPoseDuration(pose, state.corePoseMinutes);
        const totalSec = Math.round(dur * 60);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        const durDisplay = `${mins}:${secs.toString().padStart(2, '0')}`;

        const item = document.createElement('div');
        item.className = 'pose-item';
        item.innerHTML = `
          <div class="pose-item-row">
            <div class="pose-number">${i + 1}</div>
            <div class="pose-item-info">
              <div class="pose-item-name">${pose.name}</div>
              <div class="pose-item-desc">${pose.description}</div>
            </div>
          </div>
          <div class="pose-item-time">${durDisplay}</div>
        `;
        list.appendChild(item);
      });
      debug('DETAIL', `Rendered ${routine.poses.length} poses`);
    } else {
      // Hangboard detail
      const duration = HP_DATA.calcHangboardDuration(routine);
      document.getElementById('detail-meta').textContent =
        `${routine.grips.length} grips · ${duration} min · ${routine.setsPerGrip} sets × ${routine.repsPerSet} reps`;
      document.getElementById('detail-focus').textContent = routine.description;

      const list = document.getElementById('pose-list');
      list.innerHTML = '';

      const fmtSec = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
      let itemNum = 0;

      // Warmup row
      itemNum++;
      const warmupItem = document.createElement('div');
      warmupItem.className = 'pose-item';
      warmupItem.innerHTML = `
        <div class="pose-item-row">
          <div class="pose-number">${itemNum}</div>
          <div class="pose-item-info">
            <div class="pose-item-name">Warmup</div>
            <div class="pose-item-desc">Get warmed up before hanging</div>
          </div>
        </div>
        <div class="pose-item-time">${fmtSec(routine.warmupSeconds)}</div>
      `;
      list.appendChild(warmupItem);

      // Grip sets with rest rows between them
      const singleArmGrips = routine.singleArmGrips || [];
      const switchSec = routine.switchSeconds || 5;
      const totalGripSets = routine.grips.length * routine.setsPerGrip;
      let absoluteSet = 0;

      // One arm's rep time (no get-ready): reps × hang + (reps-1) × repRest
      const oneArmRepSeconds = (routine.repsPerSet * routine.hangSeconds)
        + ((routine.repsPerSet - 1) * routine.repRestSeconds);

      routine.grips.forEach((grip, i) => {
        const isSingleArm = singleArmGrips.includes(grip);

        for (let set = 1; set <= routine.setsPerGrip; set++) {
          absoluteSet++;

          if (isSingleArm) {
            // --- Right hand set ---
            itemNum++;
            const rightSetSeconds = routine.getReadySeconds + oneArmRepSeconds;
            const rightItem = document.createElement('div');
            rightItem.className = 'pose-item';
            rightItem.innerHTML = `
              <div class="pose-item-row">
                <div class="pose-number">${itemNum}</div>
                <div class="pose-item-info">
                  <div class="pose-item-name">${grip} (Right) — Set ${set}</div>
                  <div class="pose-item-desc">${routine.repsPerSet} reps × ${routine.hangSeconds}s hang / ${routine.repRestSeconds}s rest</div>
                </div>
              </div>
              <div class="pose-item-time">${fmtSec(rightSetSeconds)}</div>
            `;
            list.appendChild(rightItem);

            // --- Switch row ---
            itemNum++;
            const switchItem = document.createElement('div');
            switchItem.className = 'pose-item';
            switchItem.innerHTML = `
              <div class="pose-item-row">
                <div class="pose-number">${itemNum}</div>
                <div class="pose-item-info">
                  <div class="pose-item-name">Switch Hands</div>
                  <div class="pose-item-desc">Switch to left hand</div>
                </div>
              </div>
              <div class="pose-item-time">${fmtSec(switchSec)}</div>
            `;
            list.appendChild(switchItem);

            // --- Left hand set ---
            itemNum++;
            const leftItem = document.createElement('div');
            leftItem.className = 'pose-item';
            leftItem.innerHTML = `
              <div class="pose-item-row">
                <div class="pose-number">${itemNum}</div>
                <div class="pose-item-info">
                  <div class="pose-item-name">${grip} (Left) — Set ${set}</div>
                  <div class="pose-item-desc">${routine.repsPerSet} reps × ${routine.hangSeconds}s hang / ${routine.repRestSeconds}s rest</div>
                </div>
              </div>
              <div class="pose-item-time">${fmtSec(oneArmRepSeconds)}</div>
            `;
            list.appendChild(leftItem);

            // --- Adjusted set rest ---
            if (absoluteSet < totalGripSets) {
              const adjustedRestSec = routine.setRestSeconds - switchSec - oneArmRepSeconds;
              if (adjustedRestSec > 0) {
                itemNum++;
                const restItem = document.createElement('div');
                restItem.className = 'pose-item';
                restItem.innerHTML = `
                  <div class="pose-item-row">
                    <div class="pose-number">${itemNum}</div>
                    <div class="pose-item-info">
                      <div class="pose-item-name">Set Rest</div>
                      <div class="pose-item-desc">Recovery (3:00 minus left set)</div>
                    </div>
                  </div>
                  <div class="pose-item-time">${fmtSec(adjustedRestSec)}</div>
                `;
                list.appendChild(restItem);
              }
            }
          } else {
            // --- Normal two-hand grip ---
            itemNum++;
            const setSeconds = routine.getReadySeconds
              + (routine.repsPerSet * routine.hangSeconds)
              + ((routine.repsPerSet - 1) * routine.repRestSeconds);

            const item = document.createElement('div');
            item.className = 'pose-item';
            item.innerHTML = `
              <div class="pose-item-row">
                <div class="pose-number">${itemNum}</div>
                <div class="pose-item-info">
                  <div class="pose-item-name">${grip} — Set ${set}</div>
                  <div class="pose-item-desc">${routine.repsPerSet} reps × ${routine.hangSeconds}s hang / ${routine.repRestSeconds}s rest</div>
                </div>
              </div>
              <div class="pose-item-time">${fmtSec(setSeconds)}</div>
            `;
            list.appendChild(item);

            // Set rest row (between sets, not after the last one)
            if (absoluteSet < totalGripSets) {
              itemNum++;
              const restItem = document.createElement('div');
              restItem.className = 'pose-item';
              restItem.innerHTML = `
                <div class="pose-item-row">
                  <div class="pose-number">${itemNum}</div>
                  <div class="pose-item-info">
                    <div class="pose-item-name">Set Rest</div>
                    <div class="pose-item-desc">Recovery between sets</div>
                  </div>
                </div>
                <div class="pose-item-time">${fmtSec(routine.setRestSeconds)}</div>
              `;
              list.appendChild(restItem);
            }
          }
        }
      });
      debug('DETAIL', `Rendered hangboard detail for ${routine.grips.length} grips, ${itemNum} items`);
    }

    showScreen('screen-detail');
  }

  // ============================================
  // TIMER ENGINE (Yoga Timer)
  // ============================================

  /**
   * Format milliseconds to "m:ss" string
   */
  function formatTime(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // ============================================
  // WAKE LOCK — keep screen on during workouts
  // ============================================
  let wakeLock = null;

  async function requestWakeLock() {
    // Always request wake lock during timer — the app doesn't work without it
    try {
      if ('wakeLock' in navigator) {
        // Release existing lock first to get a fresh one
        if (wakeLock) {
          try { wakeLock.release(); } catch (e) {}
          wakeLock = null;
        }
        wakeLock = await navigator.wakeLock.request('screen');
        info('TIMER', 'Wake lock acquired — screen will stay on');
        wakeLock.addEventListener('release', () => {
          debug('TIMER', 'Wake lock was released by OS');
          wakeLock = null;
          // If timer is still running, try to re-acquire immediately
          if (state.timerState?.isRunning) {
            info('TIMER', 'Timer still active — re-requesting wake lock');
            requestWakeLock();
          }
        });
      } else {
        warn('TIMER', 'Wake Lock API not supported on this device');
      }
    } catch (e) {
      warn('TIMER', 'Wake lock request failed', e.message);
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release();
      wakeLock = null;
      info('TIMER', 'Wake lock released');
    }
  }

  // ============================================
  // BACKGROUND TIMER — setInterval backup so bells
  // play even when page is backgrounded
  // ============================================
  let bgIntervalId = null;

  function startBackgroundTimer() {
    stopBackgroundTimer();
    bgIntervalId = setInterval(backgroundTick, 500);
    debug('TIMER', 'Background timer started (500ms interval)');
  }

  function stopBackgroundTimer() {
    if (bgIntervalId !== null) {
      clearInterval(bgIntervalId);
      bgIntervalId = null;
      debug('TIMER', 'Background timer stopped');
    }
  }

  function backgroundTick() {
    if (!state.timerState || !state.timerState.isRunning) return;

    const ts = state.timerState;
    const now = Date.now();
    const elapsed = ts.elapsed + (now - ts.poseStartTime);
    const remaining = ts.poseDurationMs - elapsed;

    // Only act if pose/phase has expired — the rAF loop handles normal UI updates
    if (remaining <= 0) {
      debug('TIMER', 'Background tick detected phase expiry');
      // Trigger the catch-up logic in timerTick
      if (ts.animFrameId) cancelAnimationFrame(ts.animFrameId);
      ts.animFrameId = requestAnimationFrame(timerTick);
    }
  }

  /**
   * Persistent AudioContext — created once, unlocked on user gesture.
   * iOS/mobile suspends new AudioContexts created without a touch event,
   * so we reuse one and resume it before each bell.
   */
  let _audioCtx = null;

  function getAudioContext() {
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      debug('AUDIO', 'AudioContext created, state: ' + _audioCtx.state);
    }
    // Resume if iOS suspended or interrupted it (screen lock, phone call, Siri, etc.)
    if (_audioCtx.state === 'suspended' || _audioCtx.state === 'interrupted') {
      _audioCtx.resume().then(() => debug('AUDIO', 'AudioContext resumed from ' + _audioCtx.state)).catch(() => {});
    }
    // Nuclear option: if context is in 'closed' state, recreate it entirely
    if (_audioCtx.state === 'closed') {
      warn('AUDIO', 'AudioContext was closed — recreating');
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return _audioCtx;
  }

  // Unlock audio on ANY user gesture so timer bells work later.
  // Must run on EVERY gesture (once:false) because iOS can re-suspend
  // the AudioContext after background, notifications, phone calls, etc.
  function unlockAudio() {
    let ctx = getAudioContext();

    // If context is stuck after screen lock / phone call, force-recreate
    if (ctx.state !== 'running') {
      ctx.resume().then(() => debug('AUDIO', 'AudioContext unlocked via gesture')).catch(() => {
        warn('AUDIO', 'Resume failed — force-recreating AudioContext');
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        ctx = _audioCtx;
        debug('AUDIO', 'New AudioContext created, state: ' + ctx.state);
      });
    }

    // Play a silent buffer through Web Audio to fully unlock on iOS
    try {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch (e) {
      debug('AUDIO', 'Silent buffer play failed', e.message);
    }

    // HTML5 Audio hack: playing a silent audio element upgrades the iOS
    // audio session from "ambient" (respects mute switch) to "playback"
    // (plays through mute switch). Without this, bells are silent when
    // the physical mute switch is on.
    // Re-play after EVERY background return, not just once
    try {
      const audio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwMHAAAAAAD/+1DEAAAHAAGf9AAAISQQM/8MQBAAAABAA3/EACMAANwfB8Hw');
      audio.play().catch(() => {});
      debug('AUDIO', 'HTML5 Audio silent hack played');
    } catch (e) {}

    debug('AUDIO', 'Audio unlock attempted, context state: ' + ctx.state);
  }

  // Attach unlock to EVERY user gesture — keeps AudioContext alive on iOS
  ['touchstart', 'touchend', 'click'].forEach(evt => {
    document.addEventListener(evt, unlockAudio, { once: false, passive: true });
  });

  /**
   * Play a bell sound using Web Audio API
   * type: 'change' (pose change) or 'complete' (session end)
   */
  function playBell(type = 'change') {
    if (state.bellEnabled === false) {
      debug('AUDIO', 'Bell skipped (disabled in settings)');
      return;
    }
    try {
      let audioContext = getAudioContext();

      // If context is not running, try to resume; if that fails, recreate
      if (audioContext.state !== 'running') {
        warn('AUDIO', `Bell attempted with context state: ${audioContext.state} — trying recovery`);
        try {
          audioContext.resume();
        } catch (e) {}
        // If still not running, force-recreate
        if (audioContext.state !== 'running') {
          _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          audioContext = _audioCtx;
          warn('AUDIO', 'AudioContext force-recreated for bell, state: ' + audioContext.state);
        }
      }

      const now = audioContext.currentTime;

      if (type === 'change') {
        // Clear bell tone for phase/pose change
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);

        osc.frequency.value = 880;
        osc.type = 'sine';

        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        osc.start(now);
        osc.stop(now + 0.4);
        debug('AUDIO', 'Bell played: change');
      } else if (type === 'complete') {
        // Longer celebratory tone for session end
        const osc1 = audioContext.createOscillator();
        const osc2 = audioContext.createOscillator();
        const gain = audioContext.createGain();

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioContext.destination);

        osc1.frequency.value = 880;
        osc2.frequency.value = 1100;
        osc1.type = 'sine';
        osc2.type = 'sine';

        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

        osc1.start(now);
        osc2.start(now + 0.15);
        osc1.stop(now + 0.6);
        osc2.stop(now + 0.6);
        debug('AUDIO', 'Bell played: complete');
      }
    } catch (e) {
      debug('AUDIO', 'Web Audio API unavailable', e);
    }
  }

  /**
   * Initialize timer and start with first pose
   */
  function startTimer(routineName) {
    // Unlock audio on this user gesture so bells work during auto-advance
    unlockAudio();

    // Check custom routines first
    const customRoutine = (state.customRoutines || []).find(r => r.name === routineName);
    const routines = { ...HP_DATA.yogaRoutines, ...HP_DATA.hangboardRoutines };
    const routine = customRoutine || routines[routineName];

    if (!routine) {
      error('TIMER', `Invalid routine: ${routineName}`);
      return;
    }

    const isCustom = !!customRoutine;

    if (routine.type === 'yoga') {
      // Build poses array with computed durations
      const poses = routine.poses.map(pose => ({
        ...pose,
        computedDurationMinutes: isCustom ? pose.duration : HP_DATA.getPoseDuration(pose, state.corePoseMinutes)
      }));

      // Initialize timer state for yoga
      state.timerState = {
        timerType: 'yoga',
        routine: routine,
        routineName: routineName,
        poses: poses,
        currentPoseIndex: 0,
        poseDurationMs: poses[0].computedDurationMinutes * 60 * 1000,
        poseStartTime: null,
        elapsed: 0,
        isRunning: false,
        isPaused: true,
        animFrameId: null,
        sessionStartTime: Date.now()
      };

      info('TIMER', `Timer initialized for yoga: ${routineName}`, {
        poseCount: poses.length,
        firstPoseDuration: formatTime(state.timerState.poseDurationMs),
        corePoseMinutes: state.corePoseMinutes
      });

      renderTimerPose(0);
      requestWakeLock();
      startBackgroundTimer();
      togglePlayPause();
    } else if (routine.type === 'hangboard') {
      startHangboardTimer(routineName);
    } else {
      error('TIMER', `Unknown routine type: ${routine.type}`);
    }
  }

  /**
   * Initialize hangboard timer by building phases array
   */
  function startHangboardTimer(routineName) {
    const routines = HP_DATA.hangboardRoutines;
    const routine = routines[routineName];

    if (!routine || routine.type !== 'hangboard') {
      error('TIMER', `Invalid hangboard routine: ${routineName}`);
      return;
    }

    // Build phases array from hangboard structure
    const phases = [];

    // 1. WARMUP phase
    phases.push({
      phaseName: 'WARMUP',
      phaseClass: 'warmup',
      grip: null,
      set: null,
      totalSets: null,
      rep: null,
      totalReps: null,
      durationMs: routine.warmupSeconds * 1000,
      description: 'Get warmed up'
    });

    // 2. For each grip
    const gripCount = routine.grips.length;
    const singleArmGrips = routine.singleArmGrips || [];
    const switchSec = routine.switchSeconds || 5;

    // Helper: push one arm's worth of HANG/REST reps
    function pushReps(grip, setNum, totalSetsForGrip, side) {
      const label = side ? `${side} · ` : '';
      for (let repIndex = 0; repIndex < routine.repsPerSet; repIndex++) {
        const repNum = repIndex + 1;
        const isLastRep = (repIndex === routine.repsPerSet - 1);

        phases.push({
          phaseName: 'HANG',
          phaseClass: 'hang',
          grip: side ? `${grip} (${side})` : grip,
          set: setNum,
          totalSets: totalSetsForGrip,
          rep: repNum,
          totalReps: routine.repsPerSet,
          durationMs: routine.hangSeconds * 1000,
          description: `${label}Rep ${repNum} of ${routine.repsPerSet} · Set ${setNum} of ${totalSetsForGrip}`
        });

        if (!isLastRep) {
          phases.push({
            phaseName: 'REST',
            phaseClass: 'rest',
            grip: side ? `${grip} (${side})` : grip,
            set: setNum,
            totalSets: totalSetsForGrip,
            rep: repNum,
            totalReps: routine.repsPerSet,
            durationMs: routine.repRestSeconds * 1000,
            description: `${label}Rep ${repNum} of ${routine.repsPerSet} · Set ${setNum} of ${totalSetsForGrip}`
          });
        }
      }
    }

    for (let gripIndex = 0; gripIndex < gripCount; gripIndex++) {
      const grip = routine.grips[gripIndex];
      const isSingleArm = singleArmGrips.includes(grip);

      for (let setIndex = 0; setIndex < routine.setsPerGrip; setIndex++) {
        const setNum = setIndex + 1;
        const totalSetsForGrip = routine.setsPerGrip;
        const isLastSetOfLastGrip = (gripIndex === gripCount - 1) && (setIndex === routine.setsPerGrip - 1);

        if (isSingleArm) {
          // --- SINGLE-ARM GRIP (e.g. Slopers): Right → Switch → Left → Adjusted Rest ---

          // GET READY for right hand
          phases.push({
            phaseName: 'GET READY',
            phaseClass: 'getready',
            grip: `${grip} (Right)`,
            set: setNum,
            totalSets: totalSetsForGrip,
            rep: null,
            totalReps: null,
            durationMs: routine.getReadySeconds * 1000,
            description: `Right · Set ${setNum} of ${totalSetsForGrip}`
          });

          // Right hand reps
          pushReps(grip, setNum, totalSetsForGrip, 'Right');

          // SWITCH to left hand
          phases.push({
            phaseName: 'SWITCH',
            phaseClass: 'getready',
            grip: `${grip} (Left)`,
            set: setNum,
            totalSets: totalSetsForGrip,
            rep: null,
            totalReps: null,
            durationMs: switchSec * 1000,
            description: `Switch to left hand · Set ${setNum} of ${totalSetsForGrip}`
          });

          // Left hand reps
          pushReps(grip, setNum, totalSetsForGrip, 'Left');

          // SET REST — 3 min starts when right arm finishes,
          // so subtract switch + left set time from total rest
          if (!isLastSetOfLastGrip) {
            const leftSetMs = (routine.repsPerSet * routine.hangSeconds +
              (routine.repsPerSet - 1) * routine.repRestSeconds) * 1000;
            const adjustedRestMs = (routine.setRestSeconds * 1000) - (switchSec * 1000) - leftSetMs;
            if (adjustedRestMs > 0) {
              phases.push({
                phaseName: 'SET REST',
                phaseClass: 'warmup',
                grip: grip,
                set: setNum,
                totalSets: totalSetsForGrip,
                rep: null,
                totalReps: null,
                durationMs: adjustedRestMs,
                description: grip
              });
            }
          }
        } else {
          // --- NORMAL TWO-HAND GRIP ---

          // GET READY phase
          phases.push({
            phaseName: 'GET READY',
            phaseClass: 'getready',
            grip: grip,
            set: setNum,
            totalSets: totalSetsForGrip,
            rep: null,
            totalReps: null,
            durationMs: routine.getReadySeconds * 1000,
            description: `Set ${setNum} of ${totalSetsForGrip}`
          });

          // Normal reps (no side label)
          pushReps(grip, setNum, totalSetsForGrip, null);

          // SET REST phase (skip after last set of last grip)
          if (!isLastSetOfLastGrip) {
            phases.push({
              phaseName: 'SET REST',
              phaseClass: 'warmup',
              grip: grip,
              set: setNum,
              totalSets: totalSetsForGrip,
              rep: null,
              totalReps: null,
              durationMs: routine.setRestSeconds * 1000,
              description: grip
            });
          }
        }
      }
    }

    // Initialize timer state for hangboard
    state.timerState = {
      timerType: 'hangboard',
      routine: routine,
      routineName: routineName,
      phases: phases,
      currentPhaseIndex: 0,
      poseDurationMs: phases[0].durationMs,
      poseStartTime: null,
      elapsed: 0,
      isRunning: false,
      isPaused: true,
      animFrameId: null,
      sessionStartTime: Date.now()
    };

    info('TIMER', `Hangboard timer initialized: ${routineName}`, {
      phaseCount: phases.length,
      gripCount: gripCount,
      setsPerGrip: routine.setsPerGrip,
      repsPerSet: routine.repsPerSet,
      firstPhaseDuration: formatTime(state.timerState.poseDurationMs)
    });

    renderHangboardPhase(0);
    requestWakeLock();
    startBackgroundTimer();
    togglePlayPause();
  }

  /**
   * Update all timer UI elements for current hangboard phase
   */
  function renderHangboardPhase(index) {
    if (!state.timerState || index < 0 || index >= state.timerState.phases.length) {
      error('TIMER', `Invalid phase index: ${index}`);
      return;
    }

    const ts = state.timerState;
    const phase = ts.phases[index];
    const totalPhases = ts.phases.length;

    debug('TIMER', `Rendering hangboard phase ${index + 1}/${totalPhases}: ${phase.phaseName}`);

    // Update header
    document.getElementById('timer-routine-label').textContent = ts.routineName;
    document.getElementById('timer-pose-counter').textContent = `${index + 1}/${totalPhases}`;

    // Hide pose image (hangboard doesn't use images)
    document.getElementById('timer-pose-image').style.display = 'none';

    // Update phase name with color class
    const phaseNameEl = document.getElementById('timer-pose-name');
    phaseNameEl.innerHTML = `<span class="hb-phase-name ${phase.phaseClass}">${phase.phaseName}</span>`;

    // Update phase description (grip, set/rep info)
    document.getElementById('timer-pose-desc').textContent = phase.description;

    // Update countdown display
    document.getElementById('timer-countdown').textContent = formatTime(ts.poseDurationMs);

    // Reset progress bar
    document.getElementById('timer-progress-fill').style.width = '0%';

    // Update next phase preview
    const nextEl = document.getElementById('timer-next-pose');
    if (index + 1 < totalPhases) {
      const nextPhase = ts.phases[index + 1];
      const nextGrip = nextPhase.grip ? ` — ${nextPhase.grip}` : '';
      nextEl.textContent = `Next: ${nextPhase.phaseName}${nextGrip}`;
    } else {
      nextEl.textContent = 'Last phase!';
    }

    // Build progress dots
    const dotsContainer = document.getElementById('timer-dots');
    dotsContainer.innerHTML = '';
    for (let i = 0; i < totalPhases; i++) {
      const dot = document.createElement('div');
      dot.className = 'dot';
      if (i < index) {
        dot.classList.add('done');
      } else if (i === index) {
        dot.classList.add('current');
      }
      dotsContainer.appendChild(dot);
    }

    // Play bell sound for all phase transitions (except the very first phase)
    if (index > 0) {
      playBell('change');
      info('TIMER', `Phase changed: ${phase.phaseName}`);
    }
  }

  /**
   * Update all timer UI elements for current pose
   */
  function renderTimerPose(index) {
    if (!state.timerState || index < 0 || index >= state.timerState.poses.length) {
      error('TIMER', `Invalid pose index: ${index}`);
      return;
    }

    const ts = state.timerState;
    const pose = ts.poses[index];
    const totalPoses = ts.poses.length;

    debug('TIMER', `Rendering pose ${index + 1}/${totalPoses}: ${pose.name}`);

    // Update header
    document.getElementById('timer-routine-label').textContent = ts.routineName;
    document.getElementById('timer-pose-counter').textContent = `${index + 1}/${totalPoses}`;

    // Update pose info
    document.getElementById('timer-pose-name').textContent = pose.name;
    document.getElementById('timer-pose-desc').textContent = pose.description;

    // Show pose photo if available
    const imageArea = document.getElementById('timer-pose-image');
    const photo = getPosePhoto(pose.name);
    if (photo) {
      imageArea.innerHTML = `<img src="${photo}" alt="${pose.name}">`;
      imageArea.style.display = 'flex';
      imageArea.style.border = 'none';
    } else {
      imageArea.style.display = 'none';
    }

    // Update countdown display
    document.getElementById('timer-countdown').textContent = formatTime(ts.poseDurationMs);

    // Reset progress bar
    document.getElementById('timer-progress-fill').style.width = '0%';

    // Update next pose preview
    const nextEl = document.getElementById('timer-next-pose');
    if (index + 1 < totalPoses) {
      nextEl.textContent = `Next: ${ts.poses[index + 1].name}`;
    } else {
      nextEl.textContent = 'Last pose!';
    }

    // Build progress dots
    const dotsContainer = document.getElementById('timer-dots');
    dotsContainer.innerHTML = '';
    for (let i = 0; i < totalPoses; i++) {
      const dot = document.createElement('div');
      dot.className = 'dot';
      if (i < index) {
        dot.classList.add('done');
      } else if (i === index) {
        dot.classList.add('current');
      }
      dotsContainer.appendChild(dot);
    }

    // Play bell sound (except for first pose)
    if (index > 0) {
      playBell('change');
      info('TIMER', `Pose changed: ${pose.name}`);
    }
  }

  /**
   * Main timer tick — called via requestAnimationFrame
   */
  function timerTick() {
    if (!state.timerState || !state.timerState.isRunning) {
      return;
    }

    const ts = state.timerState;
    const now = Date.now();

    // Calculate elapsed time since pose started (accounting for pauses)
    const elapsed = ts.elapsed + (now - ts.poseStartTime);
    const remaining = ts.poseDurationMs - elapsed;

    // If we've been in background and multiple phases have expired, catch up
    if (remaining <= 0) {
      let overflow = -remaining; // extra ms beyond this phase
      let advanced = false;
      while (overflow >= 0) {
        const items = ts.timerType === 'yoga' ? ts.poses : ts.phases;
        const currentIdx = ts.timerType === 'yoga' ? ts.currentPoseIndex : ts.currentPhaseIndex;
        const nextIdx = currentIdx + 1;

        if (nextIdx >= items.length) {
          finishSession();
          return;
        }

        // Advance to next
        if (ts.timerType === 'yoga') {
          ts.currentPoseIndex = nextIdx;
          ts.poseDurationMs = ts.poses[nextIdx].computedDurationMinutes * 60 * 1000;
        } else {
          ts.currentPhaseIndex = nextIdx;
          ts.poseDurationMs = ts.phases[nextIdx].durationMs;
        }
        advanced = true;

        if (overflow < ts.poseDurationMs) {
          // We land partway into this phase
          ts.elapsed = overflow;
          ts.poseStartTime = now;
          const renderIdx = ts.timerType === 'yoga' ? ts.currentPoseIndex : ts.currentPhaseIndex;
          if (ts.timerType === 'yoga') renderTimerPose(renderIdx);
          else renderHangboardPhase(renderIdx);
          break;
        }
        overflow -= ts.poseDurationMs;
      }

      if (advanced) {
        debug('TIMER', 'Caught up after background — advanced through skipped phases');
      }
      ts.animFrameId = requestAnimationFrame(timerTick);
      return;
    }

    // Update countdown display
    document.getElementById('timer-countdown').textContent = formatTime(Math.max(0, remaining));

    // Update progress bar
    const progress = Math.min(100, (elapsed / ts.poseDurationMs) * 100);
    document.getElementById('timer-progress-fill').style.width = `${progress}%`;

    // Request next frame
    ts.animFrameId = requestAnimationFrame(timerTick);
  }

  // Resume timer accurately when returning from background / alerts / notifications
  function ensureTimerRunning(reason) {
    if (!state.timerState || !state.timerState.isRunning) return;
    debug('TIMER', `Ensuring timer alive — ${reason}`);
    if (state.timerState.animFrameId) cancelAnimationFrame(state.timerState.animFrameId);
    state.timerState.animFrameId = requestAnimationFrame(timerTick);
  }

  // When page becomes visible again, recover timer, audio, AND wake lock
  function recoverFromBackground(reason) {
    ensureTimerRunning(reason);
    // Re-acquire wake lock if timer is running (iOS releases it on background)
    if (state.timerState?.isRunning && !wakeLock) {
      info('TIMER', `Re-requesting wake lock on ${reason}`);
      requestWakeLock();
    }
    // Try to resume audio context — even without a gesture, some browsers allow it
    if (_audioCtx && _audioCtx.state !== 'running') {
      info('AUDIO', `Attempting audio recovery on ${reason}, state: ${_audioCtx.state}`);
      _audioCtx.resume().then(() => {
        info('AUDIO', `AudioContext recovered on ${reason}`);
      }).catch(() => {
        warn('AUDIO', `AudioContext resume failed on ${reason} — will retry on next touch`);
      });
    }
  }

  // ── iOS PWA persistence: force-save all state before the OS kills us ──
  function forceSaveAllState() {
    const userKey = state.user?.email || 'anon';
    try {
      // Save session history
      const histKey = `hp_history_${userKey}`;
      localStorage.setItem(histKey, JSON.stringify(state.sessionHistory));
      // Verify it stuck
      const check = localStorage.getItem(histKey);
      if (!check) warn('STORAGE', 'Force-save: history write did not persist');
      // Save settings
      saveSettings();
      info('STORAGE', 'Force-saved all state (lifecycle event)');
    } catch (e) {
      error('STORAGE', 'Force-save failed', e);
    }
  }

  // Request persistent storage so iOS doesn't evict our data
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then(granted => {
      info('STORAGE', `Persistent storage ${granted ? 'granted' : 'denied'}`);
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Going to background — save everything before iOS kills us
      forceSaveAllState();
    } else {
      recoverFromBackground('page became visible');
    }
  });

  // Backup: focus event catches notification banners and alerts that
  // may not trigger visibilitychange (especially on iOS PWA)
  window.addEventListener('focus', () => recoverFromBackground('window regained focus'));

  // pagehide fires reliably on iOS when PWA is being killed
  window.addEventListener('pagehide', () => {
    forceSaveAllState();
  });

  // beforeunload as last resort
  window.addEventListener('beforeunload', () => {
    forceSaveAllState();
  });

  // Backup: pageshow fires when page is restored from bfcache
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) recoverFromBackground('restored from bfcache');
  });

  // Watchdog: every 2 seconds, verify rAF loop is alive when timer should be running.
  // If the rAF chain died (uncaught error, weird browser state), restart it.
  setInterval(() => {
    if (!state.timerState || !state.timerState.isRunning || document.hidden) return;
    const ts = state.timerState;
    const now = Date.now();
    const elapsed = ts.elapsed + (now - ts.poseStartTime);
    const remaining = ts.poseDurationMs - elapsed;
    // If phase should have ended >1s ago and we're visible, rAF loop is dead — restart
    if (remaining < -1000) {
      warn('TIMER', 'Watchdog: timer appears stuck, restarting tick loop');
      ensureTimerRunning('watchdog detected stuck timer');
    }
  }, 2000);

  /**
   * Toggle play/pause
   */
  function togglePlayPause() {
    if (!state.timerState) {
      error('TIMER', 'Timer not initialized');
      return;
    }

    const ts = state.timerState;
    const playIcon = document.getElementById('icon-play');
    const pauseIcon = document.getElementById('icon-pause');

    if (ts.isRunning) {
      // Pause
      if (ts.animFrameId) {
        cancelAnimationFrame(ts.animFrameId);
        ts.animFrameId = null;
      }
      ts.elapsed += Date.now() - ts.poseStartTime;
      ts.poseStartTime = null;
      ts.isRunning = false;

      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
      info('TIMER', 'Timer paused');
    } else {
      // Play — unlock audio on this user gesture so bells keep working
      unlockAudio();
      ts.poseStartTime = Date.now();
      ts.isRunning = true;

      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
      timerTick();
      info('TIMER', 'Timer playing');
    }

    ts.isPaused = !ts.isRunning;
  }

  /**
   * Move to next pose or phase
   */
  function nextPose() {
    if (!state.timerState) {
      error('TIMER', 'Timer not initialized');
      return;
    }

    const ts = state.timerState;

    if (ts.timerType === 'yoga') {
      const nextIndex = ts.currentPoseIndex + 1;

      if (nextIndex >= ts.poses.length) {
        finishSession();
        return;
      }

      // Move to next pose
      ts.currentPoseIndex = nextIndex;
      const nextPose = ts.poses[nextIndex];
      ts.poseDurationMs = nextPose.computedDurationMinutes * 60 * 1000;
      ts.poseStartTime = Date.now();
      ts.elapsed = 0;

      renderTimerPose(nextIndex);
      debug('TIMER', `Advanced to pose ${nextIndex + 1}`);

      if (ts.isRunning) {
        timerTick();
      }
    } else if (ts.timerType === 'hangboard') {
      const nextIndex = ts.currentPhaseIndex + 1;

      if (nextIndex >= ts.phases.length) {
        finishSession();
        return;
      }

      // Move to next phase
      ts.currentPhaseIndex = nextIndex;
      const nextPhase = ts.phases[nextIndex];
      ts.poseDurationMs = nextPhase.durationMs;
      ts.poseStartTime = Date.now();
      ts.elapsed = 0;

      renderHangboardPhase(nextIndex);
      debug('TIMER', `Advanced to phase ${nextIndex + 1}: ${nextPhase.phaseName}`);

      if (ts.isRunning) {
        timerTick();
      }
    }
  }

  /**
   * Go back to previous pose or phase
   */
  function prevPose() {
    if (!state.timerState) {
      error('TIMER', 'Timer not initialized');
      return;
    }

    const ts = state.timerState;

    if (ts.timerType === 'yoga') {
      if (ts.currentPoseIndex === 0) {
        // Reset current pose timer
        ts.poseStartTime = Date.now();
        ts.elapsed = 0;
        document.getElementById('timer-countdown').textContent = formatTime(ts.poseDurationMs);
        document.getElementById('timer-progress-fill').style.width = '0%';
        info('TIMER', 'Reset current pose timer');
        return;
      }

      // Move to previous pose
      ts.currentPoseIndex--;
      const prevPose = ts.poses[ts.currentPoseIndex];
      ts.poseDurationMs = prevPose.computedDurationMinutes * 60 * 1000;
      ts.poseStartTime = Date.now();
      ts.elapsed = 0;

      renderTimerPose(ts.currentPoseIndex);
      debug('TIMER', `Moved back to pose ${ts.currentPoseIndex + 1}`);

      if (ts.isRunning) {
        timerTick();
      }
    } else if (ts.timerType === 'hangboard') {
      if (ts.currentPhaseIndex === 0) {
        // Reset current phase timer
        ts.poseStartTime = Date.now();
        ts.elapsed = 0;
        document.getElementById('timer-countdown').textContent = formatTime(ts.poseDurationMs);
        document.getElementById('timer-progress-fill').style.width = '0%';
        info('TIMER', 'Reset current phase timer');
        return;
      }

      // Move to previous phase
      ts.currentPhaseIndex--;
      const prevPhase = ts.phases[ts.currentPhaseIndex];
      ts.poseDurationMs = prevPhase.durationMs;
      ts.poseStartTime = Date.now();
      ts.elapsed = 0;

      renderHangboardPhase(ts.currentPhaseIndex);
      debug('TIMER', `Moved back to phase ${ts.currentPhaseIndex + 1}: ${prevPhase.phaseName}`);

      if (ts.isRunning) {
        timerTick();
      }
    }
  }

  /**
   * Finish session and save to history
   */
  function finishSession() {
    if (!state.timerState) {
      error('TIMER', 'Timer not initialized');
      return;
    }

    const ts = state.timerState;

    // Stop timer
    if (ts.animFrameId) {
      cancelAnimationFrame(ts.animFrameId);
    }
    ts.isRunning = false;
    stopBackgroundTimer();
    releaseWakeLock();

    // Calculate actual session duration
    const actualDurationMs = Date.now() - ts.sessionStartTime;
    const actualDurationMin = Math.round(actualDurationMs / 1000 / 60);

    // Calculate planned duration based on routine type
    let plannedMin;
    let completedInfo;
    if (ts.timerType === 'yoga') {
      const isCustom = (state.customRoutines || []).some(r => r.name === ts.routineName);
      plannedMin = isCustom
        ? Math.round(ts.routine.poses.reduce((s, p) => s + p.duration, 0))
        : HP_DATA.calcYogaDuration(ts.routine, state.corePoseMinutes);
      completedInfo = `${ts.poses.length} poses`;
    } else if (ts.timerType === 'hangboard') {
      plannedMin = HP_DATA.calcHangboardDuration(ts.routine);
      const gripCount = ts.routine.grips.length;
      completedInfo = `${gripCount} grips`;
    }

    info('TIMER', `Session completed: ${ts.routineName}`, {
      plannedMin: plannedMin,
      actualMin: actualDurationMin,
      type: ts.timerType
    });

    // Save to history
    const session = {
      date: new Date().toISOString(),
      routineName: ts.routineName,
      durationMin: actualDurationMin,
      coreTime: state.corePoseMinutes,
      completed: completedInfo,
      type: ts.timerType
    };

    state.sessionHistory.unshift(session); // Add to front (newest first)
    try {
      const key = `hp_history_${state.user?.email || 'anon'}`;
      const payload = JSON.stringify(state.sessionHistory);
      localStorage.setItem(key, payload);
      // Verify the write actually persisted
      const readBack = localStorage.getItem(key);
      if (readBack === payload) {
        info('STORAGE', `Session saved & verified (${state.sessionHistory.length} total)`);
      } else {
        warn('STORAGE', `Session saved but verify FAILED — readback mismatch`);
      }
    } catch (e) {
      error('STORAGE', 'Failed to save session', e);
    }

    // Save to Supabase
    saveSessionToDB(session);

    // Log to Google Sheets
    logToGoogleSheets(session);

    // Play completion bell
    playBell('complete');

    // Clear timer state
    state.timerState = null;

    // Show completion message briefly, then go home
    warn('TIMER', 'Session complete! Great work!');
    setTimeout(() => {
      showScreen('screen-home');
    }, 1500);
  }

  // ============================================
  // SESSION HISTORY (localStorage for now)
  // ============================================
  function loadSessionHistory() {
    try {
      const key = `hp_history_${state.user?.email || 'anon'}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        state.sessionHistory = JSON.parse(saved);
        info('STORAGE', `Loaded ${state.sessionHistory.length} history entries`);
      } else {
        state.sessionHistory = [];
        debug('STORAGE', 'No session history found');
      }
    } catch (e) {
      error('STORAGE', 'Failed to load session history', e);
      state.sessionHistory = [];
    }
  }

  // Track active history filter
  let historyFilter = 'all';

  /**
   * Calculate current day streak (consecutive days with at least one session)
   */
  function calcStreak(sessions) {
    if (!sessions.length) return 0;

    // Get unique dates (YYYY-MM-DD) sorted newest first
    const dateSet = new Set();
    sessions.forEach(s => {
      const d = new Date(s.date);
      dateSet.add(d.toISOString().split('T')[0]);
    });
    const dates = [...dateSet].sort().reverse();

    // Check if today or yesterday has a session (streak must be current)
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (dates[0] !== today && dates[0] !== yesterday) return 0;

    let streak = 1;
    for (let i = 0; i < dates.length - 1; i++) {
      const curr = new Date(dates[i]);
      const prev = new Date(dates[i + 1]);
      const diff = (curr - prev) / 86400000;
      if (diff === 1) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  /**
   * Build last-7-days activity data for the stacked bar chart
   * Returns { label, yogaMins, hangMins, totalMins } per day
   */
  function buildWeeklyData(sessions) {
    const days = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const daySessions = sessions.filter(s => new Date(s.date).toISOString().split('T')[0] === key);
      let yogaMins = 0, hangMins = 0;
      daySessions.forEach(s => {
        if (getSessionType(s) === 'hangboard') hangMins += (s.durationMin || 0);
        else yogaMins += (s.durationMin || 0);
      });
      days.push({ label: dayNames[d.getDay()], yogaMins, hangMins, totalMins: yogaMins + hangMins, key });
    }
    return days;
  }

  /**
   * Group sessions by date bucket (Today, Yesterday, This Week, Earlier)
   */
  function groupByDate(sessions) {
    const now = new Date();
    const todayKey = now.toISOString().split('T')[0];
    const yesterdayKey = new Date(now - 86400000).toISOString().split('T')[0];
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const groups = { 'Today': [], 'Yesterday': [], 'This Week': [], 'Earlier': [] };

    sessions.forEach(s => {
      const d = new Date(s.date);
      const key = d.toISOString().split('T')[0];
      if (key === todayKey) groups['Today'].push(s);
      else if (key === yesterdayKey) groups['Yesterday'].push(s);
      else if (d > weekAgo) groups['This Week'].push(s);
      else groups['Earlier'].push(s);
    });

    return groups;
  }

  /**
   * Build monthly summary data — returns array of { label, totalHrs, yogaHrs, hangHrs, sessions, yogaPct, hangPct }
   * sorted newest month first, going back as far as history exists
   */
  function buildMonthlySummary(sessions) {
    const months = {};
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    sessions.forEach(s => {
      const d = new Date(s.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      if (!months[key]) {
        months[key] = { label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, yogaMins: 0, hangMins: 0, count: 0, year: d.getFullYear(), month: d.getMonth() };
      }
      const type = getSessionType(s);
      if (type === 'hangboard') months[key].hangMins += (s.durationMin || 0);
      else months[key].yogaMins += (s.durationMin || 0);
      months[key].count++;
    });

    return Object.values(months)
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .map(m => {
        const totalMins = m.yogaMins + m.hangMins;
        return {
          label: m.label,
          totalHrs: (totalMins / 60).toFixed(1),
          yogaHrs: (m.yogaMins / 60).toFixed(1),
          hangHrs: (m.hangMins / 60).toFixed(1),
          sessions: m.count,
          yogaPct: totalMins > 0 ? Math.round((m.yogaMins / totalMins) * 100) : 0,
          hangPct: totalMins > 0 ? Math.round((m.hangMins / totalMins) * 100) : 0
        };
      });
  }

  /**
   * Render the monthly summary panel
   */
  function renderMonthlySummary() {
    const panel = document.getElementById('monthly-summary-panel');
    if (!panel) return;

    const data = buildMonthlySummary(state.sessionHistory);
    if (data.length === 0) {
      panel.innerHTML = '<div class="empty-state">No sessions recorded yet.</div>';
      return;
    }

    panel.innerHTML = data.map(m => `
      <div class="month-row">
        <div class="month-row-header">
          <div class="month-name">${m.label}</div>
          <div class="month-total">${m.totalHrs} hrs · ${m.sessions} sessions</div>
        </div>
        <div class="month-breakdown">
          <div class="month-type">
            <span class="month-type-dot yoga"></span>
            Yoga: ${m.yogaHrs} hrs
          </div>
          <div class="month-type">
            <span class="month-type-dot hangboard"></span>
            Hangboard: ${m.hangHrs} hrs
          </div>
        </div>
        <div class="month-bar-bg">
          <div class="month-bar-yoga" style="width: ${m.yogaPct}%;"></div>
          <div class="month-bar-hangboard" style="width: ${m.hangPct}%;"></div>
        </div>
      </div>
    `).join('');

    info('RENDER', `Rendered monthly summary: ${data.length} months`);
  }

  /**
   * Detect session type from routine name
   */
  function getSessionType(session) {
    const name = (session.routineName || '').toLowerCase();
    if (name.includes('20mm') || name.includes('hangboard') || name.includes('sloper') || name.includes('pocket') || name.includes('crimp')) {
      return 'hangboard';
    }
    return 'yoga';
  }

  function renderHistory() {
    debug('RENDER', 'Rendering history screen');

    const listContainer = document.getElementById('history-list');
    if (!listContainer) return;

    // Apply filter
    let filtered = state.sessionHistory;
    if (historyFilter !== 'all') {
      filtered = state.sessionHistory.filter(s => getSessionType(s) === historyFilter);
    }

    // --- Stats ---
    const totalSessions = state.sessionHistory.length;
    const totalMinutes = state.sessionHistory.reduce((sum, s) => sum + (s.durationMin || 0), 0);
    const totalHours = (totalMinutes / 60).toFixed(1);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const streak = calcStreak(state.sessionHistory);

    // This month session count
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthSessions = state.sessionHistory.filter(s => new Date(s.date) >= monthStart).length;

    // This week hours
    const thisWeekMins = state.sessionHistory
      .filter(s => new Date(s.date) > weekAgo)
      .reduce((sum, s) => sum + (s.durationMin || 0), 0);
    const thisWeekHrs = (thisWeekMins / 60).toFixed(1);

    document.getElementById('stat-sessions').textContent = totalSessions;
    document.getElementById('stat-hours').textContent = totalHours;
    document.getElementById('stat-month-sessions').textContent = thisMonthSessions;
    document.getElementById('stat-week-hrs').textContent = thisWeekHrs;
    document.getElementById('stat-streak').textContent = streak;

    // --- Split stats by workout type ---
    const splitHTML = (yogaVal, hangVal) =>
      `<span class="stat-split-item"><span class="stat-split-dot yoga"></span>${yogaVal}</span>` +
      `<span class="stat-split-item"><span class="stat-split-dot hangboard"></span>${hangVal}</span>`;

    // Sessions split
    const yogaSessions = state.sessionHistory.filter(s => getSessionType(s) === 'yoga').length;
    const hangSessions = state.sessionHistory.filter(s => getSessionType(s) === 'hangboard').length;
    const sessionsSplitEl = document.getElementById('stat-sessions-split');
    if (sessionsSplitEl) sessionsSplitEl.innerHTML = splitHTML(yogaSessions, hangSessions);

    // All-time hours split
    const yogaTotalMins = state.sessionHistory.filter(s => getSessionType(s) === 'yoga').reduce((sum, s) => sum + (s.durationMin || 0), 0);
    const hangTotalMins = state.sessionHistory.filter(s => getSessionType(s) === 'hangboard').reduce((sum, s) => sum + (s.durationMin || 0), 0);
    const hoursSplitEl = document.getElementById('stat-hours-split');
    if (hoursSplitEl) hoursSplitEl.innerHTML = splitHTML((yogaTotalMins / 60).toFixed(1), (hangTotalMins / 60).toFixed(1));

    // This month split (session counts)
    const yogaMonthSessions = state.sessionHistory.filter(s => new Date(s.date) >= monthStart && getSessionType(s) === 'yoga').length;
    const hangMonthSessions = state.sessionHistory.filter(s => new Date(s.date) >= monthStart && getSessionType(s) === 'hangboard').length;
    const monthSplitEl = document.getElementById('stat-month-split');
    if (monthSplitEl) monthSplitEl.innerHTML = splitHTML(yogaMonthSessions, hangMonthSessions);

    // This week split (hours)
    const yogaWeekMins = state.sessionHistory.filter(s => new Date(s.date) > weekAgo && getSessionType(s) === 'yoga').reduce((sum, s) => sum + (s.durationMin || 0), 0);
    const hangWeekMins = state.sessionHistory.filter(s => new Date(s.date) > weekAgo && getSessionType(s) === 'hangboard').reduce((sum, s) => sum + (s.durationMin || 0), 0);
    const weekSplitEl = document.getElementById('stat-week-split');
    if (weekSplitEl) weekSplitEl.innerHTML = splitHTML((yogaWeekMins / 60).toFixed(1), (hangWeekMins / 60).toFixed(1));

    // --- Weekly Activity Chart (stacked: yoga green + hangboard persimmon) ---
    const weeklyData = buildWeeklyData(state.sessionHistory);
    const maxMins = Math.max(...weeklyData.map(d => d.totalMins), 1);
    const weeklyTotal = weeklyData.reduce((sum, d) => sum + d.totalMins, 0);
    const barsContainer = document.getElementById('weekly-bars');
    const weeklyTotalEl = document.getElementById('weekly-total');

    if (barsContainer) {
      barsContainer.innerHTML = '';
      weeklyData.forEach(day => {
        const totalPct = Math.max(Math.round((day.totalMins / maxMins) * 100), 5);
        const yogaPct = day.totalMins > 0 ? Math.round((day.yogaMins / day.totalMins) * totalPct) : 0;
        const hangPct = day.totalMins > 0 ? totalPct - yogaPct : 0;

        const col = document.createElement('div');
        col.className = 'weekly-bar-col';

        let barHTML = `<div class="weekly-bar-stack" style="height: ${totalPct}%;" title="${day.yogaMins}m yoga, ${day.hangMins}m hangboard">`;
        if (day.totalMins === 0) {
          barHTML += `<div class="weekly-bar-seg empty" style="height: 100%;"></div>`;
        } else {
          if (day.yogaMins > 0) barHTML += `<div class="weekly-bar-seg yoga" style="height: ${yogaPct > 0 ? (day.yogaMins / day.totalMins * 100) : 0}%;"></div>`;
          if (day.hangMins > 0) barHTML += `<div class="weekly-bar-seg hangboard" style="height: ${hangPct > 0 ? (day.hangMins / day.totalMins * 100) : 0}%;"></div>`;
        }
        barHTML += `</div>`;

        col.innerHTML = barHTML + `<div class="weekly-bar-label">${day.label}</div>`;
        barsContainer.appendChild(col);
      });
    }
    if (weeklyTotalEl) {
      weeklyTotalEl.textContent = weeklyTotal >= 60 ? `${(weeklyTotal / 60).toFixed(1)} hrs` : `${weeklyTotal} min`;
    }

    // Weekly type split (yoga hrs vs hangboard hrs for last 7 days)
    const weeklyYogaMins = weeklyData.reduce((sum, d) => sum + d.yogaMins, 0);
    const weeklyHangMins = weeklyData.reduce((sum, d) => sum + d.hangMins, 0);
    const weeklyTypeSplitEl = document.getElementById('weekly-type-split');
    if (weeklyTypeSplitEl) {
      const fmtTime = (mins) => mins >= 60 ? `${(mins / 60).toFixed(1)} hrs` : `${mins} min`;
      weeklyTypeSplitEl.innerHTML =
        `<span class="weekly-type-item"><span class="weekly-type-dot yoga"></span>${fmtTime(weeklyYogaMins)}</span>` +
        `<span class="weekly-type-item"><span class="weekly-type-dot hangboard"></span>${fmtTime(weeklyHangMins)}</span>`;
    }

    // --- Filter button state ---
    document.querySelectorAll('.history-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === historyFilter);
    });

    // --- Grouped session list ---
    listContainer.innerHTML = '';

    if (filtered.length === 0) {
      const msg = historyFilter === 'all'
        ? 'No sessions yet. Complete a workout to see it here!'
        : `No ${historyFilter} sessions yet.`;
      listContainer.innerHTML = `<div class="empty-state">${msg}</div>`;
      debug('RENDER', 'History empty (filtered)');
      return;
    }

    const groups = groupByDate(filtered);

    Object.entries(groups).forEach(([label, sessions]) => {
      if (sessions.length === 0) return;

      const header = document.createElement('div');
      header.className = 'history-date-group';
      header.textContent = label;
      listContainer.appendChild(header);

      sessions.forEach(session => {
        const date = new Date(session.date);
        const dateStr = date.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        });
        const type = getSessionType(session);

        const item = document.createElement('div');
        item.className = 'session-item';
        item.innerHTML = `
          <div class="session-top">
            <div class="session-name">${session.routineName}</div>
            <div class="session-date">${dateStr}</div>
          </div>
          <div class="session-details">
            <span class="session-type-badge ${type}">${type}</span>
            <span>${session.durationMin} min</span>
            ${session.coreTime ? `<span>${session.coreTime}:00 core</span>` : ''}
          </div>
        `;
        listContainer.appendChild(item);
      });
    });

    info('RENDER', `Rendered ${filtered.length} history entries (filter: ${historyFilter})`);
  }

  // ============================================
  // SETTINGS
  // ============================================

  function loadSettings() {
    try {
      const key = `hp_settings_${state.user?.email || 'anon'}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const settings = JSON.parse(saved);
        state.corePoseMinutes = settings.corePoseMinutes || 5;
        state.bellEnabled = settings.bellEnabled !== false; // default true
        state.wakeLockEnabled = settings.wakeLockEnabled !== false; // default true
        state.sheetsEnabled = settings.sheetsEnabled || false;
        state.sheetsUrl = settings.sheetsUrl || '';
        state.sheetId = settings.sheetId || '';
        state.sheetTab = settings.sheetTab || '';
        info('SETTINGS', 'Settings loaded', settings);
      } else {
        // Defaults
        state.bellEnabled = true;
        state.wakeLockEnabled = true;
        state.sheetsEnabled = false;
        state.sheetsUrl = '';
        state.sheetId = '';
        state.sheetTab = '';
        debug('SETTINGS', 'No saved settings, using defaults');
      }
    } catch (e) {
      error('SETTINGS', 'Failed to load settings', e);
    }
  }

  function saveSettings() {
    try {
      const key = `hp_settings_${state.user?.email || 'anon'}`;
      const settings = {
        corePoseMinutes: state.corePoseMinutes,
        bellEnabled: state.bellEnabled,
        wakeLockEnabled: state.wakeLockEnabled,
        sheetsEnabled: state.sheetsEnabled,
        sheetsUrl: state.sheetsUrl,
        sheetId: state.sheetId,
        sheetTab: state.sheetTab
      };
      localStorage.setItem(key, JSON.stringify(settings));
      debug('SETTINGS', 'Settings saved');
    } catch (e) {
      error('SETTINGS', 'Failed to save settings', e);
    }
  }

  function initSettings() {
    // Sync UI with state
    const slider = document.getElementById('settings-core-slider');
    const valEl = document.getElementById('settings-core-val');
    if (slider) slider.value = state.corePoseMinutes;
    if (valEl) valEl.textContent = `${state.corePoseMinutes}:00`;

    const bellToggle = document.getElementById('toggle-bell');
    if (bellToggle) bellToggle.classList.toggle('active', state.bellEnabled !== false);

    const wakeLockToggle = document.getElementById('toggle-wakelock');
    if (wakeLockToggle) wakeLockToggle.classList.toggle('active', state.wakeLockEnabled !== false);

    const sheetsToggle = document.getElementById('toggle-sheets');
    if (sheetsToggle) sheetsToggle.classList.toggle('active', state.sheetsEnabled === true);

    const sheetsConfig = document.getElementById('sheets-config');
    if (sheetsConfig) sheetsConfig.style.display = state.sheetsEnabled ? 'block' : 'none';

    const sheetsUrlEl = document.getElementById('settings-sheets-url');
    if (sheetsUrlEl) sheetsUrlEl.value = state.sheetsUrl || '';

    const sheetIdEl = document.getElementById('settings-sheet-id');
    if (sheetIdEl) sheetIdEl.value = state.sheetId || '';

    const sheetTabEl = document.getElementById('settings-sheet-tab');
    if (sheetTabEl) sheetTabEl.value = state.sheetTab || '';

    debug('SETTINGS', 'Settings screen initialized');
  }

  // ============================================
  // SUPABASE DATA SYNC
  // ============================================

  // --- Settings ---
  async function loadSettingsFromDB() {
    loadSettings(); // Load from localStorage immediately
    if (!supabase || !state.user?.id) return;

    // Snapshot local values before DB load so we don't lose them
    const localSheets = {
      enabled: state.sheetsEnabled,
      url: state.sheetsUrl,
      id: state.sheetId,
      tab: state.sheetTab
    };

    try {
      const { data, error: dbErr } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', state.user.id)
        .single();

      if (dbErr && dbErr.code !== 'PGRST116') { // PGRST116 = no rows
        warn('DB', 'Failed to load settings from DB', dbErr.message);
        return;
      }

      if (data) {
        state.corePoseMinutes = data.core_pose_minutes ?? 5;
        state.bellEnabled = data.bell_enabled ?? true;
        state.wakeLockEnabled = data.wake_lock_enabled ?? true;
        // Only override sheets settings if DB has explicit non-null values;
        // this prevents DB nulls (e.g. missing columns) from clobbering
        // localStorage values after clearing Safari website data
        state.sheetsEnabled = (data.sheets_enabled != null) ? data.sheets_enabled : localSheets.enabled;
        state.sheetsUrl = (data.sheets_url != null) ? data.sheets_url : localSheets.url;
        state.sheetId = (data.sheet_id != null) ? data.sheet_id : localSheets.id;
        state.sheetTab = (data.sheet_tab != null) ? data.sheet_tab : localSheets.tab;
        info('DB', `Settings loaded from Supabase (sheetsEnabled=${state.sheetsEnabled})`);
        // Sync merged result back to localStorage
        saveSettings();
      } else {
        // No DB record yet, push localStorage settings to DB
        info('DB', 'No settings in DB, pushing local settings');
        await saveSettingsToDB();
      }
    } catch (e) {
      warn('DB', 'Settings DB load error', e.message);
    }
  }

  async function saveSettingsToDB() {
    saveSettings(); // Always save to localStorage
    if (!supabase || !state.user?.id) return;

    try {
      const payload = {
        user_id: state.user.id,
        core_pose_minutes: state.corePoseMinutes,
        bell_enabled: state.bellEnabled,
        wake_lock_enabled: state.wakeLockEnabled,
        sheets_enabled: state.sheetsEnabled,
        sheets_url: state.sheetsUrl,
        sheet_id: state.sheetId,
        sheet_tab: state.sheetTab,
        updated_at: new Date().toISOString()
      };
      const { error: dbErr } = await supabase
        .from('user_settings')
        .upsert(payload);
      if (dbErr) {
        warn('DB', `Failed to save settings to DB: ${dbErr.message} (sheets_enabled=${state.sheetsEnabled})`);
      } else {
        info('DB', `Settings saved to Supabase (sheetsEnabled=${state.sheetsEnabled}, url=${state.sheetsUrl ? 'set' : 'empty'})`);
      }
    } catch (e) {
      warn('DB', `Settings DB save error: ${e.message}`);
    }
  }

  // --- Session History ---
  async function loadSessionHistoryFromDB() {
    loadSessionHistory(); // Load from localStorage immediately

    // v0.3.4 one-time recovery: add missing session from 2/26/2026
    // (lost due to iOS PWA backgrounding bug fixed in this version)
    const recoveryKey = 'hp_recovery_034b_done';
    if (!localStorage.getItem(recoveryKey)) {
      const missing = {
        date: '2026-02-26T18:00:00.000Z',
        routineName: 'Upper Body',
        durationMin: 53,
        coreTime: 0,
        completed: 'manual recovery (v0.3.4)',
        type: 'yoga'
      };
      const alreadyExists = state.sessionHistory.some(s =>
        s.date && s.date.startsWith('2026-02-26') && s.routineName === 'Upper Body'
      );
      if (!alreadyExists) {
        state.sessionHistory.push(missing); // push to end (oldest)
        state.sessionHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
        const key = `hp_history_${state.user?.email || 'anon'}`;
        localStorage.setItem(key, JSON.stringify(state.sessionHistory));
        info('STORAGE', 'Recovered missing session: 2/26 Upper Body 53min');
      }
      localStorage.setItem(recoveryKey, 'true');
    }

    if (!supabase || !state.user?.id) return;

    try {
      const { data, error: dbErr } = await supabase
        .from('session_history')
        .select('*')
        .eq('user_id', state.user.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (dbErr) {
        warn('DB', 'Failed to load history from DB', dbErr.message);
        return;
      }

      if (data && data.length > 0) {
        state.sessionHistory = data.map(row => ({
          id: row.id,
          date: row.created_at,
          routineName: row.routine_name,
          durationMin: row.duration_min,
          coreTime: row.core_time,
          completed: row.completed,
          type: row.type
        }));
        info('DB', `Loaded ${data.length} sessions from Supabase`);
        // Sync to localStorage
        try {
          const key = `hp_history_${state.user?.email || 'anon'}`;
          localStorage.setItem(key, JSON.stringify(state.sessionHistory));
        } catch (e) { /* ignore */ }
      }
    } catch (e) {
      warn('DB', 'History DB load error', e.message);
    }
  }

  async function saveSessionToDB(session) {
    if (!supabase || !state.user?.id) return;

    try {
      const { error: dbErr } = await supabase
        .from('session_history')
        .insert({
          user_id: state.user.id,
          routine_name: session.routineName,
          duration_min: session.durationMin,
          core_time: session.coreTime || null,
          completed: session.completed || null,
          type: session.type || 'yoga'
        });
      if (dbErr) warn('DB', 'Failed to save session to DB', dbErr.message);
      else info('DB', `Session saved to Supabase: ${session.routineName}`);
    } catch (e) {
      warn('DB', 'Session DB save error', e.message);
    }
  }

  // --- Custom Routines ---
  async function loadCustomRoutinesFromDB() {
    loadCustomRoutines(); // Load from localStorage immediately
    if (!supabase || !state.user?.id) return;

    try {
      const { data, error: dbErr } = await supabase
        .from('custom_routines')
        .select('*')
        .eq('user_id', state.user.id)
        .order('created_at', { ascending: true });

      if (dbErr) {
        warn('DB', 'Failed to load custom routines from DB', dbErr.message);
        return;
      }

      if (data && data.length > 0) {
        state.customRoutines = data.map(row => ({
          id: row.id,
          name: row.name,
          focus: row.focus,
          type: row.type || 'yoga',
          poses: row.poses || [],
          isPublic: row.is_public,
          createdAt: row.created_at
        }));
        info('DB', `Loaded ${data.length} custom routines from Supabase`);
        saveCustomRoutines(); // Sync to localStorage
      } else if (state.customRoutines.length > 0) {
        // Push localStorage routines to DB
        for (const routine of state.customRoutines) {
          await saveCustomRoutineToDB(routine);
        }
        info('DB', `Pushed ${state.customRoutines.length} local routines to Supabase`);
      }
    } catch (e) {
      warn('DB', 'Custom routines DB load error', e.message);
    }
  }

  async function saveCustomRoutineToDB(routine) {
    if (!supabase || !state.user?.id) return;

    try {
      if (routine.id) {
        // Update existing
        const { error: dbErr } = await supabase
          .from('custom_routines')
          .update({
            name: routine.name,
            focus: routine.focus,
            type: routine.type || 'yoga',
            poses: routine.poses,
            is_public: routine.isPublic || false,
            updated_at: new Date().toISOString()
          })
          .eq('id', routine.id);
        if (dbErr) warn('DB', 'Failed to update routine in DB', dbErr.message);
        else debug('DB', `Routine updated in Supabase: ${routine.name}`);
      } else {
        // Insert new
        const { data, error: dbErr } = await supabase
          .from('custom_routines')
          .insert({
            user_id: state.user.id,
            name: routine.name,
            focus: routine.focus,
            type: routine.type || 'yoga',
            poses: routine.poses,
            is_public: routine.isPublic || false
          })
          .select('id')
          .single();
        if (dbErr) warn('DB', 'Failed to insert routine to DB', dbErr.message);
        else {
          routine.id = data.id;
          debug('DB', `Routine saved to Supabase: ${routine.name}`);
        }
      }
    } catch (e) {
      warn('DB', 'Routine DB save error', e.message);
    }
  }

  async function deleteCustomRoutineFromDB(routineId) {
    if (!supabase || !routineId) return;

    try {
      const { error: dbErr } = await supabase
        .from('custom_routines')
        .delete()
        .eq('id', routineId);
      if (dbErr) warn('DB', 'Failed to delete routine from DB', dbErr.message);
      else debug('DB', `Routine deleted from Supabase: ${routineId}`);
    } catch (e) {
      warn('DB', 'Routine DB delete error', e.message);
    }
  }

  // --- Google Sheets Auto-Logging ---
  async function logToGoogleSheets(session) {
    if (!state.sheetsEnabled || !state.sheetsUrl) {
      debug('SHEETS', 'Google Sheets logging disabled or no URL configured');
      return false;
    }

    const typeLabel = (session.type || 'yoga') === 'hangboard' ? 'Hangboard' : 'Yoga';
    const payload = {
      tabName: state.sheetTab || 'Daily View',
      date: session.date,
      typeOfWorkout: typeLabel,
      minutes: session.durationMin,
      notes: session.routineName
    };

    info('SHEETS', 'Logging session to Google Sheets', payload);

    try {
      const response = await fetch(state.sheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // text/plain avoids CORS preflight
        body: JSON.stringify(payload),
        mode: 'no-cors' // Apps Script web apps need no-cors from client
      });

      // With no-cors, we can't read the response, but if it didn't throw, it likely worked
      info('SHEETS', 'Session logged to Google Sheets (no-cors mode, response opaque)');
      return true;
    } catch (e) {
      warn('SHEETS', 'Failed to log to Google Sheets', e.message);
      return false;
    }
  }

  async function syncAllHistoryToSheets() {
    if (!state.sheetsEnabled || !state.sheetsUrl) {
      alert('Please enable Google Sheets and set your Web App URL first.');
      return;
    }

    const history = state.sessionHistory;
    if (!history || history.length === 0) {
      alert('No session history to sync.');
      return;
    }

    info('SHEETS', `Syncing ${history.length} sessions to Google Sheets...`);

    // Send oldest first so they appear in chronological order
    const sorted = [...history].reverse();
    let successCount = 0;

    for (const session of sorted) {
      try {
        const typeLabel = (session.type || 'yoga') === 'hangboard' ? 'Hangboard' : 'Yoga';
        const payload = {
          tabName: state.sheetTab || 'Daily View',
          date: session.date,
          typeOfWorkout: typeLabel,
          minutes: session.durationMin,
          notes: session.routineName
        };

        await fetch(state.sheetsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(payload),
          mode: 'no-cors'
        });

        successCount++;
        // Small delay to avoid overwhelming the Apps Script
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        warn('SHEETS', `Failed to sync session: ${session.routineName}`, e.message);
      }
    }

    info('SHEETS', `Synced ${successCount}/${history.length} sessions to Google Sheets`);
    alert(`Synced ${successCount} of ${history.length} sessions to your Google Sheet!`);
  }

  function showSheetsSetupInstructions() {
    const instructions = `
GOOGLE SHEETS AUTO-LOGGING SETUP
═════════════════════════════════

Step 1: Open your Google Sheet
  → Sheet ID: ${state.sheetId || '(set in Settings)'}
  → Tab: ${state.sheetTab || 'Daily View'}

Step 2: Uses your existing columns:
  A: Date | B: Type of Workout | E: Minutes | K: Notes1
  (Other columns like miles, HR, pace stay blank for yoga/hangboard)

Step 3: Create the Apps Script
  1. In your Sheet, go to Extensions → Apps Script
  2. Delete any existing code
  3. Paste this script:

────────────────────────────────
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(data.tabName || 'Daily View');
    if (!sheet) sheet = ss.getSheets()[0];

    var dt = new Date(data.date);
    var dateStr = (dt.getMonth()+1) + '/' + dt.getDate() + '/' + dt.getFullYear();

    // A=Date, B=Type of Workout, C=miles, D=vertical feet, E=Minutes, F=AVG HR, G=Pace, H=AVG GAP, I=Weight, J=Workout plan, K=Notes1, L=Notes2
    sheet.appendRow([
      dateStr,
      data.typeOfWorkout,
      '', '',
      data.minutes,
      '', '', '', '',
      '',
      data.notes,
      ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({status: 'ok'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({status: 'error', message: err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
────────────────────────────────

Step 4: Deploy as Web App
  1. Click "Deploy" → "New deployment"
  2. Click the gear icon → "Web app"
  3. Set "Execute as" → "Me"
  4. Set "Who has access" → "Anyone"
  5. Click "Deploy"
  6. Authorize when prompted
  7. Copy the Web App URL

Step 5: Paste the URL
  → Paste the Web App URL in Settings

Step 6: Test it
  → Tap "Test Connection" in Settings
    `.trim();

    alert(instructions);
  }

  // --- Invite a Friend ---
  function openInviteModal() {
    const modal = document.getElementById('invite-modal');
    const emailInput = document.getElementById('invite-email');
    const statusEl = document.getElementById('invite-status');
    const sendBtn = document.getElementById('btn-invite-send');

    if (modal) modal.style.display = 'flex';
    if (emailInput) { emailInput.value = ''; emailInput.focus(); }
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'invite-status'; }
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send Invite'; }
    info('INVITE', 'Invite modal opened');
  }

  function closeInviteModal() {
    const modal = document.getElementById('invite-modal');
    if (modal) modal.style.display = 'none';
    debug('INVITE', 'Invite modal closed');
  }

  async function sendInvite() {
    const emailInput = document.getElementById('invite-email');
    const statusEl = document.getElementById('invite-status');
    const sendBtn = document.getElementById('btn-invite-send');
    const email = (emailInput?.value || '').trim();

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (statusEl) {
        statusEl.textContent = 'Please enter a valid email address.';
        statusEl.className = 'invite-status error';
      }
      warn('INVITE', 'Invalid email entered', email);
      return;
    }

    // Loading state
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending...'; }
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'invite-status'; }
    info('INVITE', `Sending invite to ${email}`);

    try {
      // Get inviter name from profile
      const inviterName = state.displayName || state.email || 'A HoldPoint user';

      // Call Supabase Edge Function directly via fetch
      const fnResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ email, inviter_name: inviterName })
      });

      const data = await fnResponse.json();
      if (!fnResponse.ok || data?.error) throw new Error(data?.error || 'Failed to send invite');

      // Success
      info('INVITE', `Invite sent successfully to ${email}`);
      if (statusEl) {
        statusEl.textContent = `Invite sent to ${email}!`;
        statusEl.className = 'invite-status success';
      }
      if (emailInput) emailInput.value = '';
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send Another'; }

      // Log to app_invites table
      try {
        const session = await supabase.auth.getSession();
        const userId = session?.data?.session?.user?.id;
        if (userId) {
          await supabase.from('app_invites').insert({
            inviter_id: userId,
            invited_email: email,
            status: 'sent'
          });
          debug('INVITE', 'Invite recorded in app_invites table');
        }
      } catch (dbErr) {
        warn('INVITE', 'Failed to record invite in DB (email still sent)', dbErr.message);
      }

    } catch (err) {
      error('INVITE', `Failed to send invite: ${err.message}`);
      if (statusEl) {
        statusEl.textContent = `Could not send invite. ${err.message}`;
        statusEl.className = 'invite-status error';
      }
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Try Again'; }
    }
  }

  // --- Community Routines ---
  async function loadCommunityRoutines() {
    if (!supabase) return [];

    try {
      const { data, error: dbErr } = await supabase
        .from('community_routines')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (dbErr) {
        warn('DB', 'Failed to load community routines', dbErr.message);
        return [];
      }

      info('DB', `Loaded ${(data || []).length} community routines`);
      return data || [];
    } catch (e) {
      warn('DB', 'Community routines load error', e.message);
      return [];
    }
  }

  async function shareRoutineToCommunity(routine) {
    if (!supabase || !state.user?.id) return false;

    try {
      const { error: dbErr } = await supabase
        .from('community_routines')
        .insert({
          creator_id: state.user.id,
          creator_name: state.user.displayName || 'Anonymous',
          name: routine.name,
          focus: routine.focus || '',
          type: routine.type || 'yoga',
          poses: routine.poses,
          description: routine.focus || ''
        });
      if (dbErr) {
        warn('DB', 'Failed to share routine', dbErr.message);
        return false;
      }
      info('DB', `Routine shared to community: ${routine.name}`);
      return true;
    } catch (e) {
      warn('DB', 'Share routine error', e.message);
      return false;
    }
  }

  // ============================================
  // COMMUNITY ROUTINES SCREEN
  // ============================================

  async function renderCommunityScreen() {
    debug('RENDER', 'Rendering Community Routines screen');
    const listEl = document.getElementById('community-list');
    if (!listEl) return;

    listEl.innerHTML = '<div class="empty-state">Loading community routines...</div>';

    const routines = await loadCommunityRoutines();

    if (!routines || routines.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          No community routines yet. Be the first to share one!<br><br>
          Go to <strong>My Routines</strong>, create a custom routine, then tap <strong>Share</strong>.
        </div>
      `;
      return;
    }

    listEl.innerHTML = '';

    routines.forEach(cr => {
      const poses = Array.isArray(cr.poses) ? cr.poses : [];
      const totalMin = poses.reduce((s, p) => s + (p.duration || 0), 0);
      const card = document.createElement('div');
      card.className = 'my-routine-card';
      card.innerHTML = `
        <div class="my-routine-top">
          <div class="my-routine-name">${cr.name}</div>
          <span class="my-routine-badge" style="background:var(--accent);color:#fff;font-size:0.7rem;">Community</span>
        </div>
        <div class="my-routine-meta">${cr.type || 'Yoga'} · ${poses.length} poses · ${Math.round(totalMin)} min</div>
        <div class="my-routine-meta" style="opacity:0.6;font-size:0.75rem;">by ${cr.creator_name || 'Anonymous'}${cr.description ? ' — ' + cr.description : ''}</div>
        <div class="my-routine-actions">
          <button class="btn-routine-action btn-add-community" data-id="${cr.id}">+ Add to My Routines</button>
        </div>
      `;
      listEl.appendChild(card);
    });

    // Bind "Add to My Routines" buttons
    listEl.querySelectorAll('.btn-add-community').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const crId = e.currentTarget.dataset.id;
        const cr = routines.find(r => r.id === crId);
        if (!cr) return;

        // Check if already added
        const alreadyExists = state.customRoutines.some(r => r.name === cr.name);
        if (alreadyExists) {
          alert(`"${cr.name}" is already in your routines.`);
          return;
        }

        // Add as a custom routine
        const newRoutine = {
          name: cr.name,
          focus: cr.description || cr.focus || '',
          poses: Array.isArray(cr.poses) ? cr.poses : []
        };

        state.customRoutines.push(newRoutine);
        saveCustomRoutines();
        await saveCustomRoutineToDB(newRoutine);

        // Increment add_count on community routine
        if (supabase) {
          try {
            await supabase
              .from('community_routines')
              .update({ add_count: (cr.add_count || 0) + 1 })
              .eq('id', crId);
          } catch (e) {
            debug('DB', 'Failed to increment add_count', e.message);
          }
        }

        alert(`"${cr.name}" added to your routines!`);
        info('COMMUNITY', `Added community routine: ${cr.name}`);
      });
    });

    info('RENDER', `Rendered ${routines.length} community routines`);
  }

  // ============================================
  // MY ROUTINES
  // ============================================

  function renderMyRoutines() {
    debug('RENDER', 'Rendering My Routines screen');
    const listEl = document.getElementById('my-routines-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    // Built-in yoga routines
    Object.entries(HP_DATA.yogaRoutines).forEach(([name, routine]) => {
      const duration = HP_DATA.calcYogaDuration(routine, state.corePoseMinutes);
      const card = document.createElement('div');
      card.className = 'my-routine-card';
      card.innerHTML = `
        <div class="my-routine-top">
          <div class="my-routine-name">${name}</div>
          <span class="my-routine-badge badge-builtin">Built-in</span>
        </div>
        <div class="my-routine-meta">Yoga · ${routine.poses.length} poses · ${duration} min</div>
      `;
      card.addEventListener('click', () => {
        state.selectedRoutine = name;
        renderDetail(name, routine);
      });
      listEl.appendChild(card);
    });

    // Built-in hangboard routines
    Object.entries(HP_DATA.hangboardRoutines).forEach(([name, routine]) => {
      const duration = HP_DATA.calcHangboardDuration(routine);
      const card = document.createElement('div');
      card.className = 'my-routine-card';
      card.innerHTML = `
        <div class="my-routine-top">
          <div class="my-routine-name">${name}</div>
          <span class="my-routine-badge badge-builtin">Built-in</span>
        </div>
        <div class="my-routine-meta">Hangboard · ${routine.grips.length} grips · ${duration} min</div>
      `;
      card.addEventListener('click', () => {
        state.selectedRoutine = name;
        renderDetail(name, routine);
      });
      listEl.appendChild(card);
    });

    // Custom routines
    if (state.customRoutines && state.customRoutines.length > 0) {
      state.customRoutines.forEach((routine, idx) => {
        const totalMin = routine.poses.reduce((s, p) => s + p.duration, 0);
        const card = document.createElement('div');
        card.className = 'my-routine-card';
        card.innerHTML = `
          <div class="my-routine-top">
            <div class="my-routine-name">${routine.name}</div>
            <span class="my-routine-badge badge-custom">Custom</span>
          </div>
          <div class="my-routine-meta">Yoga · ${routine.poses.length} poses · ${Math.round(totalMin)} min</div>
          <div class="my-routine-actions">
            <button class="btn-routine-action btn-edit-custom" data-idx="${idx}">Edit</button>
            <button class="btn-routine-action btn-share-custom" data-idx="${idx}">Share</button>
            <button class="btn-routine-action danger btn-delete-custom" data-idx="${idx}">Delete</button>
          </div>
        `;

        // Tap card (not actions) to open detail
        card.addEventListener('click', (e) => {
          if (e.target.closest('.my-routine-actions')) return;
          state.selectedRoutine = routine.name;
          // Build a compatible routine object for renderDetail
          const compat = {
            type: 'yoga',
            focus: routine.focus || '',
            poses: routine.poses,
            _isCustom: true,
            _customIndex: idx
          };
          renderDetail(routine.name, compat);
        });

        listEl.appendChild(card);
      });

      // Bind edit/delete
      listEl.querySelectorAll('.btn-edit-custom').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openRoutineBuilder(parseInt(e.currentTarget.dataset.idx));
        });
      });

      listEl.querySelectorAll('.btn-share-custom').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = parseInt(e.currentTarget.dataset.idx);
          const routine = state.customRoutines[idx];
          if (!routine) return;
          if (confirm(`Share "${routine.name}" to the community? Others will be able to add it to their routines.`)) {
            const ok = await shareRoutineToCommunity(routine);
            if (ok) {
              alert(`"${routine.name}" shared to community!`);
              info('COMMUNITY', `Shared routine: ${routine.name}`);
            } else {
              alert('Failed to share routine. Please try again.');
            }
          }
        });
      });

      listEl.querySelectorAll('.btn-delete-custom').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = parseInt(e.currentTarget.dataset.idx);
          const routine = state.customRoutines[idx];
          const name = routine?.name;
          if (confirm(`Delete "${name}"?`)) {
            // Delete from Supabase if it has a DB id
            if (routine?.id) {
              await deleteCustomRoutineFromDB(routine.id);
            }
            state.customRoutines.splice(idx, 1);
            saveCustomRoutines();
            renderMyRoutines();
            info('BUILDER', `Deleted custom routine: "${name}"`);
          }
        });
      });
    }

    const customCount = (state.customRoutines || []).length;
    info('RENDER', `Rendered My Routines: ${Object.keys(HP_DATA.yogaRoutines).length} yoga + ${Object.keys(HP_DATA.hangboardRoutines).length} hangboard + ${customCount} custom`);
  }

  // ============================================
  // POSE PHOTOS
  // ============================================

  function loadPosePhotos() {
    try {
      const key = `hp_photos_${state.user?.email || 'anon'}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        state.posePhotos = JSON.parse(saved);
        info('PHOTOS', `Loaded ${Object.keys(state.posePhotos).length} pose photos`);
      } else {
        state.posePhotos = {};
        debug('PHOTOS', 'No saved pose photos');
      }
    } catch (e) {
      error('PHOTOS', 'Failed to load pose photos', e);
      state.posePhotos = {};
    }
  }

  function savePosePhotos() {
    try {
      const key = `hp_photos_${state.user?.email || 'anon'}`;
      localStorage.setItem(key, JSON.stringify(state.posePhotos || {}));
      debug('PHOTOS', 'Pose photos saved');
    } catch (e) {
      error('PHOTOS', 'Failed to save pose photos (storage might be full)', e);
    }
  }

  function getUniquePoseNames() {
    const names = new Set();
    Object.values(HP_DATA.yogaRoutines).forEach(routine => {
      routine.poses.forEach(pose => {
        names.add(pose.name);
      });
    });
    return Array.from(names).sort();
  }

  function renderPhotoGrid() {
    const grid = document.getElementById('photo-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const allPoses = getUniquePoseNames();
    const filter = state.photoFilter || 'all';
    const photos = state.posePhotos || {};

    const filtered = allPoses.filter(name => {
      if (filter === 'assigned') return photos[name];
      if (filter === 'empty') return !photos[name];
      return true;
    });

    filtered.forEach(poseName => {
      const hasPhoto = !!photos[poseName];
      const card = document.createElement('div');
      card.className = 'photo-card';

      if (hasPhoto) {
        card.innerHTML = `
          <div class="photo-card-image">
            <img src="${photos[poseName]}" alt="${poseName}">
            <button class="photo-remove" data-pose="${poseName}">×</button>
          </div>
          <div class="photo-card-name">${poseName}</div>
        `;
      } else {
        card.innerHTML = `
          <div class="photo-card-image">
            <div class="photo-placeholder">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              <span>Tap to add</span>
            </div>
          </div>
          <div class="photo-card-name">${poseName}</div>
        `;
      }

      // Tap to add/replace photo
      card.querySelector('.photo-card-image').addEventListener('click', (e) => {
        if (e.target.closest('.photo-remove')) return; // Don't trigger on remove button
        state.editingPoseName = poseName;
        document.getElementById('photo-file-input').click();
        debug('PHOTOS', `Opening file picker for "${poseName}"`);
      });

      // Remove photo
      const removeBtn = card.querySelector('.photo-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const name = e.currentTarget.dataset.pose;
          delete state.posePhotos[name];
          savePosePhotos();
          renderPhotoGrid();
          info('PHOTOS', `Photo removed for "${name}"`);
        });
      }

      grid.appendChild(card);
    });

    debug('RENDER', `Photo grid: ${filtered.length} poses (${filter} filter)`);
  }

  function getPosePhoto(poseName) {
    return (state.posePhotos && state.posePhotos[poseName]) || null;
  }

  // ============================================
  // CUSTOM ROUTINE BUILDER
  // ============================================

  let builderPoses = [];
  let editingRoutineIndex = -1; // -1 = new routine

  function openRoutineBuilder(editIndex) {
    editingRoutineIndex = editIndex !== undefined ? editIndex : -1;
    const isEdit = editingRoutineIndex >= 0;

    document.getElementById('builder-title').textContent = isEdit ? 'Edit Routine' : 'New Routine';

    if (isEdit && state.customRoutines[editingRoutineIndex]) {
      const routine = state.customRoutines[editingRoutineIndex];
      document.getElementById('builder-name').value = routine.name || '';
      document.getElementById('builder-focus').value = routine.focus || '';
      builderPoses = routine.poses.map(p => ({ ...p }));
    } else {
      document.getElementById('builder-name').value = '';
      document.getElementById('builder-focus').value = '';
      builderPoses = [
        { name: 'Pose 1', duration: 5, isCore: true },
        { name: 'Pose 2', duration: 5, isCore: true },
        { name: 'Savasana', duration: 3, isSavasana: true }
      ];
    }

    renderBuilderPoses();
    showScreen('screen-builder');
    debug('BUILDER', `Opened routine builder (${isEdit ? 'editing' : 'new'})`);
  }

  function addBuilderPose() {
    // Insert before savasana if it exists, otherwise at end
    const savasanaIdx = builderPoses.findIndex(p => p.isSavasana);
    const newPose = { name: 'New Pose', duration: 5, isCore: true };
    if (savasanaIdx >= 0) {
      builderPoses.splice(savasanaIdx, 0, newPose);
    } else {
      builderPoses.push(newPose);
    }
    renderBuilderPoses();
    debug('BUILDER', `Added pose (total: ${builderPoses.length})`);
  }

  function removeBuilderPose(index) {
    if (builderPoses.length <= 1) return;
    builderPoses.splice(index, 1);
    renderBuilderPoses();
    debug('BUILDER', `Removed pose at index ${index}`);
  }

  function renderBuilderPoses() {
    const list = document.getElementById('builder-pose-list');
    if (!list) return;
    list.innerHTML = '';

    builderPoses.forEach((pose, i) => {
      const item = document.createElement('div');
      item.className = 'builder-pose-item';
      item.innerHTML = `
        <span class="drag-handle">☰</span>
        <div class="builder-pose-info">
          <input type="text" value="${pose.name}" data-index="${i}" data-field="name" placeholder="Pose name">
        </div>
        <div class="builder-pose-dur">
          <input type="number" value="${pose.duration}" data-index="${i}" data-field="duration" min="0.25" max="30" step="0.25">
          <span>min</span>
        </div>
        <button class="builder-pose-remove" data-index="${i}">×</button>
      `;
      list.appendChild(item);
    });

    // Bind change listeners
    list.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index);
        const field = e.target.dataset.field;
        if (field === 'name') {
          builderPoses[idx].name = e.target.value;
        } else if (field === 'duration') {
          builderPoses[idx].duration = parseFloat(e.target.value) || 1;
        }
      });
    });

    // Bind remove listeners
    list.querySelectorAll('.builder-pose-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        removeBuilderPose(parseInt(e.currentTarget.dataset.index));
      });
    });
  }

  function saveCustomRoutine() {
    const name = document.getElementById('builder-name').value.trim();
    const focus = document.getElementById('builder-focus').value.trim();

    if (!name) {
      alert('Please enter a routine name.');
      return;
    }

    if (builderPoses.length < 2) {
      alert('Add at least 2 poses.');
      return;
    }

    // Sync any unsaved input values
    document.querySelectorAll('#builder-pose-list input').forEach(input => {
      const idx = parseInt(input.dataset.index);
      const field = input.dataset.field;
      if (field === 'name') builderPoses[idx].name = input.value;
      if (field === 'duration') builderPoses[idx].duration = parseFloat(input.value) || 1;
    });

    const routine = {
      name,
      focus,
      type: 'yoga',
      poses: builderPoses.map(p => ({
        name: p.name,
        duration: p.duration,
        description: '',
        isCore: p.isSavasana ? false : true,
        isSavasana: p.isSavasana || false
      })),
      createdAt: new Date().toISOString()
    };

    if (!state.customRoutines) state.customRoutines = [];

    if (editingRoutineIndex >= 0) {
      routine.id = state.customRoutines[editingRoutineIndex]?.id; // Preserve DB id
      state.customRoutines[editingRoutineIndex] = routine;
      info('BUILDER', `Updated custom routine: "${name}"`);
    } else {
      state.customRoutines.push(routine);
      info('BUILDER', `Created custom routine: "${name}" with ${builderPoses.length} poses`);
    }

    saveCustomRoutines();
    saveCustomRoutineToDB(routine);
    renderMyRoutines();
    showScreen('screen-my-routines');
  }

  function loadCustomRoutines() {
    try {
      const key = `hp_custom_${state.user?.email || 'anon'}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        state.customRoutines = JSON.parse(saved);
        info('STORAGE', `Loaded ${state.customRoutines.length} custom routines`);
      } else {
        state.customRoutines = [];
      }
    } catch (e) {
      error('STORAGE', 'Failed to load custom routines', e);
      state.customRoutines = [];
    }
  }

  function saveCustomRoutines() {
    try {
      const key = `hp_custom_${state.user?.email || 'anon'}`;
      localStorage.setItem(key, JSON.stringify(state.customRoutines || []));
      debug('STORAGE', 'Custom routines saved');
    } catch (e) {
      error('STORAGE', 'Failed to save custom routines', e);
    }
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  async function init() {
    info('APP', '=== HoldPoint v0.1.0 starting ===');
    info('APP', `Timestamp: ${new Date().toISOString()}`);
    info('APP', `User agent: ${navigator.userAgent}`);
    debug('APP', 'Initializing event listeners');

    // Login form
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('signup-form')?.addEventListener('submit', handleSignup);

    // Show signup / show login links
    document.getElementById('show-signup')?.addEventListener('click', (e) => {
      e.preventDefault();
      debug('NAV', 'User clicked "Sign up" link');
      showScreen('screen-signup');
    });
    document.getElementById('show-login')?.addEventListener('click', (e) => {
      e.preventDefault();
      debug('NAV', 'User clicked "Sign in" link');
      showScreen('screen-login');
    });

    // Workout type tabs
    document.querySelectorAll('.tab-pill').forEach(pill => {
      pill.addEventListener('click', () => setWorkoutType(pill.dataset.type));
    });

    // Core time buttons
    document.getElementById('btn-time-down')?.addEventListener('click', () => adjustCoreTime(-1));
    document.getElementById('btn-time-up')?.addEventListener('click', () => adjustCoreTime(1));

    // Detail back button
    document.getElementById('btn-detail-back')?.addEventListener('click', () => {
      debug('NAV', 'Back from detail');
      showScreen('screen-home');
    });

    // Start routine button
    document.getElementById('btn-start-routine')?.addEventListener('click', () => {
      info('TIMER', `Starting routine: ${state.selectedRoutine}`);
      startTimer(state.selectedRoutine);
      showScreen('screen-timer');
    });

    // Bottom nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const screen = item.dataset.screen;
        debug('NAV', `Nav tap: ${screen}`);
        if (screen === 'screen-history') renderHistory();
        showScreen(screen);
      });
    });

    // History filter tabs
    document.querySelectorAll('.history-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        historyFilter = btn.dataset.filter;
        debug('HISTORY', `Filter changed: ${historyFilter}`);
        renderHistory();
      });
    });

    // Monthly Summary toggle
    document.getElementById('btn-monthly-summary')?.addEventListener('click', () => {
      const btn = document.getElementById('btn-monthly-summary');
      const panel = document.getElementById('monthly-summary-panel');
      const isOpen = panel.classList.toggle('open');
      btn.classList.toggle('open', isOpen);
      if (isOpen) renderMonthlySummary();
      debug('HISTORY', `Monthly summary ${isOpen ? 'opened' : 'closed'}`);
    });

    // Avatar → profile
    document.getElementById('app-avatar')?.addEventListener('click', () => {
      debug('NAV', 'Avatar tapped → profile');
      showScreen('screen-profile');
    });

    // Profile menu items
    document.getElementById('btn-my-routines')?.addEventListener('click', () => {
      debug('NAV', 'My Routines tapped');
      renderMyRoutines();
      showScreen('screen-my-routines');
    });
    document.getElementById('btn-manage-photos')?.addEventListener('click', () => {
      debug('NAV', 'Manage Photos tapped');
      renderPhotoGrid();
      showScreen('screen-photos');
    });
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      debug('NAV', 'Settings tapped');
      initSettings();
      showScreen('screen-settings');
    });
    document.getElementById('btn-share-routine')?.addEventListener('click', () => {
      debug('NAV', 'Community Routines tapped');
      showScreen('screen-community');
      renderCommunityScreen();
    });
    document.getElementById('btn-logout')?.addEventListener('click', handleLogout);

    // Invite a Friend
    document.getElementById('btn-invite-friend')?.addEventListener('click', () => {
      debug('NAV', 'Invite a Friend tapped');
      openInviteModal();
    });
    document.getElementById('btn-invite-cancel')?.addEventListener('click', closeInviteModal);
    document.getElementById('btn-invite-close')?.addEventListener('click', closeInviteModal);
    document.getElementById('btn-invite-send')?.addEventListener('click', sendInvite);
    // Close modal on backdrop click
    document.getElementById('invite-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'invite-modal') closeInviteModal();
    });
    // Send on Enter key in email input
    document.getElementById('invite-email')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); sendInvite(); }
    });

    // Settings back
    document.getElementById('btn-settings-back')?.addEventListener('click', () => {
      showScreen('screen-profile');
    });

    // Settings: core pose slider
    document.getElementById('settings-core-slider')?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      state.corePoseMinutes = val;
      document.getElementById('settings-core-val').textContent = `${val}:00`;
      document.getElementById('core-time-value').textContent = `${val}:00`;
      saveSettingsToDB();
      renderRoutines();
    });

    // Settings: toggle bell
    document.getElementById('toggle-bell')?.addEventListener('click', (e) => {
      const toggle = e.currentTarget;
      toggle.classList.toggle('active');
      state.bellEnabled = toggle.classList.contains('active');
      saveSettingsToDB();
      debug('SETTINGS', `Bell sound ${state.bellEnabled ? 'enabled' : 'disabled'}`);
    });

    // Settings: toggle wake lock
    document.getElementById('toggle-wakelock')?.addEventListener('click', (e) => {
      const toggle = e.currentTarget;
      toggle.classList.toggle('active');
      state.wakeLockEnabled = toggle.classList.contains('active');
      saveSettingsToDB();
      debug('SETTINGS', `Wake lock ${state.wakeLockEnabled ? 'enabled' : 'disabled'}`);
    });

    // Settings: toggle google sheets
    document.getElementById('toggle-sheets')?.addEventListener('click', (e) => {
      const toggle = e.currentTarget;
      toggle.classList.toggle('active');
      state.sheetsEnabled = toggle.classList.contains('active');
      const configEl = document.getElementById('sheets-config');
      if (configEl) configEl.style.display = state.sheetsEnabled ? 'block' : 'none';
      saveSettingsToDB();
      debug('SETTINGS', `Google Sheets ${state.sheetsEnabled ? 'enabled' : 'disabled'}`);
    });

    // Settings: sheets URL, ID, and tab save on blur
    document.getElementById('settings-sheets-url')?.addEventListener('blur', (e) => {
      state.sheetsUrl = e.target.value.trim();
      saveSettingsToDB();
      debug('SETTINGS', `Sheets URL saved: ${state.sheetsUrl}`);
    });

    document.getElementById('settings-sheet-id')?.addEventListener('blur', (e) => {
      state.sheetId = e.target.value.trim();
      saveSettingsToDB();
      debug('SETTINGS', `Sheet ID saved: ${state.sheetId}`);
    });

    document.getElementById('settings-sheet-tab')?.addEventListener('blur', (e) => {
      state.sheetTab = e.target.value.trim();
      saveSettingsToDB();
      debug('SETTINGS', `Sheet tab saved: ${state.sheetTab}`);
    });

    // Settings: test Google Sheets connection
    document.getElementById('btn-test-sheets')?.addEventListener('click', async () => {
      if (!state.sheetsUrl) {
        alert('Please enter your Web App URL first.');
        return;
      }
      info('SHEETS', 'Testing Google Sheets connection...');
      const ok = await logToGoogleSheets({
        date: new Date().toISOString(),
        routineName: 'HoldPoint Test',
        durationMin: 0,
        type: 'test'
      });
      if (ok) {
        alert('Success! Check your Google Sheet — you should see a test row.');
      } else {
        alert('Connection failed. Check your Web App URL and make sure you deployed the Apps Script correctly.');
      }
    });

    // Settings: sync history to sheets
    document.getElementById('btn-sync-history-sheets')?.addEventListener('click', async () => {
      if (confirm(`Sync all ${state.sessionHistory.length} session(s) to Google Sheets?`)) {
        await syncAllHistoryToSheets();
      }
    });

    // Settings: show setup instructions
    document.getElementById('btn-sheets-setup')?.addEventListener('click', () => {
      showSheetsSetupInstructions();
    });

    // Settings: clear history
    document.getElementById('btn-clear-history')?.addEventListener('click', async () => {
      if (confirm('Delete all session history? This cannot be undone.')) {
        state.sessionHistory = [];
        try {
          const key = `hp_history_${state.user?.email || 'anon'}`;
          localStorage.removeItem(key);
          info('SETTINGS', 'Session history cleared from localStorage');
        } catch (e) {
          error('SETTINGS', 'Failed to clear local history', e);
        }
        // Also clear from Supabase
        if (supabase && state.user?.id) {
          try {
            const { error: dbErr } = await supabase
              .from('session_history')
              .delete()
              .eq('user_id', state.user.id);
            if (dbErr) warn('DB', 'Failed to clear history from DB', dbErr.message);
            else info('DB', 'Session history cleared from Supabase');
          } catch (e) {
            warn('DB', 'History DB clear error', e.message);
          }
        }
        // Show confirmation
        alert('Session history cleared.');
      }
    });

    // My Routines back
    document.getElementById('btn-my-routines-back')?.addEventListener('click', () => {
      showScreen('screen-profile');
    });

    // Create custom routine
    document.getElementById('btn-create-routine')?.addEventListener('click', () => {
      debug('NAV', 'Create Routine tapped');
      openRoutineBuilder();
    });

    // Community back
    document.getElementById('btn-community-back')?.addEventListener('click', () => {
      showScreen('screen-profile');
    });

    // Photos back
    document.getElementById('btn-photos-back')?.addEventListener('click', () => {
      showScreen('screen-profile');
    });

    // Photo filters
    document.querySelectorAll('.photo-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.photo-filter-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        state.photoFilter = e.currentTarget.dataset.filter;
        renderPhotoGrid();
      });
    });

    // Photo file input handler
    document.getElementById('photo-file-input')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !state.editingPoseName) return;

      const reader = new FileReader();
      reader.onload = function(event) {
        // Resize image to max 400px to save localStorage space
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement('canvas');
          const maxSize = 400;
          let w = img.width;
          let h = img.height;
          if (w > h) {
            if (w > maxSize) { h = h * maxSize / w; w = maxSize; }
          } else {
            if (h > maxSize) { w = w * maxSize / h; h = maxSize; }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

          // Save to state and localStorage
          if (!state.posePhotos) state.posePhotos = {};
          state.posePhotos[state.editingPoseName] = dataUrl;
          savePosePhotos();
          renderPhotoGrid();
          info('PHOTOS', `Photo saved for "${state.editingPoseName}"`);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = ''; // Reset input
    });

    // Builder back
    document.getElementById('btn-builder-back')?.addEventListener('click', () => {
      showScreen('screen-my-routines');
      renderMyRoutines();
    });

    // Builder add pose
    document.getElementById('btn-builder-add-pose')?.addEventListener('click', () => {
      addBuilderPose();
    });

    // Builder save
    document.getElementById('btn-save-routine')?.addEventListener('click', () => {
      saveCustomRoutine();
    });

    // Timer close button
    document.getElementById('btn-timer-close')?.addEventListener('click', () => {
      if (state.timerState?.isRunning) {
        if (confirm('Leave workout? Progress will be lost.')) {
          if (state.timerState?.animFrameId) {
            cancelAnimationFrame(state.timerState.animFrameId);
          }
          stopBackgroundTimer();
          releaseWakeLock();
          state.timerState = null;
          info('TIMER', 'Session abandoned by user');
          showScreen('screen-home');
        }
      } else {
        debug('NAV', 'Timer close tapped');
        stopBackgroundTimer();
        releaseWakeLock();
        state.timerState = null;
        showScreen('screen-home');
      }
    });

    // Timer control buttons
    document.getElementById('btn-timer-play')?.addEventListener('click', togglePlayPause);
    document.getElementById('btn-timer-prev')?.addEventListener('click', prevPose);
    document.getElementById('btn-timer-next')?.addEventListener('click', nextPose);

    // Check for existing session (async — Supabase session check)
    const hasSession = await loadUserFromStorage();
    if (hasSession) {
      info('APP', 'Existing session found, skipping login');
      await onLoginSuccess();
    } else {
      info('APP', 'No session found, showing login');
      showScreen('screen-login');
    }

    info('APP', '=== HoldPoint initialized ===');
  }

  // ============================================
  // PUBLIC API
  // ============================================
  return {
    init,
    exportLogs,
    getState: () => ({ ...state }),
    getLogHistory: () => [...logHistory]
  };
})();

// Boot the app
document.addEventListener('DOMContentLoaded', HP.init);

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(reg => console.log('[HP] Service worker registered:', reg.scope))
    .catch(err => console.warn('[HP] Service worker registration failed:', err));
}
