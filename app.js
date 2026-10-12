const STORAGE_KEY = 'sprout-learning-v2';
const CONTENT_SCHEMA_VERSION = 3;
const todayKey = () => new Date().toISOString().slice(0, 10);
const defaultState = { schemaVersion: CONTENT_SCHEMA_VERSION, stars: 0, sound: true, streak: 0, lastStudy: '', studyDates: [], totalMinutes: 0, sessions: 0, mastery: {}, gameProgress: {}, patternThemeCursor: 0, logicSceneCursor: 0, entryStages: { english: 0, chinese: 0, logic: 0 }, viewStages: { english: 0, chinese: 0, logic: 0 }, activeSubject: 'english' };
let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { saved = {}; }
const needsContentMigration = (saved.schemaVersion || 0) < CONTENT_SCHEMA_VERSION;
if (needsContentMigration) {
  saved.mastery = Object.fromEntries(Object.entries(saved.mastery || {}).filter(([key]) => !key.startsWith('logic-')));
  saved.gameProgress = Object.fromEntries(Object.entries(saved.gameProgress || {}).filter(([key]) => !key.startsWith('logic-')));
  saved.schemaVersion = CONTENT_SCHEMA_VERSION;
}
const state = { ...defaultState, ...saved, mastery: saved.mastery || {}, gameProgress: saved.gameProgress || {}, entryStages: { ...defaultState.entryStages, ...(saved.entryStages || {}) }, viewStages: { ...defaultState.viewStages, ...(saved.viewStages || saved.entryStages || {}) } };
let lesson = null;
let activeGameSubject = 'english';
let gameSession = null;
let voiceRecording = null;
const SUBJECT_WORLDS = { english: 'english-world', chinese: 'chinese-world', logic: 'logic-world' };

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const shuffle = list => [...list].sort(() => Math.random() - 0.5);
const allSubjectItems = subject => CURRICULUM[subject].units.flatMap((unit, unitIndex) => unit.items.map(item => ({ ...item, subject, unitIndex, unit })));
const allItems = () => Object.keys(CURRICULUM).flatMap(allSubjectItems);

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
if (needsContentMigration) saveState();
function getStats(id) { return state.mastery[id] || { score: 0, attempts: 0, correct: 0, streak: 0, due: 0, last: '' }; }
function masteryLabel(score) { return ['未学习', '初识', '练习中', '较熟悉', '已掌握'][score] || '未学习'; }
function showToast(text) { const toast = $('#toast'); toast.textContent = text; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 1600); }
function celebrate(anchor, symbols = ['⭐','✨','⭐','🌟','✨','⭐']) {
  if (!anchor || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const rect = anchor.getBoundingClientRect(); const burst = document.createElement('div'); burst.className = 'celebration-burst'; burst.setAttribute('aria-hidden','true');
  burst.style.left = `${rect.left + rect.width / 2}px`; burst.style.top = `${rect.top + rect.height / 2}px`;
  burst.innerHTML = symbols.map((symbol,index) => { const angle = Math.PI * 2 * index / symbols.length - Math.PI / 2; const distance = 52 + index % 3 * 14; return `<span style="--burst-x:${Math.round(Math.cos(angle) * distance)}px;--burst-y:${Math.round(Math.sin(angle) * distance)}px;--burst-delay:${index * 28}ms">${symbol}</span>`; }).join('');
  document.body.appendChild(burst); setTimeout(() => burst.remove(),1000);
}
const speechPlayback = { token:0, timer:null, voices:[] };
function refreshSpeechVoices() { if ('speechSynthesis' in window) speechPlayback.voices = speechSynthesis.getVoices(); }
function speechVoiceScore(voice, lang) {
  const locale = (voice.lang || '').toLowerCase(); const target = lang.toLowerCase(); const base = target.split('-')[0]; const name = voice.name || '';
  if (!locale.startsWith(base)) return -1000;
  let score = locale === target ? 100 : 55;
  if (/natural|neural|online|premium|google|samantha|ava|aria|jenny|xiaoxiao|xiaoyi|ting-ting|meijia|sin-ji/i.test(name)) score += 35;
  if (/compact|espeak/i.test(name)) score -= 25;
  return score;
}
function preferredSpeechVoice(lang, voices = speechPlayback.voices) { return voices.filter(voice => speechVoiceScore(voice,lang) > -1000).sort((a,b) => speechVoiceScore(b,lang) - speechVoiceScore(a,lang))[0] || null; }
function speechChunks(text) {
  const clean = String(text || '').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
  return clean.match(/[^.!?。！？]+[.!?。！？]?/g)?.map(part => part.trim()).filter(Boolean) || [];
}
function stopSpeech() {
  speechPlayback.token += 1; clearTimeout(speechPlayback.timer);
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
function speak(text, lang = 'zh-CN') {
  if (!state.sound || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
  const chunks = speechChunks(text); if (!chunks.length) return;
  stopSpeech(); refreshSpeechVoices(); const token = speechPlayback.token; const english = lang.toLowerCase().startsWith('en');
  const play = index => {
    if (token !== speechPlayback.token || index >= chunks.length) return;
    const utterance = new SpeechSynthesisUtterance(chunks[index]); const voice = preferredSpeechVoice(lang);
    utterance.lang = voice?.lang || lang; utterance.voice = voice; utterance.rate = english ? 0.84 : 0.92; utterance.pitch = 1; utterance.volume = 1;
    utterance.onend = () => { speechPlayback.timer = setTimeout(() => play(index + 1), english ? 120 : 80); };
    utterance.onerror = event => { if (event.error !== 'canceled' && token === speechPlayback.token) speechPlayback.timer = setTimeout(() => play(index + 1), 80); };
    speechSynthesis.speak(utterance);
  };
  speechPlayback.timer = setTimeout(() => play(0), 70);
}
refreshSpeechVoices();
if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', refreshSpeechVoices);

function leaveLogicLandscape() {
  document.body.classList.remove('logic-lesson-active','english-lesson-active');
  try { screen.orientation?.unlock?.(); } catch (_) {}
  if (document.fullscreenElement === document.documentElement) { const exiting = document.exitFullscreen?.(); exiting?.catch?.(() => {}); }
}

function navigate(view) {
  stopSpeech();
  cancelVoiceRecording();
  if (view !== 'lesson') leaveLogicLandscape();
  $$('.view').forEach(node => node.classList.toggle('active', node.dataset.view === view));
  $$('.bottom-nav [data-nav]').forEach(button => button.classList.toggle('active', button.dataset.nav === view || (['chinese-world','english-world','logic-world'].includes(view) && button.dataset.nav === 'curriculum')));
  $('.bottom-nav').style.display = view === 'lesson' ? 'none' : 'grid';
  if (view === 'curriculum') renderCurriculum();
  if (view === 'english-world') renderEnglishWorld();
  if (view === 'chinese-world') renderChineseWorld();
  if (view === 'logic-world') renderLogicWorld();
  if (view === 'report') renderReport();
  if (view === 'games') renderGameHub();
  if (view === 'home') renderHome();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const STAGE_STARTS = { english: [0,10,20,30], chinese: [0,10,20,30,40], logic: [0,12,24] };

function stageStartFor(subject, unitIndex) {
  return [...STAGE_STARTS[subject]].reverse().find(start => unitIndex >= start) || 0;
}

function stageBounds(subject, stageStart = stageStartFor(subject, currentUnitIndex(subject))) {
  const starts = STAGE_STARTS[subject]; const position = Math.max(0, starts.indexOf(stageStart));
  return [starts[position], starts[position + 1] ?? CURRICULUM[subject].units.length];
}

function subjectProgress(subject) {
  const items = allSubjectItems(subject);
  const points = items.reduce((sum, item) => sum + getStats(item.id).score, 0);
  return items.length ? Math.round(points / (items.length * 4) * 100) : 0;
}

function stageProgress(subject, stageStart = stageStartFor(subject, currentUnitIndex(subject))) {
  const [start,end] = stageBounds(subject,stageStart);
  const items = allSubjectItems(subject).filter(item => item.unitIndex >= start && item.unitIndex < end);
  const points = items.reduce((sum,item) => sum + getStats(item.id).score,0);
  return items.length ? Math.round(points / (items.length * 4) * 100) : 0;
}

function unitProgress(subject, unitIndex) {
  const unit = CURRICULUM[subject].units[unitIndex];
  return Math.round(unit.items.reduce((sum, item) => sum + getStats(item.id).score, 0) / (unit.items.length * 4) * 100);
}

function unitUnlocked(subject, unitIndex) {
  const entry = Math.min(state.entryStages[subject] || 0, CURRICULUM[subject].units.length - 1);
  return unitIndex <= entry || unitProgress(subject, unitIndex - 1) >= 70;
}

function currentUnitIndex(subject) {
  const units = CURRICULUM[subject].units;
  const entry = Math.min(state.entryStages[subject] || 0, units.length - 1);
  for (let i = entry; i < units.length; i += 1) if (unitProgress(subject, i) < 80 && unitUnlocked(subject, i)) return i;
  return units.length - 1;
}

function buildDailyEntries() {
  const today = Date.now();
  const learned = allItems().filter(item => getStats(item.id).score > 0);
  const due = learned.filter(item => getStats(item.id).due <= today || getStats(item.id).score < 3)
    .sort((a, b) => getStats(a.id).due - getStats(b.id).due || getStats(a.id).score - getStats(b.id).score)
    .slice(0, 3).map(item => ({ ...item, isNew: false }));
  const fresh = [];
  ['english', 'chinese', 'logic'].forEach(subject => {
    const unitIndex = currentUnitIndex(subject);
    const candidate = allSubjectItems(subject).find(item => item.unitIndex === unitIndex && getStats(item.id).score === 0);
    if (candidate) fresh.push({ ...candidate, isNew: true });
  });
  if (!fresh.length) {
    shuffle(allItems().filter(item => getStats(item.id).score >= 3)).slice(0, 3).forEach(item => due.push({ ...item, isNew: false }));
  }
  return [...due, ...fresh].slice(0, 6);
}

function renderHome() {
  const hour = new Date().getHours();
  $('#greeting').textContent = `${hour < 11 ? '早上好' : hour < 18 ? '下午好' : '晚上好'}，小小探索家`;
  $('#starCount').textContent = state.stars;
  $('#streakCount').textContent = state.streak || 0;
  const plan = buildDailyEntries();
  const reviews = plan.filter(item => !item.isNew).length;
  const fresh = plan.filter(item => item.isNew).length;
  $('#reviewCount').textContent = reviews ? `复习 ${reviews} 个知识` : '用小游戏热身';
  $('#newCount').textContent = fresh ? `学习 ${fresh} 个知识` : '巩固已学内容';
  $('#dailyTaskCount').textContent = `${plan.length || 3} 个核心知识`;
  const studiedToday = state.studyDates.includes(todayKey());
  $('#todayStatus').textContent = studiedToday ? '今天已完成，可继续巩固' : '等待开始';
  $('#startDaily').querySelector('span').textContent = studiedToday ? '继续巩固学习' : '开始今日学习';
  $('#subjectCards').innerHTML = Object.entries(CURRICULUM).map(([key, subject]) => {
    const unitIndex = currentUnitIndex(key); const progress = subjectProgress(key); const currentStageProgress = stageProgress(key); const unit = subject.units[unitIndex];
    return `<button class="subject-card" data-subject-card="${key}" style="--subject-color:${subject.color}"><span class="subject-card-head"><span class="subject-icon">${subject.icon}</span><span class="level-badge">第 ${unitIndex + 1} / ${subject.units.length} 单元</span></span><h3>${subject.name}</h3><p>${subject.description}</p><div class="mastery-row"><span class="mini-track"><i style="--value:${currentStageProgress}%"></i></span><span>本阶段 ${currentStageProgress}%</span></div><p class="course-total-progress">全课程累计 ${progress}%</p><p><b>正在学习：</b>${unit.title}</p></button>`;
  }).join('');
  renderWeek();
}

function renderWeek() {
  const names = ['日', '一', '二', '三', '四', '五', '六'];
  const now = new Date(); const day = now.getDay(); const mondayOffset = day === 0 ? -6 : 1 - day;
  let count = 0; let html = '';
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(now); date.setDate(now.getDate() + mondayOffset + i);
    const key = date.toISOString().slice(0, 10); const done = state.studyDates.includes(key); if (done) count += 1;
    html += `<span class="day-dot ${done ? 'done' : ''} ${key === todayKey() ? 'today' : ''}"><i>${done ? '✓' : date.getDate()}</i><small>周${names[date.getDay()]}</small></span>`;
  }
  $('#weekDays').textContent = count; $('#weekCalendar').innerHTML = html;
}

function renderCurriculum() {
  const learned = allItems().filter(item => getStats(item.id).score > 0).length;
  const mastered = allItems().filter(item => getStats(item.id).score >= 4).length;
  $('#curriculumSummary').innerHTML = `<div class="summary-card"><b>${allItems().length}</b><span>系统知识点</span></div><div class="summary-card"><b>${learned}</b><span>已经接触</span></div><div class="summary-card"><b>${mastered}</b><span>已经掌握</span></div>`;
  $('#subjectTabs').innerHTML = Object.entries(CURRICULUM).map(([key, subject]) => `<button class="${key === state.activeSubject ? 'active' : ''}" data-open-world="${key}">${subject.icon} ${subject.short}</button>`).join('');
  $('#unitList').className = 'unit-list course-portal-list';
  $('#unitList').innerHTML = Object.entries(CURRICULUM).map(([key, subject]) => {
    const progress = subjectProgress(key);
    const unitIndex = currentUnitIndex(key);
    const currentStageProgress = stageProgress(key);
    const unit = subject.units[unitIndex];
    const itemCount = allSubjectItems(key).length;
    const buttonText = progress ? '继续探索' : '进入世界';
    return `<article class="course-portal ${key} ${key === state.activeSubject ? 'active' : ''}" style="--portal-color:${subject.color}"><div class="portal-toy" aria-hidden="true"><span>${subject.icon}</span><small>${subject.units.length} 个单元</small></div><div class="portal-copy"><span class="portal-kicker">${key === 'english' ? '听说启蒙' : key === 'chinese' ? '高频识字' : '数学思维'}</span><h2>${subject.name}</h2><p>${subject.description}</p><div class="portal-current"><b>正在学习</b><span>第 ${unitIndex + 1} 单元 · ${unit.title}</span></div><div class="portal-progress"><span class="mini-track"><i style="--value:${currentStageProgress}%"></i></span><strong>本阶段 ${currentStageProgress}%</strong></div><small class="portal-total">全课程 ${progress}% · 共 ${itemCount} 个知识点</small></div><button class="portal-enter" data-open-world="${key}">${buttonText}<span aria-hidden="true">→</span></button></article>`;
  }).join('');
}

function renderChineseWorld() {
  const subject = CURRICULUM.chinese;
  const stages = {
    0:['第一阶段 · 形象启蒙','1–100 字','从图画、身体、数字和家庭开始'],
    10:['第二阶段 · 生活核心','101–200 字','理解动作、校园、食物和生活环境'],
    20:['第三阶段 · 句子表达','201–300 字','积累代词、动词、量词和简单句用字'],
    30:['第四阶段 · 阅读拓展','301–400 字','扩展空间、特征、自然、社区和健康词汇'],
    40:['第五阶段 · 幼小衔接','401–500 字','衔接数学、笔画、课堂指令和短文阅读']
  };
  const selectedStage = state.viewStages.chinese || 0;
  $('#chineseStagePicker').innerHTML = `<span>浏览课程阶段</span>${Object.entries(stages).map(([index, stage]) => `<button class="${Number(index) === selectedStage ? 'active' : ''}" data-view-stage="chinese:${index}"><b>${stage[1]}</b><small>${stage[0].split(' · ')[1]}</small></button>`).join('')}`;
  $('#characterMap').innerHTML = subject.units.map((unit, index) => ({ unit,index })).filter(({index}) => index >= selectedStage && index < selectedStage + 10).map(({unit,index}) => {
    const progress = unitProgress('chinese', index);
    const unlocked = unitUnlocked('chinese', index);
    const stateClass = !unlocked ? 'locked' : progress >= 80 ? 'mastered' : index === currentUnitIndex('chinese') ? 'current' : '';
    const icon = unlocked ? unit.items[0].emoji : '🔒';
    const stage = stages[index];
    const banner = stage ? `<div class="character-stage-banner" data-stage-anchor="chinese:${index}"><span>${stage[1]}</span><div><small>${stage[0]}</small><h2>${stage[2]}</h2><button class="stage-entry-action" data-set-entry-stage="chinese:${index}" ${state.entryStages.chinese === index ? 'disabled' : ''}>${state.entryStages.chinese === index ? '当前学习起点' : '从本阶段开始'}</button></div></div>` : '';
    const preview = unlocked ? `<div class="unit-sound-preview">${unit.items.slice(0,4).map(item => `<button data-speak-now="${item.word}" data-lang="zh-CN" title="听${item.word}的读音"><span>${item.emoji}</span><b>${item.word}</b></button>`).join('')}</div>` : '';
    return `${banner}<article class="map-stop ${stateClass}"><span class="map-number">${progress >= 80 ? '✓' : index + 1}</span><div class="map-island"><span class="map-icon">${icon}</span><div><small>第 ${index + 1} 站 · 10 个字</small><h2>${unit.title}</h2><p>${unit.goal}</p>${preview}</div></div><div class="map-progress"><i style="width:${progress}%"></i></div><button data-start-unit="chinese:${index}" ${!unlocked ? 'disabled' : ''}>${progress ? '继续探索' : '出发识字'}</button></article>`;
  }).join('');
}

function renderEnglishWorld() {
  const subject = CURRICULUM.english;
  const stages = {
    0: ['第一阶段 · 小班 3–4 岁', '听说萌芽', '生活主题听辨，建立 60 个图像、声音与词义连接'],
    10: ['第二阶段 · 中班 4–5 岁', '句型表达', '扩展生活词汇，在情境中理解并说出完整短句'],
    20: ['第三阶段 · 大班 5–6 岁', '故事阅读', '人物、地点、问答和顺序词，尝试复述迷你绘本'],
    30: ['第四阶段 · 幼小衔接', '自然拼读', '字母音、基础音标、CVC 拼读、高频词与可解码阅读']
  };
  const selectedStage = state.viewStages.english || 0;
  $('#englishStagePicker').innerHTML = `<span>浏览课程阶段</span>${Object.entries(stages).map(([index, stage]) => `<button class="${Number(index) === selectedStage ? 'active' : ''}" data-view-stage="english:${index}"><b>${stage[1]}</b><small>${stage[0].split(' · ')[1]}</small></button>`).join('')}`;
  $('#englishBookMap').innerHTML = subject.units.map((unit, index) => ({ unit,index })).filter(({index}) => index >= selectedStage && index < selectedStage + 10).map(({unit,index}) => {
    const progress = unitProgress('english', index); const unlocked = unitUnlocked('english', index);
    const stateClass = !unlocked ? 'locked' : progress >= 80 ? 'mastered' : index === currentUnitIndex('english') ? 'current' : '';
    const coverIcons = unit.items.slice(0, 3).map(item => `<i>${englishDrawnProp({...item,unit,unitIndex:index})}</i>`).join('');
    const stage = stages[index];
    const banner = stage ? `<div class="english-stage-banner" data-stage-anchor="english:${index}"><span>${stage[1]}</span><div><small>${stage[0]}</small><h2>${stage[2]}</h2><button class="stage-entry-action" data-set-entry-stage="english:${index}" ${state.entryStages.english === index ? 'disabled' : ''}>${state.entryStages.english === index ? '当前学习起点' : '从本阶段开始'}</button></div></div>` : '';
    const preview = unlocked ? `<div class="unit-sound-preview english-preview">${unit.items.slice(0,3).map(item => `<button data-speak-now="${item.word}" data-lang="en-US" title="听 ${item.word}"><span class="english-mini-art">${englishDrawnProp({...item,unit,unitIndex:index})}</span><b>${item.word}</b></button>`).join('')}</div>` : '';
    return `${banner}<article class="english-book ${stateClass}"><div class="book-cover"><span class="${unlocked ? 'book-cover-art' : ''}">${unlocked ? coverIcons : '🔒'}</span><small>LEVEL ${index + 1}</small></div><div class="book-info"><small>${index < 10 ? '听说启蒙' : index < 20 ? '情境短句' : index < 30 ? '故事表达' : '拼读阅读'}</small><h2>${unit.title}</h2><p>${unit.goal}</p><em>${unit.focus}</em>${preview}<div class="book-progress"><i style="width:${progress}%"></i></div><span>${progress}% · ${masteryLabel(Math.round(progress / 25))}</span></div><button data-start-unit="english:${index}" ${!unlocked ? 'disabled' : ''}>${progress ? '继续学习' : index >= 30 ? '开始拼读' : '开始故事'}</button></article>`;
  }).join('');
}

function renderLogicWorld() {
  const subject = CURRICULUM.logic;
  const stages = {
    0: ['第一阶段 · 小班 3–4 岁', '感知思维', '比较、分类、量感、一一对应与 1–10 点数'],
    12: ['第二阶段 · 中班 4–5 岁', '逻辑思维', '1–20 数感、排序、规律、空间与简单运算'],
    24: ['第三阶段 · 大班 5–6 岁', '综合思维', '1–100 数感、20 以内运算、图形、测量与统计']
  };
  const selectedStage = state.viewStages.logic || 0;
  const [,stageEnd] = stageBounds('logic',selectedStage);
  $('#logicStagePicker').innerHTML = `<span>浏览课程阶段</span>${Object.entries(stages).map(([index, stage]) => `<button class="${Number(index) === selectedStage ? 'active' : ''}" data-view-stage="logic:${index}"><b>${stage[1]}</b><small>${stage[0].split(' · ')[1]}</small></button>`).join('')}`;
  $('#logicPlanetMap').innerHTML = subject.units.map((unit, index) => ({unit,index})).filter(({index}) => index >= selectedStage && index < stageEnd).map(({unit,index}) => {
    const progress = unitProgress('logic', index); const unlocked = unitUnlocked('logic', index);
    const stateClass = !unlocked ? 'locked' : progress >= 80 ? 'mastered' : index === currentUnitIndex('logic') ? 'current' : '';
    const stage = stages[index];
    const banner = stage ? `<div class="logic-stage-banner" data-stage-anchor="logic:${index}"><span>${stage[1]}</span><div><small>${stage[0]}</small><h2>${stage[2]}</h2><button class="stage-entry-action" data-set-entry-stage="logic:${index}" ${state.entryStages.logic === index ? 'disabled' : ''}>${state.entryStages.logic === index ? '当前学习起点' : '从本阶段开始'}</button></div></div>` : '';
    return `${banner}<article class="logic-planet ${stateClass}"><div class="planet-orb"><span>${unlocked ? unit.icon : '🔒'}</span><b>${progress >= 80 ? '✓' : index + 1}</b></div><div class="planet-info"><small>思维星 ${index + 1} · ${index < 12 ? '感知' : index < 24 ? '逻辑' : '综合'}</small><h2>${unit.title}</h2><p>${unit.goal}</p><div class="planet-progress"><i style="width:${progress}%"></i></div><span>${progress}% · ${masteryLabel(Math.round(progress / 25))}</span></div><button data-start-unit="logic:${index}" ${!unlocked ? 'disabled' : ''}>${progress ? '继续探索' : '登陆星球'}</button></article>`;
  }).join('');
}

function createLesson(entries, title, isDaily = false) {
  if (!entries.length) { showToast('这个单元已经掌握，去看看下一单元吧'); return; }
  const tasks = []; const embeddedPractice = new Set();
  const logicEntries = entries.filter(entry => entry.subject === 'logic');
  if (logicEntries.length) {
    const concept = logicEntries[0]; const challenge = logicEntries[1] || concept;
    tasks.push(
      { kind:'logic-story', item:concept },
      { kind:'logic-demo', item:concept, demoStep:0 },
      { kind:'logic-manipulate', item:concept },
      { kind:'practice', item:concept, retry:0, stage:'想' },
      { kind:'logic-explain', item:concept },
      { kind:'practice', item:challenge, retry:0, stage:'闯' }
    );
    logicEntries.forEach(entry => embeddedPractice.add(entry.id));
  }
  entries.forEach(entry => {
    if (entry.subject === 'logic') return;
    if (entry.isNew || getStats(entry.id).score === 0) {
      if (entry.subject === 'english') {
        tasks.push(
          { kind: 'english-story', item: entry },
          { kind: 'teach', item: entry },
          { kind: 'english-speak', item: entry },
          { kind: 'practice', item: entry, retry: 0 },
          ...englishReaderLines(entry).map((_,page) => ({ kind:'english-read', item:entry, page }))
        );
        embeddedPractice.add(entry.id);
      }
      else if (entry.subject === 'chinese') {
        tasks.push({ kind: 'chinese-play', item: entry }, { kind: 'teach', item: entry }, { kind: 'practice', item: entry, retry: 0 }, { kind: 'chinese-trace', item: entry }, { kind: 'chinese-speak', item: entry });
        embeddedPractice.add(entry.id);
      }
    }
  });
  shuffle(entries.filter(entry => !embeddedPractice.has(entry.id))).forEach(entry => tasks.push({ kind: 'practice', item: entry, retry: 0 }));
  lesson = { title, tasks, index: 0, stars: 0, correct: 0, wrong: 0, learned: new Set(entries.filter(x => x.isNew).map(x => x.id)), logicQuestionHistory: new Set(), logicVariantCursor: {}, patternThemeHistory: new Set(), logicSceneHistory: new Set(), isDaily, startedAt: Date.now() };
  navigate('lesson'); renderLesson();
}

function startDailyLesson() {
  const entries = buildDailyEntries();
  if (!entries.length) return;
  createLesson(entries, '今日自适应学习', true);
}

function startUnitLesson(subject, unitIndex) {
  const items = allSubjectItems(subject).filter(item => item.unitIndex === unitIndex);
  if (subject === 'logic') {
    const entries = [...items].sort((a,b) => getStats(a.id).score - getStats(b.id).score || getStats(a.id).attempts - getStats(b.id).attempts).slice(0,2).map(item => ({ ...item, isNew:getStats(item.id).score === 0 }));
    createLesson(entries, `${CURRICULUM[subject].name} · ${CURRICULUM[subject].units[unitIndex].title}`); return;
  }
  const review = items.filter(item => getStats(item.id).score > 0 && getStats(item.id).score < 4).slice(0, 2);
  const fresh = items.filter(item => getStats(item.id).score === 0).slice(0, 2);
  let entries = [...review, ...fresh].map(item => ({ ...item, isNew: getStats(item.id).score === 0 }));
  if (!entries.length) entries = shuffle(items).slice(0, 3).map(item => ({ ...item, isNew: false }));
  createLesson(entries, `${CURRICULUM[subject].name} · ${CURRICULUM[subject].units[unitIndex].title}`);
  if ((subject === 'english' || subject === 'logic') && matchMedia('(max-width: 1000px)').matches) requestLessonLandscape();
}

function renderLesson() {
  $('#lessonSubject').textContent = lesson.title;
  $('#sessionStars').textContent = lesson.stars;
  const total = lesson.tasks.length; const position = Math.min(lesson.index + 1, total);
  $('#lessonCounter').textContent = `${position} / ${total}`;
  $('#lessonProgress').style.width = `${lesson.index / Math.max(total, 1) * 100}%`;
  if (lesson.index >= total) { leaveLogicLandscape(); $('#landscapeMode').hidden = true; renderLessonSummary(); return; }
  const task = lesson.tasks[lesson.index];
  const isLogic = task.item?.subject === 'logic'; const isEnglish = task.item?.subject === 'english';
  document.body.classList.toggle('logic-lesson-active',isLogic);
  document.body.classList.toggle('english-lesson-active',isEnglish);
  if (!isLogic && !isEnglish) leaveLogicLandscape();
  $('#landscapeMode').hidden = !isLogic && !isEnglish;
  $('#landscapeMode').setAttribute('aria-label',isEnglish ? 'Open landscape English lesson' : '进入横屏学习');
  $('#lessonSubject').textContent = isEnglish ? 'English Adventure' : lesson.title;
  if (task.kind === 'english-story') renderEnglishStory(task.item);
  else if (task.kind === 'english-speak') renderEnglishSpeak(task.item);
  else if (task.kind === 'english-read') renderEnglishRead(task);
  else if (task.kind === 'chinese-play') renderChinesePlay(task.item);
  else if (task.kind === 'chinese-trace') renderChineseTrace(task.item);
  else if (task.kind === 'chinese-speak') renderChineseSpeak(task.item);
  else if (task.kind === 'logic-story') renderLogicStory(task.item);
  else if (task.kind === 'logic-demo') renderLogicDemo(task);
  else if (task.kind === 'logic-manipulate') renderLogicManipulate(task);
  else if (task.kind === 'logic-explain') renderLogicExplain(task);
  else if (task.kind === 'teach') renderTeach(task.item);
  else renderPractice(task);
}

function englishStageNav(active) {
  const stages = [{id:'listen',icon:'♫'},{id:'look',icon:'◉'},{id:'speak',icon:'●'},{id:'play',icon:'★'},{id:'read',icon:'▤'}];
  return `<div class="english-rotate-hint" aria-hidden="true"><span>↻</span><i>▰</i></div><div class="english-stage-nav">${stages.map(stage => `<span class="${stage.id === active ? 'active' : ''}" aria-label="${stage.id}">${stage.icon}</span>`).join('<i></i>')}</div>`;
}

function englishSentence(item) {
  const overrides = {
    '玩具小屋': { ball:'I play with a ball.', doll:'I play with a doll.', kite:'I play with a kite.', robot:'I play with a robot.', puzzle:'I play with a puzzle.' },
    '躲在哪里': { between:'It is between two boxes.' },
    '一天与时间': { today:'Today is a new day.', tomorrow:'Tomorrow is another day.' },
    '问题小侦探': { what:'I can ask, “What?”', where:'I can ask, “Where?”', who:'I can ask, “Who?”', how:'I can ask, “How?”', why:'I can ask, “Why?”', when:'I can ask, “When?”' },
    '故事顺序词': { first:'First means the beginning.', next:'Next tells what follows.', then:'Then tells what follows.', after:'After means later.', last:'Last comes near the end.', end:'The end finishes the story.' }
  };
  return overrides[item.unit.title]?.[item.word] || (item.unit.pattern || 'I see {word}.').replaceAll('{word}', item.word);
}

function englishReaderLines(item) {
  const lines = item.unit.reader || ['Look at the picture.','I see {word}.','Can you say it?'];
  const defaultSentence = (item.unit.pattern || 'I see {word}.').replaceAll('{word}',item.word);
  return lines.map(line => {
    const rendered = line.replaceAll('{word}',item.word);
    return rendered === defaultSentence ? englishSentence(item) : rendered;
  });
}

function englishSceneTheme(item) {
  const word = item.word.toLowerCase();
  const groups = [
    ['kitchen',/apple|banana|orange|bread|milk|water|juice|rice|egg|cake|cup|spoon|fork|plate|cook|breakfast|lunch|dinner/],
    ['farm',/cow|pig|duck|horse|sheep|chicken|goat|seed|root|sprout|leaf|flower|fruit/],
    ['town',/school|park|hospital|library|shop|zoo|doctor|teacher|police|firefighter|driver/],
    ['ocean',/fish|whale|ship|swim|blue/],
    ['night',/moon|star|night|sleep|bed|evening/],
    ['playground',/ball|run|jump|dance|clap|play|kite|fast|slow/],
    ['home',/mom|dad|brother|sister|baby|family|chair|table|door|window|fridge|clean|dirty|full|empty/],
    ['garden',/lion|tiger|elephant|monkey|giraffe|bear|cat|dog|rabbit|bird|butterfly/]
  ];
  return groups.find(([,pattern]) => pattern.test(word))?.[0] || ['park','home','classroom','garden'][item.unitIndex % 4];
}

function englishWordClass(word) {
  return String(word).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function englishVisualKind(item) {
  const word = item.word.toLowerCase();
  const groups = [
    ['color',/^(red|blue|yellow|green|black|white)$/],
    ['number',/^(one|two|three|four|five|six)$/],
    ['shape',/^(circle|square|triangle|rectangle|heart|star)$/],
    ['animal',/cat|dog|rabbit|bird|fish|panda|lion|tiger|elephant|monkey|giraffe|bear|cow|pig|duck|horse|sheep|chicken|goat|ox|hen|fox|frog|whale|octopus|zebra|ant|insect/],
    ['food',/apple|banana|orange|grape|watermelon|strawberry|rice|egg|milk|bread|cake|noodles|jam|fruit|cup/],
    ['body',/^(eye|ear|nose|mouth|hand|foot|leg)$/],
    ['person',/mom|dad|grandma|grandpa|brother|sister|doctor|teacher|police officer|firefighter|cook|driver|baby/],
    ['vehicle',/^(car|bus|train|bike|boat|plane|van|ship)$/],
    ['place',/school|park|hospital|library|shop|zoo|bedroom|kitchen|bathroom/],
    ['weather',/sunny|rainy|cloudy|windy|hot|cold|moon|sun|sky|night|morning|afternoon|evening|today|tomorrow/],
    ['nature',/tree|flower|grass|river|seed|root|sprout|leaf/],
    ['clothes',/hat|shirt|dress|shoes|socks|coat/],
    ['action',/run|jump|walk|eat|drink|sleep|wake up|brush|wash|play|read|clap|stop|swim|sit|pull|push|dance/],
    ['emotion',/happy|sad|angry|scared|tired|excited|clean|dirty|full|empty|young|old|big|small|tall|short|fast|slow/],
    ['position',/^(in|on|under|behind|next to|between)$/],
    ['question',/^(what|where|who|how|why|when)$/],
    ['people',/^(i|you|we|he|she|they)$/],
    ['sequence',/^(first|next|then|after|last|end)$/],
    ['phonics',/starts with this sound|sound out/]
  ];
  if (item.phonics) return 'phonics';
  if (item.unit.title === '颜色乐园') return 'color';
  return groups.find(([,pattern]) => pattern.test(word))?.[0] || 'object';
}

function englishDrawnProp(item) {
  const kind = englishVisualKind(item); const wordClass = englishWordClass(item.word);
  const seed = [...item.word].reduce((sum,char) => sum + char.charCodeAt(0),0);
  const countWords = { one:1,two:2,three:3,four:4,five:5,six:6 };
  const count = countWords[item.word.toLowerCase()] || 0;
  const dots = count ? Array.from({length:count},(_,index)=>`<u style="--dot:${index}"></u>`).join('') : '';
  const letter = escapeHTML(item.word.charAt(0).toUpperCase());
  return `<span class="english-drawn-prop kind-${kind} art-${wordClass}" style="--art-hue:${seed % 360}" aria-hidden="true"><i></i><b></b><em></em>${dots}<strong>${kind === 'phonics' ? letter : kind === 'question' ? '?' : ''}</strong></span>`;
}

function englishCartoonScene(item,{caption='',variant=0,compact=false}={}) {
  const wordClass = englishWordClass(item.word); const relation = ['in','on','under','behind','next-to','between'].includes(wordClass);
  const markedCaption = caption ? replaceEnglishWord(escapeHTML(caption),escapeHTML(item.word),`<strong>${escapeHTML(item.word)}</strong>`) : '';
  return `<div class="english-cartoon-scene scene-${englishSceneTheme(item)} word-${wordClass} variant-${variant % 3} ${compact ? 'compact' : ''}" aria-label="${escapeHTML(item.word)}">
    <span class="english-cloud cloud-one"></span><span class="english-cloud cloud-two"></span><span class="english-sun"></span>
    <span class="english-tree tree-one"></span><span class="english-tree tree-two"></span>
    <span class="english-scene-prop">${englishDrawnProp(item)}</span>${relation ? '<span class="english-relation-box"></span>' : ''}
    <span class="english-mascot"><i class="mascot-eye eye-one"></i><i class="mascot-eye eye-two"></i><b></b><em></em></span>
    <span class="english-ground-detail"></span>
    ${markedCaption ? `<p class="english-scene-caption">${markedCaption}</p>` : ''}
  </div>`;
}

function englishIconButton(kind, attributes, label) {
  const icon = kind === 'listen' ? '🔊' : kind === 'record' ? '●' : '›';
  return `<button class="english-action-button ${kind}" ${attributes} aria-label="${label}">${icon}</button>`;
}

function replaceEnglishWord(text, word, replacement) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), replacement);
}

function speechMatches(text, target) {
  const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, ' ').replace(/\s+/g, ' ').trim();
  const heard = normalize(text); const expected = normalize(target);
  if (!heard || !expected) return false;
  return /[\u3400-\u9fff]/u.test(expected) ? heard.includes(expected) : ` ${heard} `.includes(` ${expected} `);
}

