// ================== НАСТРОЙКИ ==================

// 1) ССЫЛКА НА ВАШ TELEGRAM-КАНАЛ ДЛЯ ЗАДАНИЯ ПОДПИСКИ:
const CHANNEL_URL = 'https://t.me/YMCclub'; // <--- ЗАМЕНИТЕ

// 2) БАЗА ДЛЯ РЕФ-ССЫЛКИ ПРИГЛАШЕНИЙ (deep-link вашего бота)
const INVITE_BASE = 'https://t.me/ymctapbot'; // <--- ЗАМЕНИТЕ

// ===== Новые константы для "добычи" =====

// Сколько монет хотим дать при непрерывном фарме за 24 часа
const COINS_PER_DAY   = 0.05;
const HOURS_PER_DAY   = 24;
const COINS_PER_HOUR  = COINS_PER_DAY / HOURS_PER_DAY;        // ≈ 0.0020833 в час
const MS_IN_DAY       = HOURS_PER_DAY * 60 * 60 * 1000;
const COINS_PER_MS    = COINS_PER_DAY / MS_IN_DAY;            // ≈ 0.0000005787 в миллисекунду

// Визуальные настройки анимации притока
const GATHER_DURATION_MS    = 10 * 60 * 1000; // 10 минут
const INFLOW_INTERVAL_MS    = 450;            // каждые 450 мс летят мини-монетки
const INFLOW_MINI_PER_TICK  = 3;              // в среднем 3 мини-монеты за тик (2–4)

// Технический инкремент: так подбираем, чтобы
// при непрерывной добыче за сутки набегало COINS_PER_DAY
const GATHER_INCREMENT = (COINS_PER_MS * INFLOW_INTERVAL_MS) / INFLOW_MINI_PER_TICK;

// ================== ДАННЫЕ ==================
let playerPoints = parseFloat(localStorage.getItem('playerPoints')) || 0;
let tapHealth    = parseInt(localStorage.getItem('tapHealth'))    || 5000;
let lastTapTime  = localStorage.getItem('lastTapTime') ? new Date(localStorage.getItem('lastTapTime')) : new Date(0);

// ID игрока (7 цифр)
let playerId = localStorage.getItem('playerId');
if (!playerId || !/^\d{7}$/.test(playerId)) {
  playerId = generateUniqueId();
  localStorage.setItem('playerId', playerId);
}

// Приглашённые друзья
let invitedFriends = JSON.parse(localStorage.getItem('invitedFriends')) || [];

// Статусы миссий
let mission_subscribe_claimed = localStorage.getItem('mission_subscribe_claimed') === 'true';
let mission_invite1_claimed   = localStorage.getItem('mission_invite1_claimed')   === 'true';
let mission_invite10_claimed  = localStorage.getItem('mission_invite10_claimed')  === 'true';

// Состояние "добычи"
let isGathering = false;
let inflowIntervalId = null;
let gatherTimeoutId  = null;
let gatherEndAt = parseInt(localStorage.getItem('gatherEndAt')) || 0;

