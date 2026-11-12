/* =====================================================
   🌊 Водный Баланс — v2 с прогрессией, комбо и звуками
   ===================================================== */

// ===== DOM =====
const waterEl    = document.getElementById('water');
const badgeEl    = document.getElementById('levelBadge');
const scoreEl    = document.getElementById('score');
const bestEl     = document.getElementById('best');
const timeEl     = document.getElementById('time');
const levelTxt   = document.getElementById('levelTxt');
const comboEl    = document.getElementById('combo');
const diffEl     = document.getElementById('difficulty');
const logEl      = document.getElementById('log');
const overlay    = document.getElementById('overlay');
const reservoir  = document.getElementById('reservoir');
const btnOpen    = document.getElementById('btnOpen');
const btnRain    = document.getElementById('btnRain');
const newRecordMsg = document.getElementById('newRecordMsg');
const achUnlocked = document.getElementById('achievementsUnlocked');

// ===== Константы =====
const TICK_MS       = 100;
const TICKS_PER_SEC = 10;
const OK_MIN = 20, OK_MAX = 70;

const BASE_DRAIN      = 7;
const BASE_RAIN       = 6;
const BASE_EVAPORATION = 0.8;
const BASE_INFLOW_CHANCE = 0.35;
const RAIN_COOLDOWN   = 40;
const SCORE_GAIN      = 5;
const SCORE_PENALTY   = 3;

const STORAGE_RECORD = 'aquaplay_wb_record';
const STORAGE_ACH    = 'aquaplay_wb_achievements';
const STORAGE_TOTAL  = 'aquaplay_wb_total_games';

// ===== Достижения =====
const ACHIEVEMENTS = [
  { id: 'first_run',  icon: '🎮', name: 'Первый запуск',      check: (s) => s.totalGames >= 1 },
  { id: 'score_100',  icon: '💯', name: '100 очков',           check: (s) => s.best >= 100 },
  { id: 'score_500',  icon: '🔥', name: '500 очков',           check: (s) => s.best >= 500 },
  { id: 'score_1000', icon: '👑', name: '1000 очков',          check: (s) => s.best >= 1000 },
  { id: 'time_60',    icon: '⏱',  name: 'Продержался минуту',  check: (s) => s.lastTime >= 60 },
  { id: 'combo_5',    icon: '⚡', name: 'Максимальное комбо',   check: (s) => s.maxCombo >= 5 },
  { id: 'level_3',    icon: '📈', name: '3-й уровень сложности', check: (s) => s.difficulty >= 3 },
];

// ===== Состояние =====
const state = {
  level: 50,
  score: 0,
  time: 0,
  tick: 0,
  running: true,
  rainCooldown: 0,
  best: 0,
  totalGames: 0,
  achievements: [],
  combo: 1,
  maxCombo: 1,
  difficulty: 1,
  lastTime: 0,
  newAchThisRun: [],
};

let loopId = null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ===== localStorage =====
function loadStorage() {
  try {
    state.best = parseInt(localStorage.getItem(STORAGE_RECORD), 10) || 0;
    state.totalGames = parseInt(localStorage.getItem(STORAGE_TOTAL), 10) || 0;
    const ach = JSON.parse(localStorage.getItem(STORAGE_ACH) || '[]');
    state.achievements = Array.isArray(ach) ? ach : [];
  } catch (e) {
    state.best = 0;
    state.totalGames = 0;
    state.achievements = [];
  }
}

function saveRecord(v) {
  try { localStorage.setItem(STORAGE_RECORD, String(v)); } catch (e) {}
}
function saveTotal(v) {
  try { localStorage.setItem(STORAGE_TOTAL, String(v)); } catch (e) {}
}
function saveAchievements() {
  try { localStorage.setItem(STORAGE_ACH, JSON.stringify(state.achievements)); } catch (e) {}
}