function renderEnglishStory(item) {
  const sentence = englishSentence(item);
  $('#lessonContent').innerHTML = `${englishStageNav('listen')}<div class="english-scene-shell">${englishCartoonScene(item,{caption:sentence,variant:0})}${englishIconButton('listen',`data-speak-now="${escapeHTML(sentence)}" data-lang="en-US"`,'Listen again')}</div>${englishIconButton('next','data-next-task','Continue')}`;
  speak(sentence, 'en-US');
}

function renderEnglishSpeak(item) {
  $('#lessonContent').innerHTML = `${englishStageNav('speak')}<div class="english-speaking-stage">${englishCartoonScene(item,{caption:item.word,variant:2})}<div class="english-speech-controls">${englishIconButton('listen',`data-speak-now="${escapeHTML(item.word)}" data-lang="en-US"`,'Listen')}${englishIconButton('record',`data-start-speaking="${escapeHTML(item.word)}" data-speaking-lang="en-US"`,'Record')}<button class="english-action-button done" data-finish-speaking aria-label="Continue">✓</button></div>${item.phonics ? `<small class="english-phonics-line">${escapeHTML(item.phonics)}</small>` : ''}<div id="speakingFeedback"></div></div>`;
  speak(item.word, 'en-US');
}

function renderEnglishRead(task) {
  const item = task.item; const lines = englishReaderLines(item); const page = Math.min(task.page || 0,lines.length - 1); const line = lines[page];
  $('#lessonContent').innerHTML = `${englishStageNav('read')}<div class="english-reader-stage"><div class="english-page-dots">${lines.map((_,index)=>`<i class="${index === page ? 'active' : ''}"></i>`).join('')}</div>${englishCartoonScene(item,{caption:line,variant:page})}${englishIconButton('listen',`data-speak-now="${escapeHTML(line)}" data-lang="en-US"`,'Listen to this page')}</div>${englishIconButton('next','data-next-task','Next page')}`;
  speak(line,'en-US');
}

