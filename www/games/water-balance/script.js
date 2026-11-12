const waterEl  = document.getElementById('water');
const badgeEl  = document.getElementById('levelBadge');
const scoreEl  = document.getElementById('score');
const timeEl   = document.getElementById('time');
const levelTxt = document.getElementById('levelTxt');
const logEl    = document.getElementById('log');
const overlay  = document.getElementById('overlay');
const btnOpen  = document.getElementById('btnOpen');
const btnRain  = document.getElementById('btnRain');

const TICK_MS = 100;
const TICKS_PER_SEC = 10;
const OK_MIN = 20, OK_MAX = 70;
const DRAIN_AMOUNT = 7;
const RAIN_AMOUNT = 6;
const RAIN_COOLDOWN = 40;
const EVAPORATION = 0.8;
const INFLOW_CHANCE = 0.35;
const SCORE_GAIN = 5, SCORE_PENALTY = 3;

const state = {
  level: 50, score: 0, time: 0, tick: 0,
  running: true, rainCooldown: 0,
};

let loopId = null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function log(msg, cls = 'l-info') {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = msg;
  logEl.prepend(d);
  while (logEl.children.length > 25) logEl.lastChild.remove();
}

function render() {
  const lvl = clamp(state.level, 0, 100);
  waterEl.style.height = lvl + '%';
  badgeEl.textContent  = Math.round(lvl) + '%';
  levelTxt.textContent = Math.round(lvl) + '%';
  scoreEl.textContent  = state.score;
  timeEl.textContent   = state.time + 'с';
}

btnOpen.addEventListener('click', () => {
  if (!state.running) return;
  state.level -= DRAIN_AMOUNT;
  log(`⬇ Шлюз открыт, сброс −${DRAIN_AMOUNT}%`);
  render();
});

btnRain.addEventListener('click', () => {
  if (!state.running || state.rainCooldown > 0) return;
  state.level += RAIN_AMOUNT;
  state.rainCooldown = RAIN_COOLDOWN;
  log(`🌧 Дождь добавил +${RAIN_AMOUNT}%`);
  render();
});

function gameTick() {
  if (!state.running) return;
  state.tick++;

  if (state.tick % TICKS_PER_SEC === 0) {
    state.time++;

    if (Math.random() < INFLOW_CHANCE) {
      const inflow = +(1 + Math.random() * 3).toFixed(1);
      state.level += inflow;
      if (Math.random() < 0.3) log(`💧 Приток +${inflow}%`);
    }

    state.level -= EVAPORATION;

    if (state.level >= OK_MIN && state.level <= OK_MAX) {
      state.score += SCORE_GAIN;
    } else {
      state.score = Math.max(0, state.score - SCORE_PENALTY);
    }

    if (state.level <= 0)   return gameOver('Резервуар пересох! 💧', 'Вода ушла ниже критического уровня.');
    if (state.level >= 100) return gameOver('Переполнение! 🌊', 'Плотину прорвало — уровень 100%.');

    if (state.rainCooldown > 0) {
      state.rainCooldown--;
      const secs = Math.ceil(state.rainCooldown / TICKS_PER_SEC);
      btnRain.textContent = `🌧 Перезарядка ${secs}с`;
      btnRain.disabled = true;
    } else {
      btnRain.textContent = '🌧 Вызвать дождь';
      btnRain.disabled = false;
    }
  }

  state.level = clamp(state.level, 0, 100);
  render();
}

function gameOver(title, text) {
  state.running = false;
  clearInterval(loopId);
  document.getElementById('endTitle').textContent = title;
  document.getElementById('endText').textContent =
    `${text}\n\nОчки: ${state.score}  ·  Время: ${state.time} сек`;
  overlay.classList.add('show');
  log('💀 ' + title, 'l-bad');
}

function restart() {
  state.level = 50;
  state.score = 0;
  state.time = 0;
  state.tick = 0;
  state.running = true;
  state.rainCooldown = 0;
  btnRain.textContent = '🌧 Вызвать дождь';
  btnRain.disabled = false;
  overlay.classList.remove('show');
  logEl.innerHTML = '';
  log('🌊 Новая сессия. Уровень: 50%', 'l-good');
  render();
  clearInterval(loopId);
  loopId = setInterval(gameTick, TICK_MS);
}

window.restart = restart;

log('🌊 Добро пожаловать в «Водный Баланс»!', 'l-good');
log('Держи уровень в зоне 20–70%', 'l-info');
restart();