// ===== Звуки (Web Audio API) =====
let audioCtx = null;
function initAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
}
function playBeep(freq, duration, type = 'sine', vol = 0.15) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}
const sfx = {
  drain: () => { initAudio(); playBeep(280, 0.15, 'sawtooth', 0.1); },
  rain:  () => { initAudio(); playBeep(520, 0.12, 'sine', 0.08); },
  combo: () => { initAudio(); playBeep(880, 0.08, 'square', 0.06); },
  ach:   () => { initAudio(); playBeep(660, 0.1); setTimeout(() => playBeep(880, 0.15), 100); },
  lose:  () => { initAudio(); playBeep(200, 0.4, 'sawtooth', 0.15); },
};

// ===== Лог =====
function log(msg, cls = 'l-info') {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = msg;
  logEl.prepend(d);
  while (logEl.children.length > 25) logEl.lastChild.remove();
}

// ===== Рендер =====
function render() {
  const lvl = clamp(state.level, 0, 100);
  waterEl.style.height = lvl + '%';
  badgeEl.textContent  = Math.round(lvl) + '%';
  levelTxt.textContent = Math.round(lvl) + '%';
  scoreEl.textContent  = state.score;
  bestEl.textContent   = state.best;
  timeEl.textContent   = state.time + 'с';
  diffEl.textContent   = state.difficulty;

  // Комбо
  comboEl.textContent = '×' + state.combo.toFixed(1);
  if (state.combo >= 3) comboEl.classList.add('hot');
  else comboEl.classList.remove('hot');

  // Подсветка резервуара
  if (lvl < OK_MIN || lvl > OK_MAX) {
    reservoir.classList.add('danger');
    reservoir.classList.remove('ok');
  } else {
    reservoir.classList.add('ok');
    reservoir.classList.remove('danger');
  }
}

// ===== Действия =====
btnOpen.addEventListener('click', () => {
  if (!state.running) return;
  state.level -= BASE_DRAIN;
  sfx.drain();
  log(`⬇ Шлюз открыт, сброс −${BASE_DRAIN}%`);
  render();
});

btnRain.addEventListener('click', () => {
  if (!state.running || state.rainCooldown > 0) return;
  state.level += BASE_RAIN;
  state.rainCooldown = RAIN_COOLDOWN;
  sfx.rain();
  log(`🌧 Дождь добавил +${BASE_RAIN}%`);
  render();
});

// ===== Проверка достижений =====
function checkAchievements() {
  const newOnes = [];
  for (const ach of ACHIEVEMENTS) {
    if (state.achievements.includes(ach.id)) continue;
    if (ach.check(state)) {
      state.achievements.push(ach.id);
      newOnes.push(ach);
      state.newAchThisRun.push(ach);
    }
  }
  if (newOnes.length > 0) {
    saveAchievements();
    sfx.ach();
    for (const a of newOnes) {
      log(`${a.icon} Достижение: ${a.name}`, 'l-ach');
    }
  }
}