function escapeHTML(value) { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }

function cancelVoiceRecording() {
  const session = voiceRecording; if (!session) return;
  session.canceled = true; clearTimeout(session.timer);
  try { session.recognition?.abort(); } catch (_) {}
  try { if (session.recorder?.state !== 'inactive') session.recorder.stop(); } catch (_) {}
  session.stream?.getTracks().forEach(track => track.stop());
  if (session.url) URL.revokeObjectURL(session.url);
  voiceRecording = null;
}

function finishVoiceRecording(message = '录好了，先听听自己的声音，再决定要不要重录。', className = 'gentle') {
  const session = voiceRecording; if (!session || session.finishing) return;
  session.finishing = true; session.message = message; session.className = className; clearTimeout(session.timer);
  try { session.recognition?.abort(); } catch (_) {}
  try { if (session.recorder.state !== 'inactive') session.recorder.stop(); } catch (_) { session.stream.getTracks().forEach(track => track.stop()); }
}

function renderVoiceRecordingReview(session) {
  if (session.canceled || voiceRecording !== session) return;
  const feedback = $('#speakingFeedback'); if (!feedback) return;
  if (session.lang.toLowerCase().startsWith('en')) {
    feedback.innerHTML = `<div class="speaking-feedback ${session.className}">${session.message}<small class="recognition-note">Word check only · listen and compare the sounds.</small></div><div class="recording-review english-recording-review"><audio id="recordedVoice" controls preload="metadata" src="${session.url}"></audio><div>${englishIconButton('listen',`data-speak-now="${escapeHTML(session.target)}" data-lang="${session.lang}"`,'Model voice')}<button class="english-action-button playback" data-play-recording aria-label="Play my voice">▶</button><button class="english-action-button record" data-record-again aria-label="Record again">●</button><button class="english-action-button done" data-next-task aria-label="Continue">✓</button></div></div>`;
    return;
  }
  feedback.innerHTML = `<div class="speaking-feedback ${session.className}">${session.message}<small class="recognition-note">自动识别只帮助发现是否说出了目标词，不代表专业发音评分。</small></div><div class="recording-review"><div><span>🎧</span><div><b>听听我的声音</b><small>先听示范，再回听自己：目标词是否完整、声音是否清楚</small></div></div><audio id="recordedVoice" controls preload="metadata" src="${session.url}"></audio><div><button class="soft-button" data-speak-now="${escapeHTML(session.target)}" data-lang="${session.lang}">🔊 听示范</button><button class="soft-button" data-play-recording>▶ 回听录音</button><button class="microphone-button" data-record-again>🎙️ 再录一次</button><button class="lesson-next" data-next-task>继续学习</button></div></div>`;
}

async function startSpeakingCheck(target, lang = 'en-US') {
  cancelVoiceRecording(); stopSpeech();
  const feedback = $('#speakingFeedback'); const english = lang.toLowerCase().startsWith('en');
  if (!navigator.mediaDevices?.getUserMedia || !('MediaRecorder' in window)) {
    feedback.innerHTML = english ? `<div class="speaking-feedback gentle">Microphone unavailable.</div><button class="english-action-button done" data-next-task aria-label="Continue">✓</button>` : `<div class="speaking-feedback gentle">当前浏览器不能保存录音。请换用最新版 Chrome 或 Safari，并允许麦克风权限。</div><button class="lesson-next" data-next-task>继续</button>`; return;
  }
  feedback.innerHTML = `<div class="speaking-feedback listening">${english ? `🎙️ ${escapeHTML(target)}` : `正在申请麦克风，请允许后读出 <b>${escapeHTML(target)}</b>…`}</div>`;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true } }); }
  catch (_) { feedback.innerHTML = english ? `<div class="speaking-feedback gentle">Please allow the microphone.</div><button class="english-action-button done" data-next-task aria-label="Continue">✓</button>` : `<div class="speaking-feedback gentle">没有获得麦克风权限。可以在浏览器地址栏的网站设置中允许麦克风后再试。</div><button class="lesson-next" data-next-task>继续</button>`; return; }

  let recorder;
  try { recorder = new MediaRecorder(stream); }
  catch (_) { stream.getTracks().forEach(track => track.stop()); feedback.innerHTML = english ? `<div class="speaking-feedback gentle">Recording unavailable.</div><button class="english-action-button done" data-next-task aria-label="Continue">✓</button>` : `<div class="speaking-feedback gentle">这台设备暂时不能创建录音文件，请更新浏览器后再试。</div><button class="lesson-next" data-next-task>继续</button>`; return; }
  const session = { target,lang,stream,recorder,chunks:[],recognition:null,url:'',message:'',className:'gentle',finishing:false,canceled:false,timer:null };
  voiceRecording = session;
  recorder.ondataavailable = event => { if (event.data.size) session.chunks.push(event.data); };
  recorder.onstop = () => {
    stream.getTracks().forEach(track => track.stop()); if (session.canceled || voiceRecording !== session) return;
    const blob = new Blob(session.chunks,{type:recorder.mimeType || 'audio/webm'}); session.url = URL.createObjectURL(blob); renderVoiceRecordingReview(session);
  };
  recorder.start();
  feedback.innerHTML = english ? `<div class="speaking-feedback listening"><span class="recording-pulse"></span><b>${escapeHTML(target)}</b></div><button class="english-action-button stop-recording" data-stop-recording aria-label="Stop recording">■</button>` : `<div class="speaking-feedback listening"><span class="recording-pulse"></span>正在录音：请清楚地说 <b>${escapeHTML(target)}</b></div><button class="soft-button stop-recording" data-stop-recording>■ 说完了</button>`;

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    session.message = english ? 'Now listen to your voice.' : '录音完成。当前浏览器不能自动判断，请回听后和示范音做比较。';
    session.timer = setTimeout(() => finishVoiceRecording(session.message,'gentle'),5000); return;
  }
  const recognition = new Recognition(); session.recognition = recognition; recognition.lang = lang; recognition.interimResults = false; recognition.maxAlternatives = 5;
  recognition.onresult = event => {
    const alternatives = [...event.results[0]]; const heard = alternatives.map(result => result.transcript.toLowerCase());
    const matched = alternatives.some(result => speechMatches(result.transcript,target) && (!result.confidence || result.confidence >= .45));
    const heardText = escapeHTML(heard[0] || '');
    finishVoiceRecording(english ? (matched ? `I heard “${escapeHTML(target)}”. Now compare both sounds.` : `I heard “${heardText}”. Listen and try “${escapeHTML(target)}” again.`) : (matched ? `系统识别到了“${heardText}”。再听示范并回听自己的声音吧！` : `系统听到“${heardText}”，暂时没有识别出目标词“${escapeHTML(target)}”。回听后可以慢慢再录一次。`),matched ? 'success' : 'gentle');
  };
  recognition.onerror = event => { if (!session.finishing) finishVoiceRecording(english ? 'Listen and try once more.' : (event.error === 'no-speech' ? '没有听到清楚的单词。先回听录音，再慢慢重录一次。' : '自动判断暂时不可用，请回听录音后自己比较。'),'gentle'); };
  recognition.onend = () => { if (!session.finishing) finishVoiceRecording(english ? 'Now listen to your voice.' : '录音完成。自动判断没有返回结果，请回听后和示范音比较。','gentle'); };
  try { recognition.start(); } catch (_) { session.timer = setTimeout(() => finishVoiceRecording(english ? 'Now listen to your voice.' : '录音完成，请回听后和示范音比较。','gentle'),5000); return; }
  session.timer = setTimeout(() => finishVoiceRecording(english ? 'Now listen to your voice.' : '录音已自动结束。请回听自己的声音，再决定是否重录。','gentle'),6500);
}

function chineseStageNav(active) {
  return `<div class="chinese-stage-nav">${['玩','认','练','写','说'].map(name => `<span class="${name === active ? 'active' : ''}">${name}</span>`).join('<i>·</i>')}</div>`;
}

function logicStageNav(active) {
  return `<div class="logic-rotate-hint"><span>📱</span><div><b>横过手机，画面更宽</b><small>也可以点顶部“横屏”按钮</small></div></div><div class="logic-stage-nav">${['探','教','摆','想','说','闯'].map(name => `<span class="${name === active ? 'active' : ''}">${name}</span>`).join('<i>·</i>')}</div>`;
}

function logicFamily(type) {
  const families = {
    size: 'compare', length: 'compare', color: 'category', shape: 'category', count5: 'count', count10: 'count', number10: 'count', count20: 'count', number50: 'count', number100: 'count',
    match: 'match', correspondence: 'match', instruction: 'order', 'number-order': 'order', sort: 'order', position: 'space',
    addition5: 'calculate', subtraction5: 'calculate', addition10: 'calculate', subtraction10: 'calculate', arithmetic20: 'calculate', 'word-problem': 'calculate',
    geometry2d: 'geometry', geometry3d: 'geometry', transform: 'space', measure: 'measure', statistics: 'statistics', deduction: 'reason'
  };
  return families[type] || type;
}

function logicStoryCopy(type) {
  const stories = {
    same: ['机器人要找到一模一样的能量徽章。', '先看颜色，再看形状和方向。'],
    different: ['星星队伍里混进了一个不一样的伙伴。', '一个一个比，差别就会出现。'],
    category: ['飞船里的物品散了一地，我们来整理。', '想想它们是什么、有什么用。'],
    count: ['小行星需要刚刚好的能量球。', '一个一个地点数，数过的不要重复。'],
    compare: ['两艘飞船都在收集星星，哪艘更多呢？', '把两边一一配对，看看谁还有剩下。'],
    ab: ['生活中的小伙伴在轮流排队。', '指着图片慢慢读，找出两个一组的规律。'],
    complex: ['这次每组会有三个小伙伴。', '慢慢读一遍，再找完整的重复小组。'],
    space: ['机器人正在寻找飞船里的位置。', '先找到参照物，再判断方向。'],
    order: ['出发前要按顺序完成准备。', '想想哪件事先发生，哪件事后发生。'],
    match: ['每位小伙伴都需要一份刚刚好的装备。', '一个对一个配起来，看看够不够。'],
    calculate: ['补给站正在计算今天的能量。', '把故事里的数量摆出来，再想是合起来还是拿走。'],
    geometry: ['图形工厂送来了一批新零件。', '摸一摸、转一转，看看边、角和能不能滚动。'],
    measure: ['机器人要选出合适的建造材料。', '先把一端对齐，再比较长度、高度或容量。'],
    statistics: ['星球观察员画好了一张记录图。', '先读清每一项，再比较哪一项多、少或一样。'],
    reason: ['只有符合全部条件的飞船才能起飞。', '每个条件都要用到，不符合的先排除。']
  };
  return stories[logicFamily(type)] || stories.reason;
}