// ===== Впрыск нужных стилей (чтобы не править style.css) =====
(function injectStyles(){
  const css = `
  .coin-pulse { animation: coinPulse 1.2s ease-in-out infinite; }
  @keyframes coinPulse {
    0%{transform:scale(1)}25%{transform:scale(.96)}50%{transform:scale(1.03)}
    75%{transform:scale(.97)}100%{transform:scale(1)}
  }
  .mini-coin-in{
    position:absolute;width:18px;height:18px;border-radius:50%;
    background-image:url('foto/efe.jpg');background-size:cover;background-position:center;
    left:var(--sx);top:var(--sy);transform:translate(-50%,-50%) scale(.9);opacity:0;
    filter:drop-shadow(0 6px 8px rgba(0,0,0,.45));
    animation:flyIn var(--dur,1.1s) ease-in forwards;pointer-events:none;
  }
  @keyframes flyIn{
    0%{opacity:0;transform:translate(-50%,-50%) scale(.9) rotate(0)}
    20%{opacity:1}
    80%{opacity:1}
    100%{
      opacity:0;left:50%;top:50%;
      transform:translate(-50%,-50%) scale(.6) rotate(360deg)
    }
  }`;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();

// ===== Утилиты =====
function generateUniqueId(){
  return Math.floor(1000000 + Math.random() * 9000000).toString();
}
function saveInvitedFriends(){
  localStorage.setItem('invitedFriends', JSON.stringify(invitedFriends));
}
function setText(id, text){
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}
function formatPoints(v){
  // до 6 знаков, без лишних нулей справа
  return Number(Number(v).toFixed(6)).toString();
}
function setScoreUI(){
  setText('score-value', formatPoints(playerPoints));
}
function addPoints(points){
  playerPoints = (playerPoints + points);
  localStorage.setItem('playerPoints', playerPoints);
  setScoreUI();
}
function randBetween(a,b){ return a + Math.random()*(b-a); }

// ===== HP / Tap (HP оставлен, но не лимитирует добычу) =====
function restoreHealth(){
  const currentTime = new Date();
  const timeDiff = Math.floor((currentTime - lastTapTime) / 1000);
  if (timeDiff > 0){
    const healthToRestore = timeDiff;
    tapHealth = Math.min(tapHealth + healthToRestore, 5000);
    localStorage.setItem('tapHealth', tapHealth);
    updateHp();
  }
}
function updateHp(){
  setText('tap-health', isGathering
    ? 'Mining…'
    : 'MINE 10 min');
}

// ===== Новая логика тапов / добычи =====
function tapCoin(){
  if (!isGathering){
    startGathering();
  }
  // во время добычи повторные тапы не требуются
}

function startGathering(){
  if (isGathering) return;
  isGathering = true;

  const coin = document.getElementById('coin');
  coin.classList.add('coin-pulse');

  const endAt = Date.now() + GATHER_DURATION_MS;
  gatherEndAt = endAt;
  localStorage.setItem('gatherEndAt', String(endAt));

  // приток монеток
  inflowIntervalId = setInterval(spawnCoinInflow, INFLOW_INTERVAL_MS);

  // автостоп
  gatherTimeoutId = setTimeout(stopGathering, GATHER_DURATION_MS);

  updateHp();
}

function stopGathering(){
  if (!isGathering) return;
  isGathering = false;

  const coin = document.getElementById('coin');
  coin.classList.remove('coin-pulse');

  if (inflowIntervalId){ clearInterval(inflowIntervalId); inflowIntervalId = null; }
  if (gatherTimeoutId){ clearTimeout(gatherTimeoutId); gatherTimeoutId = null; }

  gatherEndAt = 0;
  localStorage.removeItem('gatherEndAt');

  updateHp();
}

// Генерируем монетки по краям контейнера и тянем их в центр
function spawnCoinInflow(){
  const container = document.getElementById('battle-area');
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const base = INFLOW_MINI_PER_TICK;
  const count = Math.max(1, base + Math.floor((Math.random()*3)-1)); // 2–4 шт

  for (let i = 0; i < count; i++){
    const p = document.createElement('div');
    p.className = 'mini-coin-in';

    // случайная сторона периметра
    const side = Math.floor(Math.random()*4); // 0=top,1=right,2=bottom,3=left
    let sx, sy;
    if (side === 0){ sx = randBetween(0, rect.width); sy = -10; }
    else if (side === 1){ sx = rect.width + 10; sy = randBetween(0, rect.height); }
    else if (side === 2){ sx = randBetween(0, rect.width); sy = rect.height + 10; }
    else { sx = -10; sy = randBetween(0, rect.height); }

    const sxPct = (sx / rect.width) * 100;
    const syPct = (sy / rect.height) * 100;

    const dur = randBetween(0.9, 1.4);
    p.style.setProperty('--sx', sxPct + '%');
    p.style.setProperty('--sy', syPct + '%');
    p.style.setProperty('--dur', dur + 's');

    container.appendChild(p);

    // когда "впиталась" — начисляем и удаляем
    setTimeout(() => {
      addPoints(GATHER_INCREMENT);
      p.remove();
    }, dur * 1000);
  }
}

// ===== СТАРЫЙ ЭФФЕКТ (разлёт) — оставлен на всякий, не используется
function showPlusOne(){ /* отключено */ }
function spawnCoinBurst(){
  const container = document.getElementById('battle-area');
  const count = 12 + Math.floor(Math.random()*6);
  for (let i = 0; i < count; i++){
    const p = document.createElement('div');
    p.className = 'mini-coin';
    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 60;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const dur = 0.6 + Math.random() * 0.5;
    const rot = (Math.random() * 360 - 180) + 'deg';
    p.style.setProperty('--dx', dx + 'px');
    p.style.setProperty('--dy', dy + 'px');
    p.style.setProperty('--dur', dur + 's');
    p.style.setProperty('--rot', rot);
    container.appendChild(p);
    setTimeout(() => p.remove(), (dur * 1000) + 120);
  }
}

// ===== Навигация =====
function openTab(tab){
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  const active = document.querySelector(`#screen-${tab}`);
  if (active) active.classList.add('active');

  document.querySelectorAll('.menu .tab').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`tab-${tab}`);
  if (btn) btn.classList.add('active');
}

// ===== Telegram username =====
function initTelegramUsername(){
  let username = '';
  try{
    const tg = window.Telegram && window.Telegram.WebApp;
    const tgUser = tg?.initDataUnsafe?.user;
    if (tgUser?.username) {
      username = tgUser.username;
    } else {
      const p = new URLSearchParams(location.search);
      const q = p.get('tg_username');
      if (q) username = q.replace(/^@/, '');
    }
  }catch(e){}
  document.getElementById('tg-username').innerText = 'PRO' + username;
}

// ===== Missions =====
function subscribeToChannel(e){
  const link = CHANNEL_URL && CHANNEL_URL !== 'https://t.me/ВАШ_КАНАЛ_ЗДЕСЬ' ? CHANNEL_URL : '#';
  if (link === '#'){
    alert('Добавьте ссылку на канал в script.js (CHANNEL_URL)');
    e?.preventDefault?.();
    return;
  }
  localStorage.setItem('mission_subscribe_clicked', 'true');
}
function claimSubscribeMission(){
  if (mission_subscribe_claimed){ setText('mission-subscribe-status', 'Награда уже получена.'); return; }
  const visited = localStorage.getItem('mission_subscribe_clicked') === 'true';
  if (!visited){ setText('mission-subscribe-status', 'Сначала перейдите по ссылке и подпишитесь на канал.'); return; }
  addPoints(0.2);
  mission_subscribe_claimed = true;
  localStorage.setItem('mission_subscribe_claimed', 'true');
  setText('mission-subscribe-status', 'Награда за подписку получена (+0.2).');
  updateMissionButtons();
}
function claimInvite1Mission(){
  if (mission_invite1_claimed){ setText('mission-invite1-status', 'Награда уже получена.'); return; }
  if (invitedFriends.length >= 1){
    addPoints(0.01);
    mission_invite1_claimed = true;
    localStorage.setItem('mission_invite1_claimed', 'true');
    setText('mission-invite1-status', 'Награда за 1 друга получена (+0.01).');
    updateMissionButtons();
  } else {
    setText('mission-invite1-status', 'Пригласите хотя бы 1 друга.');
  }
}
function claimInvite10Mission(){
  if (mission_invite10_claimed){ setText('mission-invite10-status', 'Награда уже получена.'); return; }
  if (invitedFriends.length >= 10){
    addPoints(0.5);
    mission_invite10_claimed = true;
    localStorage.setItem('mission_invite10_claimed', 'true');
    setText('mission-invite10-status', 'Награда за 10 друзей получена (+0.5).');
    updateMissionButtons();
  } else {
    setText('mission-invite10-status', `Нужно пригласить ещё ${Math.max(0, 10 - invitedFriends.length)} друзей.`);
  }
}
function updateMissionButtons(){
  setText('mission-invite1-progress', `Прогресс: ${Math.min(invitedFriends.length,1)}/1`);
  setText('mission-invite10-progress', `Прогресс: ${Math.min(invitedFriends.length,10)}/10`);
  document.getElementById('claim-subscribe').disabled = mission_subscribe_claimed;
  document.getElementById('claim-invite1').disabled = mission_invite1_claimed || invitedFriends.length < 1;
  document.getElementById('claim-invite10').disabled = mission_invite10_claimed || invitedFriends.length < 10;
}

// ===== Друзья =====
function copyInviteLink(){
  const link = buildInviteLink();
  navigator.clipboard.writeText(link).then(()=>{
    setText('invite-copy-status', 'Реферальная ссылка скопирована!');
  }).catch(()=>{
    setText('invite-copy-status', 'Не удалось скопировать. Скопируйте вручную: ' + link);
  });
}
function buildInviteLink(){
  const url = new URL(INVITE_BASE);
  url.searchParams.set('ref', playerId);
  return url.toString();
}
function addInvitedFriend(){
  const idInput = document.getElementById('friend-id-input');
  const id = (idInput.value || '').trim();
  if (!/^\d{7}$/.test(id)){ setText('check-status', 'Введите корректный ID из 7 цифр.'); return; }
  if (id === playerId){ setText('check-status', 'Нельзя пригласить самого себя.'); return; }
  if (invitedFriends.some(f => f.id === id)){ setText('check-status', 'Этот ID уже был добавлен ранее.'); return; }

  invitedFriends.push({ id });
  saveInvitedFriends();
  renderInvitedList();
  updateFriendsCounter();
  updateMissionButtons();

  addPoints(5000);
  idInput.value = '';
  setText('check-status', 'Приглашение засчитано! (+5 000)');
}
function renderInvitedList(){
  const ul = document.getElementById('invited-list');
  ul.innerHTML = '';
  invitedFriends.forEach(({id, nick}) => {
    const li = document.createElement('li');
    const left = document.createElement('div');
    const right = document.createElement('div');
    left.textContent = `ID: ${id}`;
    right.textContent = nick ? nick : '';
    li.appendChild(left);
    li.appendChild(right);
    ul.appendChild(li);
  });
}
function updateFriendsCounter(){
  setText('friends-counter', `Приглашено друзей: ${invitedFriends.length}`);
}

// ===== Старт =====
window.onload = function(){
  setScoreUI();
  updateHp();
  initTelegramUsername();
  setText('player-id', `ID: ${playerId}`);

  const channelA = document.getElementById('channel-link');
  if (CHANNEL_URL && CHANNEL_URL !== 'https://t.me/ВАШ_КАНАЛ_ЗДЕСЬ'){ channelA.href = CHANNEL_URL; }

  renderInvitedList();
  updateFriendsCounter();
  updateMissionButtons();

  restoreHealth();
  setInterval(restoreHealth, 1000);

  // Возобновление добычи после перезагрузки
  if (gatherEndAt && Date.now() < gatherEndAt){
    const left = gatherEndAt - Date.now();
    startGathering();
    if (gatherTimeoutId){ clearTimeout(gatherTimeoutId); }
    gatherTimeoutId = setTimeout(stopGathering, left);
  } else {
    stopGathering();
  }
};