// ===== Главный цикл =====
function gameTick() {
  if (!state.running) return;
  state.tick++;

  if (state.tick % TICKS_PER_SEC === 0) {
    state.time++;

    // Прогрессия сложности: каждые 30 сек
    const newDifficulty = 1 + Math.floor(state.time / 30);
    if (newDifficulty > state.difficulty) {
      state.difficulty = newDifficulty;
      log(`📈 Сложность: ${state.difficulty}`, 'l-info');
    }

    const dFactor = 1 + (state.difficulty - 1) * 0.15;

    // Приток
    if (Math.random() < BASE_INFLOW_CHANCE * dFactor) {
      const inflow = +((1 + Math.random() * 3) * dFactor).toFixed(1);
      state.level += inflow;
      if (Math.random() < 0.25) log(`💧 Приток +${inflow}%`);
    }

    // Испарение
    state.level -= BASE_EVAPORATION * dFactor;

    // Очки и комбо
    const inNorm = state.level >= OK_MIN && state.level <= OK_MAX;
    if (inNorm) {
      state.score += Math.round(SCORE_GAIN * state.combo);
      state.combo = Math.min(5, state.combo + 0.1);
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      if (Math.floor(state.combo * 10) % 10 === 0 && state.combo >= 2 && state.combo < 5) sfx.combo();
    } else {
      state.score = Math.max(0, state.score - SCORE_PENALTY);
      state.combo = Math.max(1, state.combo - 0.2);
    }

    // Проигрыш
    if (state.level <= 0)   return gameOver('Резервуар пересох! 💧', 'Вода ушла ниже критического уровня.');
    if (state.level >= 100) return gameOver('Переполнение! 🌊', 'Плотину прорвало — уровень 100%.');

    // Перезарядка дождя
    if (state.rainCooldown > 0) {
      state.rainCooldown--;
      const secs = Math.ceil(state.rainCooldown / TICKS_PER_SEC);
      btnRain.textContent = `🌧 Перезарядка ${secs}с`;
      btnRain.disabled = true;
    } else {
      btnRain.textContent = '🌧 Вызвать дождь';
      btnRain.disabled = false;
    }

    checkAchievements();
  }

  state.level = clamp(state.level, 0, 100);
  render();
}

// ===== Конец игры =====
function gameOver(title, text) {
  state.running = false;
  clearInterval(loopId);
  sfx.lose();

  state.lastTime = state.time;
  state.totalGames++;
  saveTotal(state.totalGames);

  // Финальная проверка достижений
  checkAchievements();

  // Новый рекорд
  const isNewRecord = state.score > state.best;
  if (isNewRecord) {
    state.best = state.score;
    saveRecord(state.best);
    newRecordMsg.style.display = 'block';
    log(`🏆 Новый рекорд: ${state.best}!`, 'l-good');
  } else {
    newRecordMsg.style.display = 'none';
  }

  // Достижения за эту сессию
  if (state.newAchThisRun.length > 0) {
    achUnlocked.style.display = 'flex';
    achUnlocked.innerHTML = state.newAchThisRun
      .map(a => `<span class="ach-badge">${a.icon} ${a.name}</span>`)
      .join('');
  } else {
    achUnlocked.style.display = 'none';
  }

  document.getElementById('endTitle').textContent = title;
  document.getElementById('endText').textContent =
    `${text}\n\nОчки: ${state.score}  ·  Время: ${state.time} сек\n` +
    `Рекорд: ${state.best}  ·  Сложность: ${state.difficulty}\n` +
    `Макс. комбо: ×${state.maxCombo.toFixed(1)}`;

  overlay.classList.add('show');
  log('💀 ' + title, 'l-bad');
  render();
}

// ===== Перезапуск =====
function restart() {
  state.level = 50;
  state.score = 0;
  state.time = 0;
  state.tick = 0;
  state.running = true;
  state.rainCooldown = 0;
  state.combo = 1;
  state.difficulty = 1;
  state.maxCombo = 1;
  state.newAchThisRun = [];

  btnRain.textContent = '🌧 Вызвать дождь';
  btnRain.disabled = false;
  overlay.classList.remove('show');
  newRecordMsg.style.display = 'none';
  achUnlocked.style.display = 'none';
  logEl.innerHTML = '';

  log('🌊 Новая сессия. Уровень: 50%', 'l-good');
  log('Держи зону 20–70%, копи комбо!', 'l-info');
  if (state.best > 0) log(`🏆 Твой рекорд: ${state.best}`, 'l-good');

  render();
  clearInterval(loopId);
  loopId = setInterval(gameTick, TICK_MS);
}

window.restart = restart;

// ===== Старт =====
loadStorage();

// Первый запуск — показать помощь
if (state.totalGames === 0) {
  setTimeout(() => document.getElementById('helpOverlay').classList.add('show'), 300);
}

log('🌊 Добро пожаловать в «Водный Баланс»!', 'l-good');
if (state.best > 0) log(`🏆 Твой рекорд: ${state.best}`, 'l-good');
restart();