function logicDemoContent(type) {
  const demos = {
    same:{visual:'🔴　🔴　🔵',steps:['先看颜色，找到颜色一样的。','再看形状和方向，不能只看一个地方。','所有特征都一样，才叫完全相同。']},
    different:{visual:'🍎　🍎　🍐',steps:['先把三个图案排在一起。','从颜色、形状、种类逐项比较。','只有一个特征不同的，就是答案。']},
    category:{visual:'🍎 🍌　│　🚗',steps:['先说一说每个物品是什么。','找到共同点，比如都是水果。','不符合共同点的物品放到另一边。']},
    count:{visual:'①　②　③　④',steps:['从一边开始，一个一个地点。','点过一个就做一个小记号。','最后说到的数，就是一共有多少。']},
    compare:{visual:'🍎🍎🍎<br>🍐🍐',steps:['把两组从同一个位置排好。','一个苹果对一个梨，逐个配对。','还有剩下的一组更多，没有剩下一样多。']},
    ab:{visual:'🔴 🔵　🔴 🔵　❓',steps:['先看第一种和第二种图案。','用小手指着读：第一种、第二种，再重复一次。','它们轮流出现，沿着同样顺序找到空缺图案。']},
    complex:{visual:'🟨 🟨 🟩　🟨 🟨 ❓',steps:['先慢慢看完整串图案。','找到三个图案组成的重复小组。','新一组已经出现前两个，接着选择第三个。']},
    space:{visual:'🐰　📦',steps:['先找到题目说的参照物。','站在同一个方向观察位置。','再判断上、下、左、右、里面或外面。']},
    order:{visual:'🌱　🌿　🌳',steps:['先找事情开始时的样子。','观察它怎样一步一步变化。','按先发生、后发生排好顺序。']},
    match:{visual:'🐰🥕　🐰🥕　🐰❓',steps:['每个伙伴只配一个物品。','配过的不能重复，也不能漏掉。','看看有没有伙伴或物品剩下来。']},
    calculate:{visual:'🍎🍎　＋　🍎',steps:['先把故事里的数量摆出来。','来了、合起来用加法；拿走用减法。','数一数变化以后还剩多少。']},
    geometry:{visual:'🔺　🟨　⚪',steps:['先看图形有几条边、几个角。','立体物体还要看面和能不能滚动。','不看颜色，只按图形特征判断。']},
    measure:{visual:'▰▰▰　│　▰▰▰▰▰',steps:['把两件物品的一端对齐。','使用一样大小的格子或单位。','数格子再比较，格子多的更长。']},
    statistics:{visual:'🍎 ●●●<br>🍌 ●●',steps:['先看每一行代表什么。','数清每一项有几个点。','比较数量，再回答最多、最少或一样多。']},
    reason:{visual:'🔴　🟦　🔺',steps:['把题目的条件一个一个说出来。','不符合一个条件的先排除。','检查剩下的答案是否符合全部条件。']}
  };
  return demos[logicFamily(type)] || demos.reason;
}

const PATTERN_THEMES = [
  { id:'road', scene:'road', a:'car-coral', b:'car-mint', voice:'小汽车' },
  { id:'birds', scene:'sky', a:'bird-cocoa', b:'bird-sun', voice:'小鸟' },
  { id:'flight', scene:'sky', a:'plane', b:'balloon', voice:'天空伙伴' },
  { id:'garden', scene:'garden', a:'butterfly', b:'bee', voice:'花园伙伴' },
  { id:'ocean', scene:'ocean', a:'fish', b:'jelly', voice:'海洋伙伴' },
  { id:'space', scene:'space', a:'rocket', b:'planet', voice:'太空伙伴' },
  { id:'play', scene:'playground', a:'kite', b:'ball', voice:'游乐场玩具' },
  { id:'forest', scene:'forest', a:'mushroom', b:'flower', voice:'森林伙伴' }
];

function patternArt(name) {
  return `<span class="pattern-art ${name}" aria-hidden="true"><i></i><b></b><em></em></span>`;
}

function objectArt(name, extra = '') {
  return `<span class="object-art ${name} ${extra}" aria-hidden="true"><i></i><b></b><em></em></span>`;
}

const OBJECT_PICTURE_MAP = {
  '🍎':'apple-red','🍏':'apple-green','🍐':'pear','🍌':'banana','🍉':'watermelon','🫐':'berry','🍓':'strawberry','🍇':'grapes',
  '🐰':'rabbit','🐼':'panda','🐶':'dog','🐱':'cat','🐘':'elephant','🐭':'mouse','🦆':'duck',
  '🚗':'car-coral','🚙':'car-mint','🚌':'bus','🐟':'fish','🐠':'fish','🐦':'bird-sun','🦋':'butterfly','⚽':'ball','🎈':'balloon',
  '🏠':'house-small','🏡':'house-large','⛺':'tent','🌳':'tree','📦':'box','🧢':'hat','👕':'shirt','👟':'shoe',
  '🍰':'cake','🍪':'cookie','🥛':'cup','🫗':'pitcher','🪣':'bucket','🧊':'cube','🎁':'gift','🥫':'cylinder',
  '🔴':'circle-red','🔵':'circle-blue','🟡':'circle-yellow','🟢':'circle-green','🟣':'circle-purple','⚪':'circle-white',
  '🔺':'triangle-red','🟨':'square-yellow','🟦':'square-blue','⭐':'star','🌟':'star','🌙':'moon',
  '🪥':'toothbrush','🛏️':'bed','🍽️':'plate','🌱':'sprout','🫘':'seed','🪨':'stone','🧥':'raincoat','🧱':'block','🪁':'kite'
};

const PATTERN_OBJECTS = new Set(['car-coral','car-mint','fish','bird-sun','butterfly','ball','balloon','kite']);

function pictureToken(name, extra = '') {
  return PATTERN_OBJECTS.has(name) ? patternArt(name) : objectArt(name,extra);
}

function relationPicture(kind, subject = 'rabbit', reference = 'box') {
  const secondReference = kind === 'middle' ? `<span class="relation-reference second">${pictureToken(reference)}</span>` : '';
  return `<span class="logic-relation relation-${kind}" aria-hidden="true"><span class="relation-subject">${pictureToken(subject)}</span><span class="relation-reference">${pictureToken(reference)}</span>${secondReference}<i></i></span>`;
}

function scaledPicture(name, scale) {
  return `<span class="logic-size-picture size-${scale}" aria-hidden="true">${pictureToken(name)}</span>`;
}

function capacityPicture(level, vessel = 'cup') {
  return `<span class="logic-capacity vessel-${vessel} fill-${level}" aria-hidden="true"><i></i><b></b></span>`;
}

function heightPicture(level) {
  return `<span class="logic-block-stack stack-${level}" aria-hidden="true">${Array.from({length:level},() => '<i></i>').join('')}</span>`;
}

function nextPatternTheme(history = new Set()) {
  let index = Number(state.patternThemeCursor || 0) % PATTERN_THEMES.length;
  for (let offset = 0; offset < PATTERN_THEMES.length; offset += 1) {
    const candidate = (index + offset) % PATTERN_THEMES.length;
    if (!history.has(PATTERN_THEMES[candidate].id)) { index = candidate; break; }
  }
  const theme = PATTERN_THEMES[index]; history.add(theme.id);
  state.patternThemeCursor = (index + 1) % PATTERN_THEMES.length; saveState();
  return theme;
}

function buildPatternQuestion(type, history = new Set()) {
  const theme = nextPatternTheme(history); const complex = type === 'complex';
  const names = complex ? [theme.a,theme.a,theme.b,theme.a,theme.a] : [theme.a,theme.b,theme.a,theme.b,theme.a];
  const choices = shuffle([theme.a,theme.b]).map(name => ({ name, visual:patternArt(name) }));
  const display = `<div class="pattern-board scene-${theme.scene}" data-pattern-theme="${theme.id}"><div class="pattern-row">${names.map((name,index) => `<span class="pattern-item" style="--item-delay:${index * 70}ms">${patternArt(name)}</span>`).join('')}<span class="pattern-slot" data-pattern-slot aria-label="空缺位置"><i></i></span></div></div>`;
  return { title:complex ? '仔细听，找出重复小组后选择空缺图案' : '仔细听，看看两个图案怎样轮流出现，选择空缺图案', hint:'先用小手指着图案慢慢读一遍', speak:complex ? `看看${theme.voice}的排列。先找出三个一组的重复规律，再选出空缺位置。` : `看看${theme.voice}的排列。它们一个接一个轮流出现，空缺的位置应该是谁？`, display, visualOnly:true, patternMode:true, themeId:theme.id, correct:choices.findIndex(choice => choice.name === theme.b), options:choices.map(({visual}) => ({visual})) };
}

const LOGIC_SCENE_POOLS = {
  same:['playroom','market','classroom','park','picnic'], different:['market','park','playroom','classroom','street'],
  category:['market','kitchen','classroom','picnic','farm'], count:['farm','bakery','picnic','pond','market'],
  compare:['market','playroom','park','picnic','farm'], match:['kitchen','classroom','picnic','bedroom','market'],
  order:['bedroom','bathroom','kitchen','garden','classroom'], space:['park','bedroom','classroom','street','playground'],
  calculate:['bakery','market','pond','busstop','picnic'], geometry:['workshop','classroom','playground','playroom','park'],
  measure:['workshop','kitchen','garden','classroom','market'], statistics:['market','farm','classroom','garden','playroom'],
  reason:['park','street','classroom','market','playground']
};

const LIFE_WORD_PICTURES = {
  '刷牙':'🪥','睡觉':'🛏️','吃晚饭':'🍽️','发芽':'🌱','回到种子袋':'🫘','变成石头':'🪨','洗手':'🧼','穿雨衣':'🧥',
  '苹果':'🍎','香蕉':'🍌','葡萄':'🍇','小猫':'🐱','小狗':'🐶','小兔':'🐰','小鸟':'🐦','小鸭':'🦆','小鱼':'🐟','皮球':'⚽','积木':'🧱','风筝':'🪁',
  '一样多':'⚖️','每格一样长':'▰ ▰ ▰','比较容量':'🥛 🫗 🪣','从同一地面开始':'▰<br>▰▰<br>▰▰▰','沿中线对折':'🦋 │ 🦋','半圈':'↻'
};

function lifeVisualContent(raw) {
  let content = String(raw ?? '');
  Object.entries(LIFE_WORD_PICTURES).sort((a,b) => b[0].length - a[0].length).forEach(([word,picture]) => { content = content.split(word).join(picture); });
  Object.entries(OBJECT_PICTURE_MAP).forEach(([symbol,name]) => { content = content.split(symbol).join(pictureToken(name)); });
  content = content.replace(/和/g,'＋').replace(/[\u3400-\u9fff]+/g,'').replace(/　+/g,'　').trim();
  const objectCount = (content.match(/class="(?:object|pattern)-art/g) || []).length;
  if (objectCount > 3) content = `<span class="logic-object-cluster ${objectCount > 10 ? 'dense' : ''}">${content}</span>`;
  return content || '●';
}

function nextLogicScene(type, history = new Set()) {
  const family = logicFamily(type); const pool = LOGIC_SCENE_POOLS[family] || LOGIC_SCENE_POOLS.reason;
  const start = Number(state.logicSceneCursor || 0) % pool.length;
  let scene = pool[start];
  for (let offset = 0; offset < pool.length; offset += 1) {
    const candidate = pool[(start + offset) % pool.length];
    if (!history.has(`${family}:${candidate}`)) { scene = candidate; break; }
  }
  history.add(`${family}:${scene}`); state.logicSceneCursor = (start + 1) % pool.length; saveState();
  return scene;
}

function lifePicture(raw, scene, variant = 0) {
  const content = lifeVisualContent(raw); const dense = content.replace(/<[^>]*>/g,'').length > 8 ? ' dense' : '';
  return `<span class="logic-life-picture scene-${scene} variant-${variant % 3}${dense}"><span class="life-picture-prop">${content}</span><i></i><b></b></span>`;
}

function enrichLogicQuestion(question, type) {
  if (question.patternMode) return question;
  const history = lesson?.logicSceneHistory || gameSession?.logicSceneHistory || new Set();
  const scene = nextLogicScene(type,history); question.sceneId = scene; question.visualOnly = true;
  question.options = question.options.map((option,index) => ({ ...option, visual:option.richVisual ? option.visual : lifePicture(option.visual,scene,index), label:'' }));
  if (question.display) question.display = `<div class="logic-life-display scene-${scene}"><span class="life-display-prop">${lifeVisualContent(question.display)}</span><i></i><b></b></div>`;
  return question;
}

function logicDemoVisual(question, step = 2) {
  if (question.patternMode) return question.display;
  const display = question.display ? `<div class="logic-demo-focus">${question.display}</div>` : '';
  const options = `<div class="logic-demo-options">${question.options.slice(0,3).map((option,index) => `<span class="demo-option ${index === question.correct ? 'is-answer' : ''}" style="--demo-delay:${index * 120}ms">${option.visual}</span>`).join('')}</div>`;
  return `<div class="logic-demo-workspace demo-phase-${step}">${display}${options}</div>`;
}

function renderLogicDemo(task) {
  const demo = logicDemoContent(task.item.type); const step = Math.min(task.demoStep || 0,demo.steps.length - 1); const last = step === demo.steps.length - 1;
  const narration = `第${step + 1}步。${demo.steps[step]}`;
  task.demoQuestion ||= uniqueLogicQuestion(task.item.type,lesson.logicQuestionHistory);
  const visual = logicDemoVisual(task.demoQuestion,step);
  $('#lessonContent').innerHTML = `${logicStageNav('教')}<div class="logic-demo-board visual-only-demo ${task.demoQuestion.patternMode ? 'pattern-demo' : 'life-demo'}"><div class="logic-demo-scene"><span class="demo-robot" aria-hidden="true">🤖</span><div class="demo-visual">${visual}</div><i></i></div><div class="logic-demo-copy"><span class="sr-only">${demo.steps[step]}</span><div class="demo-step-dots" aria-label="第 ${step + 1} 步，共 ${demo.steps.length} 步">${demo.steps.map((_,index) => `<i class="${index <= step ? 'done' : ''}"></i>`).join('')}</div><button class="demo-listen icon-only-audio" data-speak-now="${escapeHTML(narration)}" data-lang="zh-CN" aria-label="再听一遍">🔊</button><button class="lesson-next icon-next" ${last ? 'data-next-task' : 'data-next-demo-step'} aria-label="${last ? '开始练习' : '下一步'}">›</button></div></div>`;
  speak(narration,'zh-CN');
}

function renderLogicStory(item) {
  const copy = logicStoryCopy(item.type);
  $('#lessonContent').innerHTML = `${logicStageNav('探')}<span class="task-label">星球任务</span><div class="logic-story-scene"><span class="logic-moon">●</span><span class="logic-story-robot">🤖</span><span class="logic-story-tool">${item.unit.icon}</span><span class="logic-ground-dots">• • • • •</span></div><h2 class="question-title">${copy[0]}</h2><p class="question-hint">${copy[1]}</p><button class="lesson-next" data-next-task>接受任务</button>`;
  speak(`${copy[0]}。${copy[1]}`);
}

function renderLogicManipulate(task) {
  const question = nextLogicQuestion(task.item.type); task.question = question; lesson.lastLogicQuestion = question; const narration = logicQuestionNarration(question,question.patternMode ? '点下面的图案，把它送到空缺位置。' : '点一个小教具，把它放进中间的思考盘。');
  $('#lessonContent').innerHTML = `<div class="logic-visual-question ${question.patternMode ? 'pattern-question-stage' : ''}"><span class="sr-only">${question.title}</span><button class="logic-question-audio icon-only-audio" data-speak-now="${escapeHTML(narration)}" data-lang="zh-CN" aria-label="再听题目">🔊</button>${question.display ? `<div class="logic-sequence ${question.patternMode ? 'pattern-sequence-shell' : ''}">${question.display}</div>` : ''}${question.patternMode ? '' : '<div class="thinking-mat" id="thinkingMat" aria-label="答案放置区"><span aria-hidden="true">◎</span></div>'}<div class="manipulative-tray ${question.patternMode ? 'pattern-choice-grid' : ''}">${question.options.map((option, index) => `<button data-manip-index="${index}" aria-label="选项 ${index + 1}"><span>${option.visual}</span></button>`).join('')}</div><div id="manipFeedback"></div></div>`;
  speak(narration,'zh-CN');
}

function logicReason(type) {
  const map = {
    same: ['颜色、形状和方向都一样', '只要颜色差不多就可以'], different: ['它有一个特征和其他伙伴不同', '因为它排在最后'], category: ['先确定分类标准，再逐个检查特征', '只看物品放在哪里'], count: ['按顺序点数，最后一个数表示总数', '看起来多就随便猜'], compare: ['先对齐或一一配对，再比较结果', '摆得更开的一边一定更多'], ab: ['两个元素轮流重复出现', '每次都随便变化'], complex: ['先圈出完整的重复组，再往后接', '只看最后一个'], space: ['先找到参照物，再判断方向或变化', '只看自己喜欢的位置'], order: ['先确定排序规则，再逐项排列', '按照图片颜色随便排列'], match: ['一个对一个配对，没有遗漏也不重复', '只要总数看起来差不多'], calculate: ['先找已知数量，再判断合起来还是拿走', '看到数字就全部相加'], geometry: ['观察边、角、面以及能不能滚动', '只根据图形颜色判断'], measure: ['统一起点或单位后再进行比较', '不用对齐就直接看'], statistics: ['先读图例和每项数量，再进行比较', '只看最高的一项'], reason: ['逐个检查条件并排除不符合的', '挑最漂亮的答案']
  };
  return map[logicFamily(type)] || map.reason;
}

function renderLogicExplain(task) {
  const reason = logicReason(task.item.type)[0]; const recap = lesson.lastLogicQuestion || task.demoQuestion;
  const narration = `刚才我们是这样想的。${reason}。请跟着说一遍。`;
  $('#lessonContent').innerHTML = `<div class="logic-explain-visual"><span class="sr-only">${narration}</span><button class="logic-question-audio icon-only-audio" data-speak-now="${escapeHTML(narration)}" data-lang="zh-CN" aria-label="再听方法">🔊</button><div class="logic-recap-picture">${recap ? logicDemoVisual(recap,2) : ''}</div><div class="visual-method-track" aria-hidden="true"><span>◉</span><i>›</i><span>⇄</span><i>›</i><span>✓</span></div><button class="lesson-next icon-next" data-next-task aria-label="去挑战">›</button></div>`;
  speak(narration,'zh-CN');
}

const CHINESE_SCENE_MOTIFS = ['🌱','✨','☁️','🌈','🍃','🫧','🌼','⭐','🪁','🪨'];

function chineseSceneVisual(item) {
  const match = item.id.match(/chinese-(\d+)-(\d+)/); const unitIndex = Number(match?.[1] || 1) - 1; const itemIndex = Number(match?.[2] || 1) - 1;
  const seed = unitIndex * 10 + itemIndex; const hue = (seed * 47 + 36) % 360; const motif = CHINESE_SCENE_MOTIFS[itemIndex];
  const props = Array.from({length:itemIndex % 3 + 1},() => `<span>${motif}</span>`).join('');
  return { key:seed + 1, style:`--scene-hue:${hue};--scene-hue-2:${(hue + 42) % 360};--scene-shift:${(seed % 7) - 3}px`, props, unitIcon:item.unit.icon };
}

function renderChinesePlay(item) {
  const scene = chineseSceneVisual(item);
  const sceneMode = item.word === '月' ? 'night' : item.word === '日' ? 'day' : 'semantic-scene';
  const skyDetail = item.word === '月' ? '✦　✧　✦' : item.word === '日' ? '☁️' : CHINESE_SCENE_MOTIFS[(scene.key + 3) % CHINESE_SCENE_MOTIFS.length];
  $('#lessonContent').innerHTML = `${chineseStageNav('玩')}<span class="task-label">图景猜字</span><div class="character-story-scene ${sceneMode}" style="${scene.style}" data-scene-key="${scene.key}"><span class="story-sky-detail">${skyDetail}</span><span class="story-unit-symbol">${scene.unitIcon}</span><span class="story-visual">${item.emoji}</span><span class="story-scene-props">${scene.props}</span><span class="story-grass">♧ ♧ ♧ ♧ ♧</span></div><h2 class="question-title">猜一猜，这幅图里藏着哪个字？</h2><p class="question-hint">主图表示字义，小道具提示它属于哪个生活主题。</p><button class="lesson-next reveal-character" data-reveal-character="${item.word}" data-reveal-meaning="${escapeHTML(item.meaning)}" data-reveal-visual="${item.emoji}">揭开小秘密</button><div id="characterReveal"></div>`;
}

function renderChineseTrace(item) {
  $('#lessonContent').innerHTML = `${chineseStageNav('写')}<span class="task-label">手指描字</span><h2 class="question-title">沿着浅色的字，慢慢描一遍</h2><p class="question-hint">感受笔画方向即可，不要求写得完全一样。</p><canvas class="trace-canvas" id="traceCanvas" width="360" height="270" aria-label="描写汉字${item.word}"></canvas><div><button class="soft-button" data-clear-trace>↻ 重描</button><button class="lesson-next" data-next-task>描好啦</button></div>`;
  setupTraceCanvas(item.word);
}

function setupTraceCanvas(character) {
  const canvas = $('#traceCanvas'); const ctx = canvas.getContext('2d'); let drawing = false;
  const drawGuide = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save();
    ctx.strokeStyle = '#d9cfad'; ctx.lineWidth = 2; ctx.setLineDash([7, 7]);
    ctx.beginPath(); ctx.moveTo(canvas.width / 2, 15); ctx.lineTo(canvas.width / 2, canvas.height - 15); ctx.moveTo(15, canvas.height / 2); ctx.lineTo(canvas.width - 15, canvas.height / 2); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = '#e8dfc7'; ctx.font = '220px KaiTi, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(character, canvas.width / 2, canvas.height / 2 + 9); ctx.restore();
  };
  const point = event => { const rect = canvas.getBoundingClientRect(); const touch = event.touches?.[0] || event; return { x: (touch.clientX - rect.left) * canvas.width / rect.width, y: (touch.clientY - rect.top) * canvas.height / rect.height }; };
  drawGuide();
  const start = event => { drawing = true; const p = point(event); ctx.beginPath(); ctx.moveTo(p.x, p.y); event.preventDefault(); };
  const move = event => { if (!drawing) return; const p = point(event); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#7b9858'; ctx.lineWidth = 18; ctx.lineTo(p.x, p.y); ctx.stroke(); event.preventDefault(); };
  const end = () => { drawing = false; };
  canvas.addEventListener('pointerdown', start); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', end); canvas.addEventListener('pointerleave', end); canvas.addEventListener('pointercancel', end);
  canvas._clearTrace = drawGuide;
}

function renderChineseSpeak(item) {
  const phrases = chinesePhrases(item);
  const practicePhrase = phrases[0];
  $('#lessonContent').innerHTML = `${chineseStageNav('说')}<span class="task-label">词语表达</span><div class="speak-character"><span>${item.word}</span><button class="listen-round" data-speak-now="${item.word}" data-lang="zh-CN">🔊</button></div><h2 class="question-title">带着“${item.word}”一起说</h2><div class="phrase-bubbles">${phrases.map(text => `<button data-speak-now="${text}" data-lang="zh-CN">${text} 🔊</button>`).join('')}</div><p class="teach-note">先听一听“${practicePhrase}”，再录下自己的声音。录完可以反复回听和重录。</p><div class="speaking-actions"><button class="microphone-button" data-start-speaking="${practicePhrase}" data-speaking-lang="zh-CN">🎙️ 录下“${practicePhrase}”</button><button class="soft-button" data-finish-speaking>我已经练习了</button></div><div id="speakingFeedback"></div>`;
}

function chinesePhrases(item) {
  const map = {日:['日出','红日','今天是好日子'],月:['月亮','月光','月亮弯弯'],山:['大山','山顶','我看见一座山'],水:['喝水','河水','小鱼在水里'],火:['大火','火苗','火苗红红的'],木:['木头','树木','这里有一棵树'],人:['大人','家人','这里有很多人'],口:['门口','开口','我会开口说话'],手:['小手','洗手','我有一双小手'],目:['目光','双目','目就是眼睛'],耳:['耳朵','木耳','我用耳朵听'],足:['足球','手足','足就是脚'] };
  return map[item.word] || [item.meaning, `${item.word}字`, `我认识“${item.word}”了`];
}

function renderTeach(item) {
  const subject = CURRICULUM[item.subject];
  if (item.subject === 'english') {
    $('#lessonContent').innerHTML = `${englishStageNav('look')}<div class="english-word-stage">${englishCartoonScene(item,{caption:item.word,variant:1})}<div class="english-word-controls">${englishIconButton('listen',`data-speak-now="${escapeHTML(item.word)}" data-lang="en-US"`,'Listen to the word')}${item.phonics ? `<small>${escapeHTML(item.phonics)}</small>` : ''}</div></div>${englishIconButton('next','data-next-task','Continue')}`;
    speak(item.word,'en-US');
    return;
  }
  if (item.subject === 'logic') {
    const info = logicTeaching(item.type);
    $('#lessonContent').innerHTML = `<span class="task-label">认识新方法 · ${subject.name}</span><span class="teach-emoji">${item.unit.icon}</span><h2 class="teach-word">${item.unit.title}</h2><p class="teach-meaning">${item.unit.goal}</p><div class="teach-note">${info}</div><button class="lesson-next" data-next-task>我明白了，试一试</button>`;
    speak(`${item.unit.title}。${item.unit.goal}`);
  } else {
    const pronunciation = item.pinyin;
    const note = `“${item.word}”和${item.meaning}有关。先看图理解意思，再观察这个字的样子。`;
    const stage = chineseStageNav('认');
    $('#lessonContent').innerHTML = `${stage}<span class="task-label">认识新朋友 · ${subject.name}</span><span class="teach-emoji">${item.emoji}</span><h2 class="teach-word">${item.word}</h2>${pronunciation ? `<p class="teach-pronunciation">${pronunciation}</p>` : ''}<p class="teach-meaning">${item.meaning}</p><button class="listen-round" data-speak-now="${item.word}" data-lang="zh-CN">🔊</button><div class="teach-note">${note}</div><button class="lesson-next" data-next-task>去练一练</button>`;
    speak(item.word,'zh-CN');
  }
}

function logicTeaching(type) {
  const notes = {
    same: '先看颜色，再看形状和方向。每个地方都一样，才是真正的“相同”。', different: '把三个地方逐个比较：颜色、形状、种类。只有一个不一样，把它找出来。', category: '先说出分类标准，再逐个检查。可以按颜色、形状、种类或用途分类。', ab: '两个东西轮流出现，就像拍手、跺脚、拍手、跺脚。说出规律再选择。', complex: '一个元素可能连续出现两次。先圈出完整的一组，再按同样顺序接下去。', count: '一个一个地点数，点过的不要重复。数量较多时，可以五个或十个分成一组。', compare: '比较大小和长短要先对齐；比较多少可以一一连线，看哪边还有剩下。', space: '先确定参照物，再判断上、下、左、右、里外，或观察图形怎样移动和转动。', order: '先找排序规则，再逐项排列。数序要留意前一个、后一个和相邻数。', match: '一一对应就是每个伙伴只配一个物品，不遗漏，也不重复。', calculate: '先把故事中的数量摆出来。合起来用加法，拿走、剩下或相差用减法。', geometry: '平面图形看边和角；立体图形看面，还可以试一试它能不能滚动或堆叠。', measure: '测量要从同一个起点开始，并使用同样大小的单位，结果才能公平比较。', statistics: '先看图例表示什么，再数每一项有多少，最后比较数据并回答问题。', reason: '把题目里的条件一个一个用掉。不符合条件的先排除，最后剩下的就是答案。'
  }; return notes[logicFamily(type)] || notes.reason;
}

function renderPractice(task) {
  const item = task.item; const stats = getStats(item.id);
  const question = item.subject === 'logic' ? nextLogicQuestion(item.type) : generateLanguageQuestion(item, stats.score);
  task.question = question; if (item.subject === 'logic') lesson.lastLogicQuestion = question;
  const stage = item.subject === 'english' ? englishStageNav('play') : item.subject === 'chinese' ? chineseStageNav('练') : logicStageNav(task.stage || '闯');
  const practiceName = item.subject === 'logic' ? (task.stage === '闯' ? '星际挑战' : '图像推理') : (stats.score < 2 ? '引导练习' : '独立挑战');
  const logicNarration = item.subject === 'logic' ? logicQuestionNarration(question) : '';
  const audioButton = item.subject === 'logic' ? `<button class="logic-question-audio icon-only-audio" data-speak-now="${escapeHTML(logicNarration)}" data-lang="zh-CN" aria-label="再听题目">🔊</button>` : question.speak ? `<button class="${item.subject === 'english' ? 'english-question-audio english-action-button listen' : 'listen-round'}" data-speak-now="${escapeHTML(question.speak)}" data-lang="${question.lang}" aria-label="Listen again">🔊</button>` : '';
  if (item.subject === 'logic') {
    $('#lessonContent').innerHTML = `<div class="logic-visual-question ${question.patternMode ? 'pattern-question-stage' : ''}"><span class="sr-only">${question.title}。${question.hint || ''}</span>${audioButton}${question.display ? `<div class="logic-sequence ${question.patternMode ? 'pattern-sequence-shell' : ''}">${question.display}</div>` : ''}<div class="answer-grid logic-picture-choices ${question.patternMode ? 'pattern-choice-grid' : ''}">${question.options.map((option, index) => `<button class="answer-button" data-answer-index="${index}" aria-label="选项 ${index + 1}"><span class="answer-visual">${option.visual}</span></button>`).join('')}</div><div id="answerFeedback"></div></div>`;
  } else if (item.subject === 'english') {
    $('#lessonContent').innerHTML = `${stage}<div class="english-listen-question"><span class="sr-only">Listen and choose.</span>${audioButton}<div class="answer-grid english-scene-choices">${question.options.map((option,index)=>`<button class="answer-button" data-answer-index="${index}" aria-label="Picture ${index + 1}"><span class="answer-visual">${option.visual}</span></button>`).join('')}</div><div id="answerFeedback"></div></div>`;
  } else {
    $('#lessonContent').innerHTML = `${stage}<span class="task-label">${practiceName} · ${CURRICULUM[item.subject].name}</span><h2 class="question-title">${question.title}</h2><p class="question-hint">${question.hint || '仔细观察，再做选择'}</p>${audioButton}${question.display ? `<div class="logic-sequence">${question.display}</div>` : ''}<div class="answer-grid">${question.options.map((option, index) => `<button class="answer-button" data-answer-index="${index}"><span class="answer-visual">${option.visual}</span>${option.label ? `<b>${option.label}</b>` : ''}</button>`).join('')}</div><div id="answerFeedback"></div>`;
  }
  if (item.subject === 'logic') speak(logicNarration,'zh-CN');
  else if (question.autoSpeak) speak(question.speak, question.lang);
}

function generateLanguageQuestion(item, score) {
  const candidates = allSubjectItems(item.subject).filter(other => other.id !== item.id);
  const sameUnit = candidates.filter(other => other.unitIndex === item.unitIndex);
  const sameStage = candidates.filter(other => Math.floor(other.unitIndex / 10) === Math.floor(item.unitIndex / 10));
  const pool = shuffle(sameUnit.length >= 2 ? sameUnit : sameStage.length >= 2 ? sameStage : candidates).slice(0, 2);
  const options = shuffle([item, ...pool]); const correct = options.findIndex(option => option.id === item.id);
  if (item.subject === 'english') {
    const listening = score >= 2;
    const spoken = listening ? englishSentence(item) : item.word;
    return { title:'Listen and choose.', speak:spoken, lang:'en-US', autoSpeak:true, visualOnly:true, englishVisual:true, correct, options:options.map((option,index)=>({visual:englishCartoonScene(option,{variant:index,compact:true}),label:''})) };
  }
  const listening = score >= 2;
  return { title: listening ? '听一听，选出这个汉字' : `哪个字表示“${item.meaning}”？`, hint: listening ? '先听意思，再看字形' : `看图提示：${item.emoji}`, speak: listening ? item.meaning : item.word, lang: 'zh-CN', autoSpeak: listening, correct, options: options.map(option => ({ visual: option.word, label: score < 1 ? option.pinyin : '' })) };
}

function generateLogicQuestion(type) {
  const pick = array => array[Math.floor(Math.random() * array.length)];
  const context = lesson || gameSession;
  const pickSet = array => {
    if (!context) return pick(array);
    context.logicVariantCursor ||= {};
    const index = context.logicVariantCursor[type] || 0;
    context.logicVariantCursor[type] = index + 1;
    return array[index % array.length];
  };
  const pickTheme = array => {
    if (!context) return pick(array);
    context.logicObjectCursor ||= {};
    const index = context.logicObjectCursor[type] || 0;
    context.logicObjectCursor[type] = index + 1;
    return array[index % array.length];
  };
  const choiceQuestion = (title, options, correct, extra = {}) => {
    const shuffled = shuffle(options.map((option, index) => ({ option: typeof option === 'string' ? { visual:option } : option, correct:index === correct })));
    return { title, ...extra, correct:shuffled.findIndex(option => option.correct), options:shuffled.map(option => option.option) };
  };
  const numberQuestion = (title, display, answer, min = 0, max = 100) => {
    const candidates = [answer, Math.max(min, answer - 1), Math.min(max, answer + 1), Math.max(min, answer - 2), Math.min(max, answer + 2)];
    const values = shuffle([...new Set(candidates)]).slice(0, 3);
    if (!values.includes(answer)) values[0] = answer;
    const options = shuffle([...new Set(values)]);
    return { title, display, correct: options.indexOf(answer), options: options.map(value => ({ visual: String(value) })) };
  };
  if (type === 'same') { const target = pickTheme(['🍎','🐟','🚗','🌟','🔺']); const options = shuffle([target, pick(['🍏','🐠','🚙','⭐','🔵']), pick(['🍌','🐰','🚌','🌙','🟨'])]); return { title:'找出完全相同的图案',display:target,correct:options.indexOf(target),options:options.map(x=>({visual:x}))}; }
  if (type === 'different') { const groups = [['🍎','🍎','🍐'],['🐟','🐟','🐦'],['🔴','🔴','🟡'],['🚗','🚗','🚌']]; const row=pickSet(groups); const odd=row[2]; const options=shuffle(row); return {title:'哪一个和其他两个不一样？',correct:options.indexOf(odd),options:options.map(x=>({visual:x}))}; }
  if (type === 'size') { const sets=[{q:'哪一个苹果最大？',n:'apple-red',s:['sm','md','lg'],c:2},{q:'哪辆小汽车最小？',n:'car-coral',s:['sm','lg','md'],c:0},{q:'哪座小房子最大？',n:'house-small',s:['md','sm','lg'],c:2},{q:'哪只小兔最小？',n:'rabbit',s:['lg','sm','md'],c:1}]; const x=pickSet(sets); return choiceQuestion(x.q,x.s.map(scale=>({visual:scaledPicture(x.n,scale),richVisual:true})),x.c,{hint:'把同一种物品放在一起比较'}); }
  if (type === 'length') { const sets=[{q:'哪一条最长？',o:['━━━━━━━━','━━━━━','━━'],c:0},{q:'哪一条最短？',o:['━━━━━━','━━','━━━━'],c:1},{q:'哪支铅笔最长？',o:['✏️━━','✏️━━━━━━','✏️━━━━'],c:1},{q:'哪条小路最短？',o:['━━━━','━━━━━━━━','━━'],c:2}]; const x=pickSet(sets); return choiceQuestion(x.q,x.o,x.c,{hint:'从同一个起点开始比较'}); }
  if (type === 'color') { const rows=[['找出红色的图形','🔴','🔵','🟡'],['找出蓝色的图形','🔵','🟢','🔴'],['找出黄色的图形','🟡','🟣','🟢'],['找出紫色的图形','🟣','🟡','🔵']]; const row=pickSet(rows); return choiceQuestion(row[0],row.slice(1),0); }
  if (type === 'shape') { const rows=[['哪个是三角形？','🔺','🔵','🟨'],['哪个是圆形？','🔵','🔺','🟨'],['哪个是正方形？','🟨','🔵','🔺'],['哪个图形没有角？','⚪','🟨','🔺']]; const row=pickSet(rows); return choiceQuestion(row[0],row.slice(1),0); }
  if (type === 'category') { const groups=[['🍎','🍌','🚗','哪个不是水果？'],['🐶','🐰','🧢','哪个不是动物？'],['👕','👟','🍰','哪个不是衣物？'],['🥛','🪣','🍎','哪个不能装东西？']]; const row=pickSet(groups); const opts=shuffle(row.slice(0,3).map((x,i)=>({x,correct:i===2}))); return {title:row[3],correct:opts.findIndex(x=>x.correct),options:opts.map(x=>({visual:x.x}))}; }
  if (type === 'ab' || type === 'complex') return buildPatternQuestion(type,lesson?.patternThemeHistory || gameSession?.patternThemeHistory || new Set());
  if (['count','count5','count10','count20'].includes(type)) { const limit=type==='count5'?5:type==='count20'?20:type==='count10'?10:6; const floor=limit>10?11:1; const n=floor+Math.floor(Math.random()*(limit-floor+1)); const symbol=pickTheme(['🍎','🐟','🐦','🦆']); return numberQuestion('数一数，一共有几个？',`${symbol} `.repeat(n),n,floor,limit); }
  if (type === 'match') { const n=2+Math.floor(Math.random()*4); return numberQuestion(`${n} 只小兔，每只一根胡萝卜，需要几根？`,`🐰 `.repeat(n),n,1,6); }
  if (type === 'compare') { const a=1+Math.floor(Math.random()*4),b=a+1+Math.floor(Math.random()*2),symbol=pickTheme(['🍎','🐟','🚗','🐦']); return choiceQuestion('哪一组更多？',[{visual:`${symbol} `.repeat(a)},{visual:`${symbol} `.repeat(b)},{visual:'一样多'}],1); }
  if (type === 'instruction') { const sets=[{q:'先点圆形，再点三角形',o:['🔵 → 🔺','🔺 → 🔵','🟨 → 🔵'],c:0},{q:'先选红色，再选黄色',o:['🔴 → 🟡','🟡 → 🔴','🔵 → 🟡'],c:0},{q:'先找小猫，再找小鱼',o:['🐱 → 🐟','🐟 → 🐱','🐶 → 🐟'],c:0},{q:'先拿帽子，再拿鞋子',o:['🧢 → 👟','👟 → 🧢','👕 → 👟'],c:0},{q:'先拿苹果，再拿皮球',o:['🍎 → ⚽','⚽ → 🍎','🍌 → ⚽'],c:0}]; const x=pickSet(sets); return choiceQuestion('听懂指令，选出正确顺序',x.o,x.c,{hint:x.q}); }
  if (type === 'number10') { const n=2+Math.floor(Math.random()*7); return numberQuestion('数字火车缺了哪一节？',`${n-1}　❓　${n+1}`,n,1,10); }
  if (type === 'number-order') { const sets=[{q:'哪一组是从小到大？',o:['2　5　8','8　5　2','5　2　8'],c:0},{q:'哪一组是从大到小？',o:['9　6　3','3　6　9','6　9　3'],c:0},{q:'把 4、1、7 从小到大排好',o:['1　4　7','7　4　1','4　1　7'],c:0},{q:'把 3、6、9 从大到小排好',o:['9　6　3','3　6　9','6　3　9'],c:0}]; const x=pickSet(sets); return choiceQuestion(x.q,x.o,x.c); }
  if (type === 'sort') { const sets=[{q:'哪一组是从短到长？',o:['━　━━　━━━','━━━　━━　━','━━　━　━━━'],c:0},{q:'哪一组是从少到多？',o:['●　●●　●●●','●●●　●●　●','●●　●　●●●'],c:0},{q:'哪一组是从小到大？',o:['🐭　🐰　🐘','🐘　🐰　🐭','🐰　🐭　🐘'],c:0},{q:'哪一组是从多到少？',o:['●●●●　●●　●','●　●●　●●●●','●●　●●●●　●'],c:0}]; const x=pickSet(sets); return choiceQuestion(x.q,x.o,x.c); }
  if (type === 'space') { const sets=[{q:'哪只小兔在盒子里面？',k:['inside','outside','above'],s:'rabbit',r:'box',c:0},{q:'哪只小鸟在小树上面？',k:['above','below','beside'],s:'bird-sun',r:'tree',c:0},{q:'哪只小狗在小猫右边？',k:['left','right','above'],s:'dog',r:'cat',c:1},{q:'哪个皮球在盒子下面？',k:['beside','above','below'],s:'ball',r:'box',c:2}]; const x=pickSet(sets); return choiceQuestion(x.q,x.k.map(kind=>({visual:relationPicture(kind,x.s,x.r),richVisual:true})),x.c); }
  if (type === 'position') { const sets=[{q:'哪只小兔躲在树后面？',k:['behind','front','beside'],s:'rabbit',r:'tree',c:0},{q:'哪只小狗离小屋最近？',k:['near','far','above'],s:'dog',r:'house-small',c:0},{q:'哪只小兔站在两棵树中间？',k:['middle','left','right'],s:'rabbit',r:'tree',c:0},{q:'哪只小猫站在盒子前面？',k:['behind','beside','front'],s:'cat',r:'box',c:2}]; const x=pickSet(sets); return choiceQuestion(x.q,x.k.map(kind=>({visual:relationPicture(kind,x.s,x.r),richVisual:true})),x.c); }
  if (['addition5','addition10'].includes(type)) { const limit=type==='addition5'?5:10; const a=1+Math.floor(Math.random()*(limit-2)); const b=1+Math.floor(Math.random()*(limit-a)); const symbol=pickTheme(['🍎','🐟','🦆','🍪']); return numberQuestion(`左边有 ${a} 个，右边又来 ${b} 个，一共有几个？`,`${`${symbol} `.repeat(a)} ＋ ${`${symbol} `.repeat(b)}`,a+b,0,limit); }
  if (['subtraction5','subtraction10'].includes(type)) { const limit=type==='subtraction5'?5:10; const a=2+Math.floor(Math.random()*(limit-1)); const b=1+Math.floor(Math.random()*(a-1)); const symbol=pickTheme(['🎈','🐦','🦆','🍪']); return numberQuestion(`原来有 ${a} 个，离开 ${b} 个，还剩几个？`,`${`${symbol} `.repeat(a)} － ${`${symbol} `.repeat(b)}`,a-b,0,limit); }
  if (type === 'correspondence') { const n=1+Math.floor(Math.random()*9); const symbol=pickTheme(['🍎','🐟','🐰','🧱']); return numberQuestion('哪张数字卡和图中的物品一样多？',`${symbol} `.repeat(n),n,1,10); }
  if (type === 'number50' || type === 'number100') { const step=pick([1,2,5,10]); const max=type==='number50'?50:100; const start=1+Math.floor(Math.random()*Math.max(1,max-step*2)); const answer=start+step; return numberQuestion('按照规律，空格里是几？',`${start}　❓　${start+step*2}`,answer,1,max); }
  if (type === 'arithmetic20') { const add=Math.random()>.5; const a=add?6+Math.floor(Math.random()*8):11+Math.floor(Math.random()*9); const b=1+Math.floor(Math.random()*(add?20-a:a-1)); const answer=add?a+b:a-b; return numberQuestion(`${a} ${add?'＋':'－'} ${b} ＝？`,'🧮',answer,0,20); }
  if (type === 'word-problem') { const sets=[{q:'车上有 6 人，又上来 3 人，现在有几人？',d:'🚌  6 ＋ 3',a:9},{q:'盘里有 8 块饼干，吃掉 2 块，还剩几块？',d:'🍪  8 － 2',a:6},{q:'池塘里有 5 只鸭，又游来 4 只，一共有几只？',d:'🦆  5 ＋ 4',a:9},{q:'树上有 10 只鸟，飞走 3 只，还剩几只？',d:'🐦  10 － 3',a:7}]; const x=pickSet(sets); return numberQuestion(x.q,x.d,x.a,0,20); }
  if (type === 'geometry2d') { const sets=[{q:'哪个图形有 3 条边？',o:['🔺','🟨','⚪'],c:0},{q:'哪个图形没有角？',o:['⚪','🔺','🟨'],c:0},{q:'哪个图形有 4 条一样长的边？',o:['🟨','🔺','⚪'],c:0},{q:'哪个图形可以像车轮一样转？',o:['🔵','🟨','🔺'],c:0}]; const x=pickSet(sets); return choiceQuestion(x.q,x.o,x.c); }
  if (type === 'geometry3d') { const sets=[{q:'哪个物体可以向各个方向滚动？',o:['⚽','🧊','🎁'],c:0},{q:'哪个最像正方体？',o:['🧊','🥫','⚽'],c:0},{q:'哪个物体既能滚动，也能立起来？',o:['🥫','⚽','🧊'],c:0},{q:'哪个物体最适合稳稳叠高？',o:['🎁','⚽','🥫'],c:0}]; const x=pickSet(sets); return choiceQuestion(x.q,x.o,x.c); }
  if (type === 'transform') { const sets=[{q:'箭头向右转一次，会指向哪里？',d:'⬆️  ↷',o:['➡️','⬅️','⬇️'],c:0},{q:'哪个图案左右对称？',d:'沿中线对折',o:['🦋','🌙','↗️'],c:0},{q:'向左的箭头转半圈，会指向哪里？',d:'⬅️  ↻ 半圈',o:['➡️','⬆️','⬇️'],c:0},{q:'向下的箭头向左转一次，会指向哪里？',d:'⬇️  ↶',o:['➡️','⬅️','⬆️'],c:0}]; const x=pickSet(sets); return choiceQuestion(x.q,x.o,x.c,{display:x.d}); }
  if (type === 'measure') { const sets=[{q:'哪条彩带最长？',o:[{visual:'<span class="logic-ribbon ribbon-sm"></span>',richVisual:true},{visual:'<span class="logic-ribbon ribbon-lg"></span>',richVisual:true},{visual:'<span class="logic-ribbon ribbon-md"></span>',richVisual:true}],c:1},{q:'哪一个杯子里的水最多？',o:[{visual:capacityPicture(1),richVisual:true},{visual:capacityPicture(3),richVisual:true},{visual:capacityPicture(2),richVisual:true}],c:1},{q:'哪一摞积木最高？',o:[{visual:heightPicture(1),richVisual:true},{visual:heightPicture(3),richVisual:true},{visual:heightPicture(2),richVisual:true}],c:1},{q:'哪个水桶装得最少？',o:[{visual:capacityPicture(3,'bucket'),richVisual:true},{visual:capacityPicture(2,'bucket'),richVisual:true},{visual:capacityPicture(1,'bucket'),richVisual:true}],c:2}]; const x=pickSet(sets); return choiceQuestion(x.q,x.o,x.c,{hint:'把起点对齐，再认真比较'}); }
  if (type === 'statistics') { const rows=[{q:'哪种水果最多？',d:'苹果　●●●●<br>香蕉　●●<br>葡萄　●●●',o:['苹果','香蕉','葡萄'],c:0},{q:'哪两种一样多？',d:'小猫　●●●<br>小狗　●●<br>小兔　●●',o:['小狗和小兔','小猫和小狗','小猫和小兔'],c:0},{q:'哪种玩具最少？',d:'皮球　●●●<br>积木　●<br>风筝　●●',o:['积木','皮球','风筝'],c:0},{q:'哪种小动物最少？',d:'小鸟　●●<br>小鸭　●●●●<br>小鱼　●●●',o:['小鸟','小鸭','小鱼'],c:0}]; const x=pickSet(rows); return choiceQuestion(x.q,x.o,x.c,{display:x.d}); }
  if (type === 'order') { const sets=[{q:'早上起床后，先做什么？',o:['刷牙','睡觉','吃晚饭'],c:0},{q:'种下一颗种子以后，会发生什么？',o:['发芽','回到种子袋','变成石头'],c:0},{q:'吃饭以前应该先做什么？',o:['洗手','睡觉','穿雨衣'],c:0},{q:'下雨时出门以前先穿什么？',o:['穿雨衣','睡觉','吃晚饭'],c:0}]; const x=pickSet(sets); return choiceQuestion(x.q,x.o,x.c); }
  const sets=[{q:'小红帽戴红帽子。哪个是小红帽？',o:['🔴','🔵','🟡'],c:0},{q:'不是圆形，也不是蓝色。选哪个？',o:['🔴','🟦','🔺'],c:2},{q:'会游泳，但不是小鸟。选哪个？',o:['🐟','🐦','🐰'],c:0},{q:'有四条边，而且是黄色。选哪个？',o:['🟨','🔺','🔵'],c:0}]; const x=pickSet(sets); return choiceQuestion(x.q,x.o,x.c);
}

function logicQuestionSignature(question) {
  const optionSet = question.options.map(option => `${option.visual}|${option.label || ''}`).sort();
  return [question.title,question.display || '',...optionSet].join('::');
}

function uniqueLogicQuestion(type, history = new Set()) {
  let question;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    question = generateLogicQuestion(type);
    const signature = logicQuestionSignature(question);
    if (!history.has(signature)) { history.add(signature); return enrichLogicQuestion(question,type); }
  }
  history.add(logicQuestionSignature(question)); return enrichLogicQuestion(question,type);
}

function nextLogicQuestion(type) { return uniqueLogicQuestion(type,lesson?.logicQuestionHistory || new Set()); }
function logicQuestionNarration(question, instruction = '') { return [question.speak || question.title,question.speak ? '' : question.hint,instruction].filter(Boolean).join('。'); }

function recordAnswer(item, correct) {
  const old = getStats(item.id); const intervals = [0, 1, 3, 7, 14];
  const score = correct ? Math.min(4, old.score + 1) : Math.max(0, old.score - 1);
  const due = new Date(); due.setDate(due.getDate() + intervals[score]);
  state.mastery[item.id] = { score, attempts: old.attempts + 1, correct: old.correct + (correct ? 1 : 0), streak: correct ? old.streak + 1 : 0, last: todayKey(), due: due.getTime() };
  saveState();
}

function handleAnswer(button, index) {
  const task = lesson.tasks[lesson.index]; if (task.answered) return; task.answered = true;
  const correct = index === task.question.correct; const isEnglish = task.item.subject === 'english'; $$('.answer-button').forEach(b => b.disabled = true);
  if (correct) {
    button.classList.add('correct'); lesson.correct += 1; lesson.stars += 1; state.stars += 1; recordAnswer(task.item, true); speak(isEnglish ? 'Great job!' : '答对了，你真的理解了',isEnglish ? 'en-US' : 'zh-CN');
    celebrate(button);
    $('#answerFeedback').innerHTML = task.question.visualOnly ? `<div class="logic-result-mark success" aria-label="${isEnglish ? 'Correct' : '答对了'}">✓</div><button class="lesson-next icon-next" data-next-task aria-label="${isEnglish ? 'Continue' : '继续'}">›</button>` : `<div class="feedback-box">答对了！${masteryLabel(getStats(task.item.id).score)} <button class="lesson-next" data-next-task>继续</button></div>`;
  } else {
    button.classList.add('wrong'); const right = $$('.answer-button')[task.question.correct]; right.classList.add('correct'); lesson.wrong += 1; recordAnswer(task.item, false); speak(isEnglish ? 'Listen once more.' : '没关系，我们再学一次',isEnglish ? 'en-US' : 'zh-CN');
    if (task.retry < 1) {
      const retryTasks = task.item.subject === 'logic' ? [{ kind: 'logic-manipulate', item: task.item }, { kind: 'practice', item: task.item, retry: task.retry + 1, stage: '闯' }] : [{ kind: 'teach', item: task.item }, { kind: 'practice', item: task.item, retry: task.retry + 1 }];
      lesson.tasks.splice(Math.min(lesson.index + 3, lesson.tasks.length), 0, ...retryTasks);
    }
    $('#answerFeedback').innerHTML = task.question.visualOnly ? `<div class="logic-result-mark gentle" aria-label="${isEnglish ? 'Listen again' : '看看正确答案'}">↻</div><button class="lesson-next icon-next" data-next-task aria-label="${isEnglish ? 'Continue' : '继续'}">›</button>` : `<div class="feedback-box">没关系，正确答案已经亮起来了。稍后熊猫团团会换一种方式再教一次。<button class="lesson-next" data-next-task>我知道了</button></div>`;
  }
  $('#sessionStars').textContent = lesson.stars; saveState();
}

function nextTask() { cancelVoiceRecording(); lesson.index += 1; renderLesson(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

async function requestLessonLandscape() {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.(); } catch (_) {}
  try { await screen.orientation?.lock?.('landscape'); } catch (_) {}
  const english = document.body.classList.contains('english-lesson-active');
  showToast(matchMedia('(orientation: landscape)').matches ? (english ? 'Landscape lesson ready' : '横屏课堂已打开') : (english ? 'Turn your phone sideways' : '请把手机横过来学习'));
}

function renderLessonSummary() {
  $('#lessonProgress').style.width = '100%';
  const reviewed = lesson.tasks.filter(t => t.kind === 'practice').length; const accuracy = Math.round(lesson.correct / Math.max(lesson.correct + lesson.wrong, 1) * 100);
  const englishOnly = lesson.tasks.some(task => task.item?.subject === 'english') && !lesson.tasks.some(task => task.item?.subject && task.item.subject !== 'english');
  $('#lessonContent').innerHTML = englishOnly
    ? `<span class="lesson-summary-emoji">${accuracy >= 80 ? '🌈' : '🌱'}</span><h2>${accuracy >= 80 ? 'Wonderful work!' : 'You kept trying!'}</h2><p class="teach-meaning">Listen, speak, play, and read a little every day.</p><div class="summary-list"><div class="summary-item"><span>Practice</span><b>${reviewed}</b></div><div class="summary-item"><span>Accuracy</span><b>${accuracy}%</b></div><div class="summary-item"><span>Stars</span><b>⭐ ${lesson.stars}</b></div></div><div class="summary-actions"><button class="soft-button" data-finish="english-world">Map</button><button class="lesson-next" data-finish="home">Done</button></div>`
    : `<span class="lesson-summary-emoji">${accuracy >= 80 ? '🌈' : '🌱'}</span><h2>${accuracy >= 80 ? '今天学得很扎实！' : '今天认真努力了！'}</h2><p class="teach-meaning">学习不是一次全对，而是每次都多懂一点。</p><div class="summary-list"><div class="summary-item"><span>完成练习</span><b>${reviewed} 次</b></div><div class="summary-item"><span>本次正确率</span><b>${accuracy}%</b></div><div class="summary-item"><span>获得星星</span><b>⭐ ${lesson.stars}</b></div></div><div class="summary-actions"><button class="soft-button" data-finish="curriculum">看看成长地图</button><button class="lesson-next" data-finish="home">完成学习</button></div>`;
  requestAnimationFrame(() => celebrate($('.lesson-summary-emoji'),['⭐','🌈','✨','⭐','🌱','✨','⭐','🌟']));
  if (!lesson.completed) completeLesson();
}

function completeLesson() {
  lesson.completed = true; state.sessions += 1; state.totalMinutes += Math.max(1, Math.round((Date.now() - lesson.startedAt) / 60000));
  if (!state.studyDates.includes(todayKey())) state.studyDates.push(todayKey());
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); const yesterdayKey = yesterday.toISOString().slice(0,10);
  if (state.lastStudy !== todayKey()) state.streak = state.lastStudy === yesterdayKey ? state.streak + 1 : 1;
  state.lastStudy = todayKey();
  Object.keys(CURRICULUM).forEach(subject => { state.viewStages[subject] = stageStartFor(subject,currentUnitIndex(subject)); });
  saveState(); renderHome();
}

function renderReport() {
  const items = allItems(); const attempts = Object.values(state.mastery).reduce((s,x)=>s+x.attempts,0); const correct = Object.values(state.mastery).reduce((s,x)=>s+x.correct,0); const mastered = items.filter(i=>getStats(i.id).score>=4).length;
  $('#reportStats').innerHTML = `<div class="stat-card"><strong>${state.studyDates.length}</strong><span>累计学习天数</span></div><div class="stat-card"><strong>${state.sessions}</strong><span>完成学习次数</span></div><div class="stat-card"><strong>${mastered}</strong><span>掌握知识点</span></div><div class="stat-card"><strong>${attempts ? Math.round(correct/attempts*100) : 0}%</strong><span>累计正确率</span></div>`;
  $('#masteryReport').innerHTML = Object.entries(CURRICULUM).map(([key,s])=>{const total=subjectProgress(key);const current=stageProgress(key);return `<div class="mastery-report-row"><b>${s.icon} ${s.short}</b><span class="report-track" style="--subject-color:${s.color}"><i style="--value:${current}%"></i></span><span><strong>本阶段 ${current}%</strong><small>全课程 ${total}%</small></span></div>`}).join('');
  const weak = items.filter(i=>getStats(i.id).attempts>=2).sort((a,b)=>(getStats(a.id).correct/getStats(a.id).attempts)-(getStats(b.id).correct/getStats(b.id).attempts)).slice(0,3);
  $('#teacherAdvice').innerHTML = weak.length ? `最近需要多陪伴的内容是：<b>${weak.map(i=>i.subject==='logic'?i.unit.title:`${i.word}（${i.meaning}）`).join('、')}</b>。系统已经把它们放入后续复习。建议家长只做生活中的指认和对话，不要求抄写，也不要在答错时立即给答案。` : '现在正处于建立学习记录的阶段。建议每天固定一个轻松的时间学习 10–15 分钟，结束后请孩子说一说今天认识的新朋友。完成三次学习后，这里会给出针对性的复习建议。';
}

const GAME_LEVELS = {
  english: [
    ['听音寻宝','听声音找到正确图片','🔊'],['词图配对','把英语单词和图片连起来','🧩'],['快闪识词','看到图片快速认出单词','⚡'],['情境对话','在小故事里选择正确表达','💬'],['句型火车','为主题短句补上核心单词','🚂'],['绘本跟读','听读整句并理解画面','📖'],['首音侦探','听辨单词开头的声音','👂'],['拼读工坊','连接字母音并读出单词','🔤'],['句图理解','读短句并选择正确画面','🖼️'],['高频词星球','在句子中快速认出高频词','⭐'],['故事排序','根据语意找到下一页','🗂️'],['阅读理解','听读小绘本并回答问题','🏆']
  ],
  chinese: [
    ['看图寻字','从生活图画找到对应汉字','🔍'],['听音找字','听读音辨认正确字形','👂'],['字图配对','看到汉字理解它的意思','🀄'],['词语列车','把汉字放进常用词语','🚂'],['生活字卡','在生活场景中认出汉字','🏠'],['识字寻宝','综合图、音、义完成挑战','🗝️']
  ],
  logic: [
    ['观察侦探','寻找相同、不同和明显特征','🔎'],['分类工坊','按颜色、形状和用途整理','🧺'],['数感果园','点数并匹配 1–10','🍓'],['对应擂台','用一一对应比较数量','⚖️'],['指令列车','听指令并完成排序','🚂'],['规律接龙','完成 AB、AAB 和 ABB 规律','🟦'],['空间基地','辨认方位与图形变化','🧭'],['运算补给站','完成 10 以内加减启蒙','🧮'],['百数探测器','探索 1–100 数序规律','💯'],['图形实验室','认识平面与立体图形','🧊'],['测量统计站','比较测量并读懂简单图表','📊'],['综合推理飞船','解决应用题与条件推理','🚀']
  ]
};
const GAME_THEME = {
  english: { name:'英语声音岛', icon:'🦊', note:'先听懂，再认词，最后进入句子和绘本。' },
  chinese: { name:'汉字寻宝岛', icon:'🐼', note:'从图像和声音出发，把汉字用进生活词语。' },
  logic: { name:'思维探索岛', icon:'🤖', note:'先观察和操作，再进入数感、规律与推理。' }
};

function gameKey(subject, level) { return `${subject}-${level}`; }
function gameStars(subject, level) { return state.gameProgress[gameKey(subject, level)] || 0; }
function gameLevelUnlocked(subject, level) { return level === 0 || gameStars(subject, level - 1) >= 2; }

function renderGameHub() {
  gameSession = null;
  $('#progressiveGame').hidden = true; $('#gameRoutePanel').hidden = false;
  $('#gameSubjectTabs').innerHTML = Object.entries(GAME_THEME).map(([key, theme]) => `<button class="${key === activeGameSubject ? 'active' : ''}" data-game-subject="${key}"><span>${theme.icon}</span><b>${CURRICULUM[key].short}</b></button>`).join('');
  const theme = GAME_THEME[activeGameSubject]; const earned = GAME_LEVELS[activeGameSubject].reduce((sum, _, level) => sum + gameStars(activeGameSubject, level), 0);
  $('#gameRouteHeading').innerHTML = `<div><span class="route-mascot">${theme.icon}</span><div><p class="eyebrow">${theme.name}</p><h2>${theme.note}</h2></div></div><b>⭐ ${earned} / ${GAME_LEVELS[activeGameSubject].length * 3}</b>`;
  $('#gameLevelMap').innerHTML = GAME_LEVELS[activeGameSubject].map((level, index) => {
    const unlocked = gameLevelUnlocked(activeGameSubject, index); const stars = gameStars(activeGameSubject, index);
    return `<article class="game-level ${!unlocked ? 'locked' : stars ? 'completed' : index === 0 || gameStars(activeGameSubject, index - 1) ? 'current' : ''}"><span class="level-path-number">${stars ? '✓' : unlocked ? index + 1 : '🔒'}</span><span class="level-toy">${unlocked ? level[2] : '🔒'}</span><div><small>第 ${index + 1} 关</small><h3>${level[0]}</h3><p>${level[1]}</p><div class="level-stars">${[1,2,3].map(n => `<i class="${n <= stars ? 'earned' : ''}">★</i>`).join('')}</div></div><button data-start-game="${activeGameSubject}:${index}" ${!unlocked ? 'disabled' : ''}>${stars ? '再玩一次' : '开始挑战'}</button></article>`;
  }).join('');
}

function gamePool(subject) {
  const unlocked = allSubjectItems(subject).filter(item => unitUnlocked(subject, item.unitIndex));
  return unlocked.length >= 6 ? unlocked : allSubjectItems(subject).slice(0, 12);
}

function startProgressiveGame(subject, level) {
  let source = gamePool(subject);
  if (subject === 'english' && level >= 6) {
    const range = level === 9 ? [39, 40] : level >= 10 ? [20, 40] : [30, 39];
    source = allSubjectItems('english').filter(item => item.unitIndex >= range[0] && item.unitIndex < range[1]);
  }
  const pool = shuffle(source);
  gameSession = { subject, level, round: 0, correct: 0, items: pool.slice(0, 5), logicQuestionHistory: new Set(), logicVariantCursor: {}, patternThemeHistory: new Set(), logicSceneHistory: new Set(), answered: false };
  $('#gameRoutePanel').hidden = true; $('#progressiveGame').hidden = false;
  $('#gamePlayTitle').textContent = `${GAME_THEME[subject].name} · ${GAME_LEVELS[subject][level][0]}`;
  renderGameRound(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function languageGameOptions(item, render, count = 3) {
  const available = allSubjectItems(item.subject).filter(other => other.id !== item.id);
  const sameUnit = available.filter(other => other.unitIndex === item.unitIndex);
  const sameStage = available.filter(other => Math.floor(other.unitIndex / 10) === Math.floor(item.unitIndex / 10));
  const source = sameUnit.length >= count - 1 ? sameUnit : sameStage.length >= count - 1 ? sameStage : available;
  const others = shuffle(source).slice(0, count - 1);
  const choices = shuffle([item, ...others]);
  return { correct: choices.findIndex(choice => choice.id === item.id), options: choices.map(render) };
}

function buildEnglishGame(item, level) {
  const sentence = englishSentence(item); const reader = englishReaderLines(item);
  const scenes = () => languageGameOptions(item,x=>({visual:englishCartoonScene(x,{variant:x.itemIndex || 0,compact:true}),label:''}));
  const words = () => languageGameOptions(item,x=>({visual:escapeHTML(x.word),label:''}));
  if (level === 0) return {title:'Listen and choose.',speak:item.word,autoSpeak:true,visualOnly:true,...scenes()};
  if (level === 1) return {title:'Match the word.',speak:item.word,autoSpeak:true,display:`<strong>${escapeHTML(item.word)}</strong>`,visualOnly:true,...scenes()};
  if (level === 2) return {title:'Choose the word.',speak:item.word,display:englishCartoonScene(item,{compact:true}),visualOnly:true,...words()};
  if (level === 3) return {title:'Listen and choose.',speak:sentence,autoSpeak:true,display:englishCartoonScene(item,{caption:sentence,compact:true}),visualOnly:true,...scenes()};
  if (level === 4) return {title:'Complete the sentence.',speak:sentence,display:replaceEnglishWord(escapeHTML(sentence),escapeHTML(item.word),'_____'),visualOnly:true,...words()};
  if (level === 5) return {title:'Listen to the page.',speak:sentence,autoSpeak:true,display:englishCartoonScene(item,{caption:sentence,compact:true}),visualOnly:true,...scenes()};
  if (level === 6) return {title:'Find the first sound.',speak:item.word,autoSpeak:true,display:`<strong>${item.word[0].toUpperCase()} ${item.word[0].toLowerCase()}</strong>`,visualOnly:true,...scenes()};
  if (level === 7) return {title:'Blend and read.',speak:item.word,autoSpeak:true,display:`<strong>${escapeHTML(item.phonics || item.word)}</strong>`,visualOnly:true,...words()};
  if (level === 8) return {title:'Match the sentence.',speak:sentence,autoSpeak:true,display:`<strong>${escapeHTML(sentence)}</strong>`,visualOnly:true,...scenes()};
  if (level === 9) return {title:'Find the word.',speak:sentence,autoSpeak:true,display:replaceEnglishWord(escapeHTML(sentence),escapeHTML(item.word),'_____'),visualOnly:true,...words()};
  if (level === 10) return {title:'Find the next page.',speak:reader[1],autoSpeak:true,display:englishCartoonScene(item,{caption:reader[0],compact:true}),visualOnly:true,...languageGameOptions(item,x=>({visual:englishCartoonScene(x,{caption:englishReaderLines(x)[1],compact:true}),label:''}))};
  return {title:'Listen to the story and choose.',speak:`${reader[0]} ${englishSentence(item)}`,autoSpeak:true,visualOnly:true,...scenes()};
}

function buildChineseGame(item, level) {
  const base = languageGameOptions(item, x => ({visual:x.word,label:level === 1 ? '' : x.pinyin}));
  if (level === 0) return { title:`图中藏着哪个汉字？`, hint:`画面提示：${item.emoji} ${item.meaning}`, display:item.emoji, ...base };
  if (level === 1) return { title:'听一听，找到正确的汉字', hint:'点小喇叭可以再听一次', speak:item.word, autoSpeak:true, ...base };
  if (level === 2) return { title:`“${item.word}”表示什么？`, hint:'把字形和图画配在一起', display:item.word, ...languageGameOptions(item, x => ({visual:x.emoji,label:x.meaning})) };
  const phraseChoices = languageGameOptions(item, x => ({visual:chinesePhrases(x)[0],label:''}));
  if (level === 3) return { title:`哪个词语里藏着“${item.word}”？`, hint:'开动词语小火车', display:'🚂', ...phraseChoices };
  if (level === 4) return { title:`生活里看到 ${item.emoji}，应该拿哪张字卡？`, hint:item.meaning, display:`🏠 ${item.emoji}`, ...base };
  return { title:'听意思，找到宝箱里的汉字', hint:`提示：${item.meaning}`, speak:item.meaning, autoSpeak:true, display:'🗝️', ...base };
}

function buildLogicGame(item, level) {
  const types = [
    ['same','different','size','length'],['color','shape','category'],['count5','count10'],['match','compare','correspondence'],
    ['instruction','number-order','sort'],['ab','complex'],['space','position','transform'],['addition5','subtraction5','addition10','subtraction10'],
    ['number50','number100','count20'],['geometry2d','geometry3d'],['measure','statistics'],['arithmetic20','word-problem','reason','deduction']
  ][level];
  const type = shuffle(types)[0];
  return uniqueLogicQuestion(type,gameSession.logicQuestionHistory);
}

function renderGameRound() {
  if (gameSession.round >= gameSession.items.length) { renderGameResult(); return; }
  const { subject, level, round, items } = gameSession; const item = items[round];
  const question = subject === 'english' ? buildEnglishGame(item, level) : subject === 'chinese' ? buildChineseGame(item, level) : buildLogicGame(item, level);
  gameSession.question = question; gameSession.answered = false;
  $('#gameCorrectCount').textContent = gameSession.correct; $('#gameRoundProgress').style.width = `${round / items.length * 100}%`;
  const sceneClass = `${subject}-game-scene level-${level + 1}`;
  const gameNarration = subject === 'logic' ? logicQuestionNarration(question) : question.speak;
  if (subject === 'logic') {
    $('#gamePlayContent').innerHTML = `<div class="logic-game-visual ${question.patternMode ? 'pattern-question-stage' : ''}"><span class="sr-only">${question.title}。${question.hint || ''}</span><div class="game-round-dots" aria-label="第 ${round + 1} 轮，共 ${items.length} 轮">${items.map((_,index) => `<i class="${index <= round ? 'done' : ''}"></i>`).join('')}</div>${gameNarration ? `<button class="game-listen icon-only-audio" data-speak-now="${escapeHTML(gameNarration)}" data-lang="zh-CN" aria-label="再听题目">🔊</button>` : ''}${question.display ? `<div class="game-question-display ${question.patternMode ? 'pattern-sequence-shell' : ''}">${question.display}</div>` : ''}<div class="game-choice-grid logic-picture-choices ${question.patternMode ? 'pattern-choice-grid' : ''}">${question.options.map((option,index)=>`<button data-game-choice="${index}" aria-label="选项 ${index + 1}"><span>${option.visual}</span></button>`).join('')}</div><div id="gameFeedback"></div></div>`;
  } else if (subject === 'english') {
    $('#gamePlayContent').innerHTML = `<div class="english-game-visual"><span class="sr-only">${question.title}</span><div class="game-round-dots" aria-label="Round ${round + 1} of ${items.length}">${items.map((_,index)=>`<i class="${index <= round ? 'done' : ''}"></i>`).join('')}</div>${gameNarration ? `<button class="english-action-button listen english-game-listen" data-speak-now="${escapeHTML(gameNarration)}" data-lang="en-US" aria-label="Listen again">🔊</button>` : ''}${question.display ? `<div class="english-game-display">${question.display}</div>` : ''}<div class="game-choice-grid english-game-choices">${question.options.map((option,index)=>`<button data-game-choice="${index}" aria-label="Picture ${index + 1}"><span>${option.visual}</span></button>`).join('')}</div><div id="gameFeedback"></div></div>`;
  } else {
    $('#gamePlayContent').innerHTML = `<div class="game-round-label">第 ${round + 1} / ${items.length} 轮</div><div class="${sceneClass}"><span class="game-scene-mascot">${GAME_THEME[subject].icon}</span>${question.display ? `<div class="game-question-display">${question.display}</div>` : '<div class="game-question-display sound-rings">♪</div>'}</div><h2>${question.title}</h2><p>${question.hint || '仔细观察，再做选择'}</p>${gameNarration ? `<button class="game-listen" data-speak-now="${escapeHTML(gameNarration)}" data-lang="${subject === 'english' ? 'en-US' : 'zh-CN'}">🔊 再听一次</button>` : ''}<div class="game-choice-grid${question.compact ? ' compact' : ''}">${question.options.map((option,index)=>`<button data-game-choice="${index}"><span>${option.visual}</span>${option.label ? `<small>${option.label}</small>` : ''}</button>`).join('')}</div><div id="gameFeedback"></div>`;
  }
  if (subject === 'logic' || (subject === 'english' && gameNarration) || question.autoSpeak) setTimeout(() => speak(gameNarration, subject === 'english' ? 'en-US' : 'zh-CN'), 180);
}

function handleGameChoice(button, index) {
  if (!gameSession || gameSession.answered) return; gameSession.answered = true;
  const correct = index === gameSession.question.correct; const buttons = $$('.game-choice-grid button'); buttons.forEach(choice => choice.disabled = true);
  buttons[gameSession.question.correct]?.classList.add('correct');
  const english = gameSession.subject === 'english';
  if (correct) { gameSession.correct += 1; button.classList.add('correct'); celebrate(button); speak(english ? 'Great job!' : '答对啦，继续出发',english ? 'en-US' : 'zh-CN'); }
  else { button.classList.add('wrong'); speak(english ? 'Listen once more.' : '没关系，看看亮起来的答案',english ? 'en-US' : 'zh-CN'); }
  $('#gameCorrectCount').textContent = gameSession.correct;
  $('#gameFeedback').innerHTML = gameSession.subject === 'logic' ? `<div class="logic-result-mark ${correct ? 'success' : 'gentle'}" aria-label="${correct ? '答对了' : '看看正确答案'}">${correct ? '✓' : '↻'}</div><button class="lesson-next icon-next" data-next-game-round aria-label="${gameSession.round === gameSession.items.length - 1 ? '查看成绩' : '下一轮'}">›</button>` : english ? `<div class="logic-result-mark ${correct ? 'success' : 'gentle'}" aria-label="${correct ? 'Correct' : 'Listen again'}">${correct ? '✓' : '↻'}</div><button class="lesson-next icon-next" data-next-game-round aria-label="Next">›</button>` : `<div class="game-feedback ${correct ? 'success' : 'gentle'}"><b>${correct ? '太棒了！' : '找到方法了！'}</b><span>${correct ? '你又点亮了一颗小星星。' : '记住这个答案，下一轮继续加油。'}</span></div><button class="lesson-next" data-next-game-round>${gameSession.round === gameSession.items.length - 1 ? '看看成绩' : '下一轮'}</button>`;
}

function nextGameRound() { gameSession.round += 1; renderGameRound(); }

function renderGameResult() {
  const score = gameSession.correct; const earned = score === 5 ? 3 : score >= 3 ? 2 : 1; const key = gameKey(gameSession.subject, gameSession.level);
  state.gameProgress[key] = Math.max(gameStars(gameSession.subject, gameSession.level), earned); state.stars += earned; saveState();
  $('#gameRoundProgress').style.width = '100%'; $('#gameCorrectCount').textContent = score;
  const passed = score >= 3; const hasNext = passed && gameSession.level < GAME_LEVELS[gameSession.subject].length - 1;
  if (gameSession.subject === 'english') {
    const action = hasNext ? '<button class="english-action-button next" data-next-game-level aria-label="Next level">›</button>' : '<button class="english-action-button playback" data-replay-game aria-label="Play again">↻</button>';
    $('#gamePlayContent').innerHTML = `<div class="game-result english-game-result"><span class="result-mascot">★</span><h2>${passed ? 'Great job!' : 'Let\'s try again!'}</h2><div class="result-stars">${[1,2,3].map(n=>`<i class="${n<=earned?'earned':''}">★</i>`).join('')}</div><p>${score} / 5</p><div><button class="english-action-button done" data-close-game aria-label="Back">✓</button>${action}</div></div>`;
    requestAnimationFrame(() => celebrate($('.result-mascot'))); $('#starCount').textContent = state.stars; return;
  }
  const action = hasNext ? '<button class="lesson-next" data-next-game-level>下一关</button>' : `<button class="lesson-next" data-replay-game>${passed ? '再玩一次' : '再练一次'}</button>`;
  $('#gamePlayContent').innerHTML = `<div class="game-result"><span class="result-mascot">${GAME_THEME[gameSession.subject].icon}</span><h2>${score >= 4 ? '这一关完成得很棒！' : passed ? '达到解锁标准啦！' : '已经找到不少方法了！'}</h2><div class="result-stars">${[1,2,3].map(n=>`<i class="${n<=earned?'earned':''}">★</i>`).join('')}</div><p>答对 ${score} / 5 题，获得 ${earned} 颗闯关星。${passed ? '下一关已经解锁。' : '答对 3 题就能解锁下一关。'}</p><div><button class="soft-button" data-close-game>回到地图</button>${action}</div></div>`;
  requestAnimationFrame(() => celebrate($('.result-mascot')));
  $('#starCount').textContent = state.stars;
}

document.addEventListener('click', event => {
  const nav = event.target.closest('[data-nav]'); if (nav) { navigate(nav.dataset.nav); return; }
  const card = event.target.closest('[data-subject-card]'); if (card) { state.activeSubject=card.dataset.subjectCard;saveState();navigate(SUBJECT_WORLDS[state.activeSubject] || 'curriculum');return; }
  const world = event.target.closest('[data-open-world]'); if (world) { state.activeSubject=world.dataset.openWorld;saveState();navigate(SUBJECT_WORLDS[state.activeSubject] || 'curriculum');return; }
  const stageView = event.target.closest('[data-view-stage]'); if (stageView) { const [subject,index] = stageView.dataset.viewStage.split(':'); state.viewStages[subject] = Number(index); state.activeSubject = subject; saveState(); navigate(SUBJECT_WORLDS[subject]); requestAnimationFrame(() => document.querySelector(`[data-stage-anchor="${subject}:${index}"]`)?.scrollIntoView({ behavior:'smooth', block:'start' })); return; }
  const stageEntry = event.target.closest('[data-set-entry-stage]'); if (stageEntry) { const [subject,index] = stageEntry.dataset.setEntryStage.split(':'); state.entryStages[subject] = Number(index); state.viewStages[subject] = Number(index); state.activeSubject = subject; saveState(); navigate(SUBJECT_WORLDS[subject]); showToast('学习起点已更新'); return; }
  const unit = event.target.closest('[data-start-unit]'); if (unit) { const [subject,index]=unit.dataset.startUnit.split(':');startUnitLesson(subject,Number(index));return; }
  const gameSubject = event.target.closest('[data-game-subject]'); if (gameSubject) { activeGameSubject = gameSubject.dataset.gameSubject; renderGameHub(); return; }
  const gameStart = event.target.closest('[data-start-game]'); if (gameStart) { const [subject,index] = gameStart.dataset.startGame.split(':'); startProgressiveGame(subject,Number(index)); return; }
  const speakButton = event.target.closest('[data-speak-now]'); if (speakButton) { speak(speakButton.dataset.speakNow,speakButton.dataset.lang);return; }
  const reveal = event.target.closest('[data-reveal-character]'); if (reveal) { const character = reveal.dataset.revealCharacter; const meaning = reveal.dataset.revealMeaning || `${character}字`; celebrate(reveal,['✨','⭐','✨','🌟']); reveal.disabled = true; reveal.style.display = 'none'; $('#characterReveal').innerHTML = `<div class="character-reveal"><span>${character}</span><p>${reveal.dataset.revealVisual || ''} 原来是“${character}”！这幅图表示“${escapeHTML(meaning)}”。</p><button class="lesson-next" data-next-task>去认识它</button></div>`; speak(`${character}，${meaning}`, 'zh-CN'); return; }
  if (event.target.closest('[data-clear-trace]')) { $('#traceCanvas')?._clearTrace?.(); return; }
  const speaking = event.target.closest('[data-start-speaking]'); if (speaking) { startSpeakingCheck(speaking.dataset.startSpeaking,speaking.dataset.speakingLang || 'en-US'); return; }
  if (event.target.closest('[data-stop-recording]')) { finishVoiceRecording(voiceRecording?.lang?.toLowerCase().startsWith('en') ? 'Now listen to your voice.' : '录好了，先听听自己的声音，再决定要不要重录。'); return; }
  if (event.target.closest('[data-play-recording]')) { const audio = $('#recordedVoice'); if (audio) { audio.currentTime = 0; audio.play(); } return; }
  if (event.target.closest('[data-record-again]')) { if (voiceRecording?.target) startSpeakingCheck(voiceRecording.target,voiceRecording.lang); return; }
  if (event.target.closest('[data-finish-speaking]')) { nextTask(); return; }
  if (event.target.closest('[data-next-demo-step]')) { const task = lesson.tasks[lesson.index]; task.demoStep = (task.demoStep || 0) + 1; renderLogicDemo(task); return; }
  const manip = event.target.closest('[data-manip-index]'); if (manip) {
    const task = lesson.tasks[lesson.index]; const index = Number(manip.dataset.manipIndex); const mat = $('[data-pattern-slot]') || $('#thinkingMat');
    if (index === task.question.correct) {
      $$('.manipulative-tray button').forEach(button => button.disabled = true); manip.classList.add('correct'); celebrate(mat); mat.classList.add('filled'); mat.innerHTML = `<strong>${task.question.options[index].visual}</strong>`; $('#manipFeedback').innerHTML = '<div class="logic-result-mark success" aria-label="放对了">✓</div><button class="lesson-next icon-next" data-next-task aria-label="继续">›</button>'; speak('放对啦，你是怎么想的？');
    } else { manip.classList.add('try-again'); setTimeout(() => manip.classList.remove('try-again'), 450); speak('再比一比，换一个试试'); }
    return;
  }
  const reason = event.target.closest('[data-reason-index]'); if (reason) {
    if (reason.dataset.reasonCorrect === 'true') { $$('.reason-options button').forEach(button => button.disabled = true); reason.classList.add('correct'); celebrate(reason); $('#reasonFeedback').innerHTML = `<div class="reason-spoken">🔊 ${reason.textContent}</div><button class="lesson-next" data-next-task>去闯一关</button>`; speak(reason.textContent); }
    else { reason.classList.add('try-again'); setTimeout(() => reason.classList.remove('try-again'), 450); speak('再想想，这句话讲清楚方法了吗？'); }
    return;
  }
  const answer = event.target.closest('[data-answer-index]'); if (answer) { handleAnswer(answer,Number(answer.dataset.answerIndex));return; }
  const gameChoice = event.target.closest('[data-game-choice]'); if (gameChoice) { handleGameChoice(gameChoice,Number(gameChoice.dataset.gameChoice)); return; }
  if (event.target.closest('[data-next-game-round]')) { nextGameRound(); return; }
  if (event.target.closest('[data-replay-game]')) { startProgressiveGame(gameSession.subject,gameSession.level); return; }
  if (event.target.closest('[data-next-game-level]')) { startProgressiveGame(gameSession.subject,gameSession.level + 1); return; }
  if (event.target.closest('[data-close-game]')) { renderGameHub(); return; }
  if (event.target.closest('[data-next-task]')) { nextTask(); return; }
  const finish = event.target.closest('[data-finish]'); if (finish) { lesson=null;navigate(finish.dataset.finish);return; }
});

$('#startDaily').addEventListener('click',startDailyLesson);
$('#soundToggle').addEventListener('click',()=>{state.sound=!state.sound;$('#soundToggle').textContent=state.sound?'🔊':'🔇';saveState();showToast(state.sound?'声音打开啦':'已经静音')});
$('#exitLesson').addEventListener('click',()=>{
  const english = lesson?.tasks?.[lesson.index]?.item?.subject === 'english';
  const modal = $('#confirmModal');
  modal.querySelector('h2').textContent = english ? 'Take a little break?' : '今天先学到这里吗？';
  modal.querySelector('p').textContent = english ? 'Your progress is saved.' : '进度已经保存，下次可以接着学。';
  $('#keepLearning').textContent = english ? 'Keep learning' : '继续学习';
  $('#confirmExit').textContent = english ? 'Take a break' : '先休息';
  modal.classList.add('show');
});
$('#landscapeMode').addEventListener('click',requestLessonLandscape);
$('#keepLearning').addEventListener('click',()=>$('#confirmModal').classList.remove('show'));
$('#confirmExit').addEventListener('click',()=>{$('#confirmModal').classList.remove('show');lesson=null;navigate('home')});
$('#resetProgress').addEventListener('click',()=>{if(confirm('确定清除全部学习记录吗？此操作无法撤销。')){localStorage.removeItem(STORAGE_KEY);location.reload()}});
$('#soundToggle').textContent=state.sound?'🔊':'🔇';renderHome();
const initialView=location.hash.slice(1);if(initialView==='lesson')startDailyLesson();else if(initialView==='chinese-lesson')startUnitLesson('chinese',0);else if(initialView==='english-lesson')startUnitLesson('english',0);else if(initialView==='logic-lesson')startUnitLesson('logic',0);else if(['home','curriculum','english-world','chinese-world','logic-world','games','report'].includes(initialView))navigate(initialView);
