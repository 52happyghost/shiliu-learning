const STORAGE_KEY = 'sprout-learning-v2';
const CONTENT_SCHEMA_VERSION = 3;
const todayKey = () => new Date().toISOString().slice(0, 10);
const defaultState = { schemaVersion: CONTENT_SCHEMA_VERSION, stars: 0, sound: true, streak: 0, lastStudy: '', studyDates: [], totalMinutes: 0, sessions: 0, mastery: {}, gameProgress: {}, entryStages: { english: 0, chinese: 0, logic: 0 }, activeSubject: 'english' };
let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { saved = {}; }
const needsContentMigration = (saved.schemaVersion || 0) < CONTENT_SCHEMA_VERSION;
if (needsContentMigration) {
  saved.mastery = Object.fromEntries(Object.entries(saved.mastery || {}).filter(([key]) => !key.startsWith('logic-')));
  saved.gameProgress = Object.fromEntries(Object.entries(saved.gameProgress || {}).filter(([key]) => !key.startsWith('logic-')));
  saved.schemaVersion = CONTENT_SCHEMA_VERSION;
}
const state = { ...defaultState, ...saved, mastery: saved.mastery || {}, gameProgress: saved.gameProgress || {}, entryStages: { ...defaultState.entryStages, ...(saved.entryStages || {}) } };
let lesson = null;
let activeGameSubject = 'english';
let gameSession = null;
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
function speak(text, lang = 'zh-CN') { if (!state.sound || !('speechSynthesis' in window)) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = lang.startsWith('en') ? 0.72 : 0.84; u.pitch = 1.08; speechSynthesis.speak(u); }

function navigate(view) {
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

function subjectProgress(subject) {
  const items = allSubjectItems(subject);
  const points = items.reduce((sum, item) => sum + getStats(item.id).score, 0);
  return Math.round(points / (items.length * 4) * 100);
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
    const unitIndex = currentUnitIndex(key); const progress = subjectProgress(key); const unit = subject.units[unitIndex];
    return `<button class="subject-card" data-subject-card="${key}" style="--subject-color:${subject.color}"><span class="subject-card-head"><span class="subject-icon">${subject.icon}</span><span class="level-badge">第 ${unitIndex + 1} / ${subject.units.length} 单元</span></span><h3>${subject.name}</h3><p>${subject.description}</p><div class="mastery-row"><span class="mini-track"><i style="--value:${progress}%"></i></span><span>${progress}%</span></div><p><b>正在学习：</b>${unit.title}</p></button>`;
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
    const unit = subject.units[unitIndex];
    const itemCount = allSubjectItems(key).length;
    const buttonText = progress ? '继续探索' : '进入世界';
    return `<article class="course-portal ${key} ${key === state.activeSubject ? 'active' : ''}" style="--portal-color:${subject.color}"><div class="portal-toy" aria-hidden="true"><span>${subject.icon}</span><small>${subject.units.length} 个单元</small></div><div class="portal-copy"><span class="portal-kicker">${key === 'english' ? '听说启蒙' : key === 'chinese' ? '高频识字' : '数学思维'}</span><h2>${subject.name}</h2><p>${subject.description}</p><div class="portal-current"><b>正在学习</b><span>第 ${unitIndex + 1} 单元 · ${unit.title}</span></div><div class="portal-progress"><span class="mini-track"><i style="--value:${progress}%"></i></span><strong>${progress}%</strong></div><small class="portal-total">共 ${itemCount} 个知识点</small></div><button class="portal-enter" data-open-world="${key}">${buttonText}<span aria-hidden="true">→</span></button></article>`;
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
  const selectedStage = state.entryStages.chinese || 0;
  $('#chineseStagePicker').innerHTML = `<span>学习起点</span>${Object.entries(stages).map(([index, stage]) => `<button class="${Number(index) === selectedStage ? 'active' : ''}" data-entry-stage="chinese:${index}"><b>${stage[1]}</b><small>${stage[0].split(' · ')[1]}</small></button>`).join('')}`;
  $('#characterMap').innerHTML = subject.units.map((unit, index) => {
    const progress = unitProgress('chinese', index);
    const unlocked = unitUnlocked('chinese', index);
    const stateClass = !unlocked ? 'locked' : progress >= 80 ? 'mastered' : index === currentUnitIndex('chinese') ? 'current' : '';
    const icon = unlocked ? unit.items[0].emoji : '🔒';
    const stage = stages[index];
    const banner = stage ? `<div class="character-stage-banner" data-stage-anchor="chinese:${index}"><span>${stage[1]}</span><div><small>${stage[0]}</small><h2>${stage[2]}</h2></div></div>` : '';
    return `${banner}<article class="map-stop ${index % 2 ? 'right' : 'left'} ${stateClass}"><span class="map-number">${progress >= 80 ? '✓' : index + 1}</span><div class="map-island"><span class="map-icon">${icon}</span><div><small>第 ${index + 1} 站 · 10 个字</small><h2>${unit.title}</h2><p>${unit.goal}</p></div></div><div class="map-progress"><i style="width:${progress}%"></i></div><button data-start-unit="chinese:${index}" ${!unlocked ? 'disabled' : ''}>${progress ? '继续探索' : '出发识字'}</button></article>`;
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
  const selectedStage = state.entryStages.english || 0;
  $('#englishStagePicker').innerHTML = `<span>学习起点</span>${Object.entries(stages).map(([index, stage]) => `<button class="${Number(index) === selectedStage ? 'active' : ''}" data-entry-stage="english:${index}"><b>${stage[1]}</b><small>${stage[0].split(' · ')[1]}</small></button>`).join('')}`;
  $('#englishBookMap').innerHTML = subject.units.map((unit, index) => {
    const progress = unitProgress('english', index); const unlocked = unitUnlocked('english', index);
    const stateClass = !unlocked ? 'locked' : progress >= 80 ? 'mastered' : index === currentUnitIndex('english') ? 'current' : '';
    const coverIcons = unit.items.slice(0, 3).map(item => item.emoji).join('');
    const stage = stages[index];
    const banner = stage ? `<div class="english-stage-banner" data-stage-anchor="english:${index}"><span>${stage[1]}</span><div><small>${stage[0]}</small><h2>${stage[2]}</h2></div></div>` : '';
    return `${banner}<article class="english-book ${stateClass}"><div class="book-cover"><span>${unlocked ? coverIcons : '🔒'}</span><small>LEVEL ${index + 1}</small></div><div class="book-info"><small>${index < 10 ? '听说启蒙' : index < 20 ? '情境短句' : index < 30 ? '故事表达' : '拼读阅读'}</small><h2>${unit.title}</h2><p>${unit.goal}</p><em>${unit.focus}</em><div class="book-progress"><i style="width:${progress}%"></i></div><span>${progress}% · ${masteryLabel(Math.round(progress / 25))}</span></div><button data-start-unit="english:${index}" ${!unlocked ? 'disabled' : ''}>${progress ? '继续学习' : index >= 30 ? '开始拼读' : '开始故事'}</button></article>`;
  }).join('');
}

function renderLogicWorld() {
  const subject = CURRICULUM.logic;
  const stages = {
    0: ['第一阶段 · 小班 3–4 岁', '感知思维', '比较、分类、量感、一一对应与 1–10 点数'],
    12: ['第二阶段 · 中班 4–5 岁', '逻辑思维', '1–20 数感、排序、规律、空间与简单运算'],
    24: ['第三阶段 · 大班 5–6 岁', '综合思维', '1–100 数感、20 以内运算、图形、测量与统计']
  };
  const selectedStage = state.entryStages.logic || 0;
  $('#logicStagePicker').innerHTML = `<span>学习起点</span>${Object.entries(stages).map(([index, stage]) => `<button class="${Number(index) === selectedStage ? 'active' : ''}" data-entry-stage="logic:${index}"><b>${stage[1]}</b><small>${stage[0].split(' · ')[1]}</small></button>`).join('')}`;
  $('#logicPlanetMap').innerHTML = subject.units.map((unit, index) => {
    const progress = unitProgress('logic', index); const unlocked = unitUnlocked('logic', index);
    const stateClass = !unlocked ? 'locked' : progress >= 80 ? 'mastered' : index === currentUnitIndex('logic') ? 'current' : '';
    const stage = stages[index];
    const banner = stage ? `<div class="logic-stage-banner" data-stage-anchor="logic:${index}"><span>${stage[1]}</span><div><small>${stage[0]}</small><h2>${stage[2]}</h2></div></div>` : '';
    return `${banner}<article class="logic-planet ${stateClass}"><div class="planet-orb"><span>${unlocked ? unit.icon : '🔒'}</span><b>${progress >= 80 ? '✓' : index + 1}</b></div><div class="planet-info"><small>思维星 ${index + 1} · ${index < 12 ? '感知' : index < 24 ? '逻辑' : '综合'}</small><h2>${unit.title}</h2><p>${unit.goal}</p><div class="planet-progress"><i style="width:${progress}%"></i></div><span>${progress}% · ${masteryLabel(Math.round(progress / 25))}</span></div><button data-start-unit="logic:${index}" ${!unlocked ? 'disabled' : ''}>${progress ? '继续探索' : '登陆星球'}</button></article>`;
  }).join('');
}

function createLesson(entries, title, isDaily = false) {
  if (!entries.length) { showToast('这个单元已经掌握，去看看下一单元吧'); return; }
  const tasks = []; const embeddedPractice = new Set();
  entries.forEach(entry => {
    if (entry.isNew || getStats(entry.id).score === 0) {
      if (entry.subject === 'english') {
        tasks.push({ kind: 'english-story', item: entry }, { kind: 'teach', item: entry }, { kind: 'english-speak', item: entry }, { kind: 'practice', item: entry, retry: 0 }, { kind: 'english-read', item: entry });
        embeddedPractice.add(entry.id);
      }
      else if (entry.subject === 'chinese') {
        tasks.push({ kind: 'chinese-play', item: entry }, { kind: 'teach', item: entry }, { kind: 'practice', item: entry, retry: 0 }, { kind: 'chinese-trace', item: entry }, { kind: 'chinese-speak', item: entry });
        embeddedPractice.add(entry.id);
      }
      else {
        tasks.push({ kind: 'logic-story', item: entry }, { kind: 'logic-manipulate', item: entry }, { kind: 'practice', item: entry, retry: 0, stage: '想' }, { kind: 'logic-explain', item: entry }, { kind: 'practice', item: entry, retry: 0, stage: '闯' });
        embeddedPractice.add(entry.id);
      }
    }
  });
  shuffle(entries.filter(entry => !embeddedPractice.has(entry.id))).forEach(entry => tasks.push({ kind: 'practice', item: entry, retry: 0 }));
  lesson = { title, tasks, index: 0, stars: 0, correct: 0, wrong: 0, learned: new Set(entries.filter(x => x.isNew).map(x => x.id)), isDaily, startedAt: Date.now() };
  navigate('lesson'); renderLesson();
}

function startDailyLesson() {
  const entries = buildDailyEntries();
  if (!entries.length) return;
  createLesson(entries, '今日自适应学习', true);
}

function startUnitLesson(subject, unitIndex) {
  const items = allSubjectItems(subject).filter(item => item.unitIndex === unitIndex);
  const review = items.filter(item => getStats(item.id).score > 0 && getStats(item.id).score < 4).slice(0, 2);
  const fresh = items.filter(item => getStats(item.id).score === 0).slice(0, 2);
  let entries = [...review, ...fresh].map(item => ({ ...item, isNew: getStats(item.id).score === 0 }));
  if (!entries.length) entries = shuffle(items).slice(0, 3).map(item => ({ ...item, isNew: false }));
  createLesson(entries, `${CURRICULUM[subject].name} · ${CURRICULUM[subject].units[unitIndex].title}`);
}

function renderLesson() {
  $('#lessonSubject').textContent = lesson.title;
  $('#sessionStars').textContent = lesson.stars;
  const total = lesson.tasks.length; const position = Math.min(lesson.index + 1, total);
  $('#lessonCounter').textContent = `${position} / ${total}`;
  $('#lessonProgress').style.width = `${lesson.index / Math.max(total, 1) * 100}%`;
  if (lesson.index >= total) { renderLessonSummary(); return; }
  const task = lesson.tasks[lesson.index];
  if (task.kind === 'english-story') renderEnglishStory(task.item);
  else if (task.kind === 'english-speak') renderEnglishSpeak(task.item);
  else if (task.kind === 'english-read') renderEnglishRead(task.item);
  else if (task.kind === 'chinese-play') renderChinesePlay(task.item);
  else if (task.kind === 'chinese-trace') renderChineseTrace(task.item);
  else if (task.kind === 'chinese-speak') renderChineseSpeak(task.item);
  else if (task.kind === 'logic-story') renderLogicStory(task.item);
  else if (task.kind === 'logic-manipulate') renderLogicManipulate(task);
  else if (task.kind === 'logic-explain') renderLogicExplain(task);
  else if (task.kind === 'teach') renderTeach(task.item);
  else renderPractice(task);
}

function englishStageNav(active) {
  return `<div class="english-stage-nav">${['听','看','说','玩','读'].map(name => `<span class="${name === active ? 'active' : ''}">${name}</span>`).join('<i>·</i>')}</div>`;
}

function englishSentence(item) {
  return (item.unit.pattern || 'I see {word}.').replaceAll('{word}', item.word);
}

function englishReaderLines(item) {
  const lines = item.unit.reader || ['Look at the picture.','I see {word}.','Can you say it?'];
  return lines.map(line => line.replaceAll('{word}', item.word));
}

function replaceEnglishWord(text, word, replacement) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), replacement);
}

function speechMatches(text, target) {
  const normalize = value => value.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
  const heard = normalize(text); const expected = normalize(target);
  if (!heard || !expected) return false;
  return ` ${heard} `.includes(` ${expected} `);
}

function renderEnglishStory(item) {
  const sentence = englishSentence(item);
  $('#lessonContent').innerHTML = `${englishStageNav('听')}<span class="task-label">${item.unitIndex >= 30 ? '拼读故事开场' : '情境故事开场'}</span><div class="english-story-scene stage-${Math.floor(item.unitIndex / 10) + 1}"><span class="scene-stars">✦ · ✦</span><span class="story-fox">🦊</span><span class="english-story-item">${item.emoji}</span><span class="scene-bushes">♧ ♧ ♧ ♧</span></div><h2 class="question-title">先看画面，再听小狐狸说</h2><button class="listen-story" data-speak-now="${sentence}" data-lang="en-US"><span>🔊</span><b>${sentence}</b></button>${item.phonics ? `<div class="phonics-cue"><span>👂</span><b>${item.phonics}</b><small>先听音，再慢慢合起来读</small></div>` : ''}<p class="question-hint">先理解整句话，喜欢的话可以跟着说一遍。</p><button class="lesson-next" data-next-task>我听到了</button>`;
  speak(sentence, 'en-US');
}

function renderEnglishSpeak(item) {
  $('#lessonContent').innerHTML = `${englishStageNav('说')}<span class="task-label">开口模仿</span><div class="speak-hero"><span>👄</span><b>${item.word}</b><small>${item.phonics || item.meaning}</small></div><p class="question-hint">先听一次，再像小狐狸一样说出来。系统会耐心等你。</p><button class="listen-round" data-speak-now="${item.word}" data-lang="en-US">🔊</button><div class="speaking-actions"><button class="microphone-button" data-start-speaking="${item.word}">🎙️ 点一下，说 ${item.word}</button><button class="soft-button" data-finish-speaking>我已经跟读了</button></div><div id="speakingFeedback"></div>`;
  speak(item.word, 'en-US');
}

function renderEnglishRead(item) {
  const lines = englishReaderLines(item);
  const mark = line => replaceEnglishWord(line, item.word, `<strong>${item.word}</strong>`);
  const narration = lines.join(' ');
  $('#lessonContent').innerHTML = `${englishStageNav('读')}<span class="task-label">${item.unitIndex >= 30 ? '可解码小读本' : '迷你分级绘本'}</span><div class="mini-reader"><div class="reader-picture"><span class="reader-fox">🦊</span><span>${item.emoji}</span><i>${item.unit.title}</i></div><div class="reader-pages">${lines.map((line, index) => `<p><small>${index + 1}</small>${mark(line)}</p>`).join('')}</div><button data-speak-now="${narration}" data-lang="en-US">🔊 点读整页</button></div><p class="teach-note">先看图猜意思，再点读整页。能听懂并找到目标词，就是有效阅读；不要求逐字翻译。</p><button class="lesson-next" data-next-task>读完这一页</button>`;
}

function startSpeakingCheck(target) {
  const feedback = $('#speakingFeedback'); const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { feedback.innerHTML = `<div class="speaking-feedback gentle">勇敢开口就是进步！当前浏览器不支持自动识别，请家长听一听。</div><button class="lesson-next" data-next-task>继续</button>`; return; }
  const recognition = new Recognition(); recognition.lang = 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 3;
  feedback.innerHTML = `<div class="speaking-feedback listening">正在听你说…</div>`;
  recognition.onresult = event => {
    const heard = [...event.results[0]].map(result => result.transcript.toLowerCase()); const matched = heard.some(text => speechMatches(text, target));
    feedback.innerHTML = `<div class="speaking-feedback ${matched ? 'success' : 'gentle'}">${matched ? `听到了 ${target}，说得真清楚！` : `听到了“${heard[0]}”。再听一次，慢慢说 ${target}。`}</div><button class="lesson-next" data-next-task>${matched ? '继续' : '这次先通过'}</button>`;
  };
  recognition.onerror = () => { feedback.innerHTML = `<div class="speaking-feedback gentle">没有听清也没关系，愿意开口就很棒。</div><button class="lesson-next" data-next-task>继续</button>`; };
  try { recognition.start(); } catch (_) { recognition.onerror(); }
}

function chineseStageNav(active) {
  return `<div class="chinese-stage-nav">${['玩','认','练','写','说'].map(name => `<span class="${name === active ? 'active' : ''}">${name}</span>`).join('<i>·</i>')}</div>`;
}

function logicStageNav(active) {
  return `<div class="logic-stage-nav">${['探','摆','想','说','闯'].map(name => `<span class="${name === active ? 'active' : ''}">${name}</span>`).join('<i>·</i>')}</div>`;
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
    ab: ['星球灯在按顺序闪烁。', '把规律读出来：红、蓝、红、蓝。'],
    complex: ['这次的信号会连续闪两下。', '慢慢读一遍，再找重复的一组。'],
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

function renderLogicStory(item) {
  const copy = logicStoryCopy(item.type);
  $('#lessonContent').innerHTML = `${logicStageNav('探')}<span class="task-label">星球任务</span><div class="logic-story-scene"><span class="logic-moon">●</span><span class="logic-story-robot">🤖</span><span class="logic-story-tool">${item.unit.icon}</span><span class="logic-ground-dots">• • • • •</span></div><h2 class="question-title">${copy[0]}</h2><p class="question-hint">${copy[1]}</p><button class="lesson-next" data-next-task>接受任务</button>`;
  speak(copy[0]);
}

function renderLogicManipulate(task) {
  const question = generateLogicQuestion(task.item.type); task.question = question;
  $('#lessonContent').innerHTML = `${logicStageNav('摆')}<span class="task-label">动手摆一摆</span><h2 class="question-title">${question.title}</h2><p class="question-hint">点一个小教具，把它放进中间的思考盘。</p>${question.display ? `<div class="logic-sequence">${question.display}</div>` : ''}<div class="thinking-mat" id="thinkingMat"><span>把答案放到这里</span></div><div class="manipulative-tray">${question.options.map((option, index) => `<button data-manip-index="${index}"><span>${option.visual}</span>${option.label ? `<small>${option.label}</small>` : ''}</button>`).join('')}</div><div id="manipFeedback"></div>`;
}

function logicReason(type) {
  const map = {
    same: ['颜色、形状和方向都一样', '只要颜色差不多就可以'], different: ['它有一个特征和其他伙伴不同', '因为它排在最后'], category: ['先确定分类标准，再逐个检查特征', '只看物品放在哪里'], count: ['按顺序点数，最后一个数表示总数', '看起来多就随便猜'], compare: ['先对齐或一一配对，再比较结果', '摆得更开的一边一定更多'], ab: ['两个元素轮流重复出现', '每次都随便变化'], complex: ['先圈出完整的重复组，再往后接', '只看最后一个'], space: ['先找到参照物，再判断方向或变化', '只看自己喜欢的位置'], order: ['先确定排序规则，再逐项排列', '按照图片颜色随便排列'], match: ['一个对一个配对，没有遗漏也不重复', '只要总数看起来差不多'], calculate: ['先找已知数量，再判断合起来还是拿走', '看到数字就全部相加'], geometry: ['观察边、角、面以及能不能滚动', '只根据图形颜色判断'], measure: ['统一起点或单位后再进行比较', '不用对齐就直接看'], statistics: ['先读图例和每项数量，再进行比较', '只看最高的一项'], reason: ['逐个检查条件并排除不符合的', '挑最漂亮的答案']
  };
  return map[logicFamily(type)] || map.reason;
}

function renderLogicExplain(task) {
  const reasons = logicReason(task.item.type); task.reasonCorrect = 0;
  $('#lessonContent').innerHTML = `${logicStageNav('说')}<span class="task-label">小老师说方法</span><span class="explain-robot">🤖</span><h2 class="question-title">刚才你是怎么想的？</h2><p class="question-hint">选一句理由，再跟着熊猫团团大声说出来。</p><div class="reason-options">${shuffle(reasons.map((text, index) => ({ text, correct: index === 0 }))).map((reason, index) => `<button data-reason-index="${index}" data-reason-correct="${reason.correct}">${reason.text}</button>`).join('')}</div><div id="reasonFeedback"></div>`;
}

function renderChinesePlay(item) {
  $('#lessonContent').innerHTML = `${chineseStageNav('玩')}<span class="task-label">图景猜字</span><div class="character-story-scene"><span class="story-sun">☀️</span><span class="story-visual">${item.emoji}</span><span class="story-grass">♧ ♧ ♧ ♧ ♧</span></div><h2 class="question-title">猜一猜，这幅图里藏着哪个字？</h2><p class="question-hint">先说出你看到了什么，再揭开答案。</p><button class="lesson-next reveal-character" data-reveal-character="${item.word}">揭开小秘密</button><div id="characterReveal"></div>`;
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
  $('#lessonContent').innerHTML = `${chineseStageNav('说')}<span class="task-label">词语表达</span><div class="speak-character"><span>${item.word}</span><button class="listen-round" data-speak-now="${item.word}" data-lang="zh-CN">🔊</button></div><h2 class="question-title">带着“${item.word}”一起说</h2><div class="phrase-bubbles">${phrases.map(text => `<button data-speak-now="${text}" data-lang="zh-CN">${text} 🔊</button>`).join('')}</div><p class="teach-note">请孩子选一个词，大声说一遍。能在词语中认出汉字，才是真正会用了。</p><button class="lesson-next" data-next-task>我会说了</button>`;
}

function chinesePhrases(item) {
  const map = {日:['日出','红日','今天是好日子'],月:['月亮','月光','月亮弯弯'],山:['大山','山顶','我看见一座山'],水:['喝水','河水','小鱼在水里'],火:['大火','火苗','火苗红红的'],木:['木头','树木','这里有一棵树'],人:['大人','家人','这里有很多人'],口:['门口','开口','我会开口说话'],手:['小手','洗手','我有一双小手'],目:['目光','双目','目就是眼睛'],耳:['耳朵','木耳','我用耳朵听'],足:['足球','手足','足就是脚'] };
  return map[item.word] || [item.meaning, `${item.word}字`, `我认识“${item.word}”了`];
}

function renderTeach(item) {
  const subject = CURRICULUM[item.subject];
  if (item.subject === 'logic') {
    const info = logicTeaching(item.type);
    $('#lessonContent').innerHTML = `<span class="task-label">认识新方法 · ${subject.name}</span><span class="teach-emoji">${item.unit.icon}</span><h2 class="teach-word">${item.unit.title}</h2><p class="teach-meaning">${item.unit.goal}</p><div class="teach-note">${info}</div><button class="lesson-next" data-next-task>我明白了，试一试</button>`;
    speak(`${item.unit.title}。${item.unit.goal}`);
  } else {
    const isEnglish = item.subject === 'english'; const pronunciation = isEnglish ? item.phonics : item.pinyin;
    const note = isEnglish ? `看着图片听一听：${item.meaning}，英语说 ${item.word}。先听懂，不要求孩子马上拼写。` : `“${item.word}”和${item.meaning}有关。先看图理解意思，再观察这个字的样子。`;
    const stage = isEnglish ? englishStageNav('看') : chineseStageNav('认');
    $('#lessonContent').innerHTML = `${stage}<span class="task-label">认识新朋友 · ${subject.name}</span><span class="teach-emoji">${item.emoji}</span><h2 class="teach-word">${item.word}</h2>${pronunciation ? `<p class="teach-pronunciation">${pronunciation}</p>` : ''}<p class="teach-meaning">${item.meaning}</p><button class="listen-round" data-speak-now="${item.word}" data-lang="${isEnglish ? 'en-US' : 'zh-CN'}">🔊</button><div class="teach-note">${note}</div><button class="lesson-next" data-next-task>${isEnglish ? '我看懂了' : '去练一练'}</button>`;
    speak(item.word, isEnglish ? 'en-US' : 'zh-CN');
  }
}

function logicTeaching(type) {
  const notes = {
    same: '先看颜色，再看形状和方向。每个地方都一样，才是真正的“相同”。', different: '把三个地方逐个比较：颜色、形状、种类。只有一个不一样，把它找出来。', category: '先说出分类标准，再逐个检查。可以按颜色、形状、种类或用途分类。', ab: '两个东西轮流出现，就像拍手、跺脚、拍手、跺脚。说出规律再选择。', complex: '一个元素可能连续出现两次。先圈出完整的一组，再按同样顺序接下去。', count: '一个一个地点数，点过的不要重复。数量较多时，可以五个或十个分成一组。', compare: '比较大小和长短要先对齐；比较多少可以一一连线，看哪边还有剩下。', space: '先确定参照物，再判断上、下、左、右、里外，或观察图形怎样移动和转动。', order: '先找排序规则，再逐项排列。数序要留意前一个、后一个和相邻数。', match: '一一对应就是每个伙伴只配一个物品，不遗漏，也不重复。', calculate: '先把故事中的数量摆出来。合起来用加法，拿走、剩下或相差用减法。', geometry: '平面图形看边和角；立体图形看面，还可以试一试它能不能滚动或堆叠。', measure: '测量要从同一个起点开始，并使用同样大小的单位，结果才能公平比较。', statistics: '先看图例表示什么，再数每一项有多少，最后比较数据并回答问题。', reason: '把题目里的条件一个一个用掉。不符合条件的先排除，最后剩下的就是答案。'
  }; return notes[logicFamily(type)] || notes.reason;
}

function renderPractice(task) {
  const item = task.item; const stats = getStats(item.id);
  const question = item.subject === 'logic' ? generateLogicQuestion(item.type) : generateLanguageQuestion(item, stats.score);
  task.question = question;
  const stage = item.subject === 'english' ? englishStageNav('玩') : item.subject === 'chinese' ? chineseStageNav('练') : logicStageNav(task.stage || '闯');
  const practiceName = item.subject === 'logic' ? (task.stage === '闯' ? '星际挑战' : '图像推理') : (stats.score < 2 ? '引导练习' : '独立挑战');
  $('#lessonContent').innerHTML = `${stage}<span class="task-label">${practiceName} · ${CURRICULUM[item.subject].name}</span><h2 class="question-title">${question.title}</h2><p class="question-hint">${question.hint || '仔细观察，再做选择'}</p>${question.display ? `<div class="logic-sequence">${question.display}</div>` : ''}${question.speak ? `<button class="listen-round" data-speak-now="${question.speak}" data-lang="${question.lang}">🔊</button>` : ''}<div class="answer-grid">${question.options.map((option, index) => `<button class="answer-button" data-answer-index="${index}"><span class="answer-visual">${option.visual}</span>${option.label ? `<b>${option.label}</b>` : ''}</button>`).join('')}</div><div id="answerFeedback"></div>`;
  if (question.autoSpeak) speak(question.speak, question.lang);
}

function generateLanguageQuestion(item, score) {
  const candidates = allSubjectItems(item.subject).filter(other => other.id !== item.id);
  const sameUnit = candidates.filter(other => other.unitIndex === item.unitIndex);
  const sameStage = candidates.filter(other => Math.floor(other.unitIndex / 10) === Math.floor(item.unitIndex / 10));
  const pool = shuffle(sameUnit.length >= 2 ? sameUnit : sameStage.length >= 2 ? sameStage : candidates).slice(0, 2);
  const options = shuffle([item, ...pool]); const correct = options.findIndex(option => option.id === item.id);
  if (item.subject === 'english') {
    const listening = score >= 2;
    return { title: listening ? '听一听，选出正确图片' : `哪个是“${item.meaning}”？`, hint: listening ? '可以反复点击小喇叭' : '把图片、意思和英语声音连起来', speak: item.word, lang: 'en-US', autoSpeak: true, correct, options: options.map(option => ({ visual: option.emoji, label: listening ? '' : option.word })) };
  }
  const listening = score >= 2;
  return { title: listening ? '听一听，选出这个汉字' : `哪个字表示“${item.meaning}”？`, hint: listening ? '先听意思，再看字形' : `看图提示：${item.emoji}`, speak: listening ? item.meaning : item.word, lang: 'zh-CN', autoSpeak: listening, correct, options: options.map(option => ({ visual: option.word, label: score < 1 ? option.pinyin : '' })) };
}

function generateLogicQuestion(type) {
  const pick = array => array[Math.floor(Math.random() * array.length)];
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
  if (type === 'same') { const target = pick(['🍎','🐟','🚗','🌟','🔺']); const options = shuffle([target, pick(['🍏','🐠','🚙','⭐','🔵']), pick(['🍌','🐰','🚌','🌙','🟨'])]); return { title:'找出完全相同的图案',display:target,correct:options.indexOf(target),options:options.map(x=>({visual:x}))}; }
  if (type === 'different') { const groups = [['🍎','🍎','🍐'],['🐟','🐟','🐦'],['🔴','🔴','🟡'],['🚗','🚗','🚌']]; const row=pick(groups); const odd=row[2]; const options=shuffle(row); return {title:'哪一个和其他两个不一样？',correct:options.indexOf(odd),options:options.map(x=>({visual:x}))}; }
  if (type === 'size') return choiceQuestion('哪一个最大？',[{visual:'🐘',label:'大象'},{visual:'🐰',label:'兔子'},{visual:'🐭',label:'老鼠'}],0,{hint:'把它们放在一起比一比'});
  if (type === 'length') return choiceQuestion('哪一条最长？',['━━━━━━━━','━━━━━','━━'],0,{hint:'从同一个起点开始比较'});
  if (type === 'color') { const rows=[['找出红色的图形','🔴','🔵','🟡'],['找出蓝色的图形','🔵','🟢','🔴'],['找出黄色的图形','🟡','🟣','🟢']]; const row=pick(rows); return choiceQuestion(row[0],row.slice(1),0); }
  if (type === 'shape') { const rows=[['哪个是三角形？','🔺','🔵','🟨'],['哪个是圆形？','🔵','🔺','🟨'],['哪个是正方形？','🟨','🔵','🔺']]; const row=pick(rows); return choiceQuestion(row[0],row.slice(1),0); }
  if (type === 'category') { const groups=[['🍎','🍌','🚗','哪个不是水果？'],['🐶','🐰','🧢','哪个不是动物？'],['👕','👟','🍰','哪个不是衣物？']]; const row=pick(groups); const opts=shuffle(row.slice(0,3).map((x,i)=>({x,correct:i===2}))); return {title:row[3],correct:opts.findIndex(x=>x.correct),options:opts.map(x=>({visual:x.x}))}; }
  if (type === 'ab') { const pairs=pick([['🔴','🔵'],['🍎','🍌'],['🐰','🐼']]); return choiceQuestion('下一个是什么？',[pairs[0],pairs[1],'⭐'],0,{display:`${pairs[0]} ${pairs[1]} ${pairs[0]} ${pairs[1]} ❓`}); }
  if (type === 'complex') { const pair=pick([['🔴','🔵'],['🟨','🟩'],['🍎','🍇']]); return choiceQuestion('找出复杂规律的下一个',[pair[0],pair[1],'⭐'],1,{display:`${pair[0]} ${pair[0]} ${pair[1]} ${pair[0]} ${pair[0]} ❓`}); }
  if (['count','count5','count10','count20'].includes(type)) { const limit=type==='count5'?5:type==='count20'?20:type==='count10'?10:6; const floor=limit>10?11:1; const n=floor+Math.floor(Math.random()*(limit-floor+1)); return numberQuestion('一共有几个？','● '.repeat(n),n,floor,limit); }
  if (type === 'match') { const n=2+Math.floor(Math.random()*4); return numberQuestion(`${n} 只小兔，每只一根胡萝卜，需要几根？`,`🐰 `.repeat(n),n,1,6); }
  if (type === 'compare') { const a=1+Math.floor(Math.random()*4),b=a+1+Math.floor(Math.random()*2); return choiceQuestion('哪一组更多？',[{visual:'🍎'.repeat(a),label:`${a} 个`},{visual:'🍎'.repeat(b),label:`${b} 个`},{visual:'一样多'}],1); }
  if (type === 'instruction') { const sets=[{q:'先点圆形，再点三角形',o:['🔵 → 🔺','🔺 → 🔵','🟨 → 🔵'],c:0},{q:'先选红色，再选黄色',o:['🔴 → 🟡','🟡 → 🔴','🔵 → 🟡'],c:0}]; const x=pick(sets); return choiceQuestion('听懂指令，选出正确顺序',x.o,x.c,{hint:x.q}); }
  if (type === 'number10') { const n=2+Math.floor(Math.random()*7); return numberQuestion('数字火车缺了哪一节？',`${n-1}　❓　${n+1}`,n,1,10); }
  if (type === 'number-order') { const sets=[{q:'哪一组是从小到大？',o:['2　5　8','8　5　2','5　2　8'],c:0},{q:'哪一组是从大到小？',o:['9　6　3','3　6　9','6　9　3'],c:0}]; const x=pick(sets); return choiceQuestion(x.q,x.o,x.c); }
  if (type === 'sort') return choiceQuestion('哪一组是从短到长？',['━　━━　━━━','━━━　━━　━','━━　━　━━━'],0);
  if (type === 'space') { const sets=[{q:'哪个在盒子里面？',o:['🐰 📦','📦🐰','🐰⬆️📦'],c:1},{q:'哪个在小树上面？',o:['🐦\n🌳','🌳\n🐦','🐦🌳'],c:0},{q:'哪个在小猫右边？',o:['🐶 🐱','🐱 🐶','🐶\n🐱'],c:1}]; const x=pick(sets); return choiceQuestion(x.q,x.o,x.c); }
  if (type === 'position') { const sets=[{q:'谁在小树后面？',o:['🌳🐰','🐰🌳','🐰\n🌳'],c:0},{q:'谁离小屋最近？',o:['🏠🐶','🏠　　　🐶','🐶　　　🏠'],c:0}]; const x=pick(sets); return choiceQuestion(x.q,x.o,x.c); }
  if (['addition5','addition10'].includes(type)) { const limit=type==='addition5'?5:10; const a=1+Math.floor(Math.random()*(limit-2)); const b=1+Math.floor(Math.random()*(limit-a)); return numberQuestion(`${a} 个苹果又来了 ${b} 个，一共有几个？`,`${'🍎'.repeat(a)} ＋ ${'🍎'.repeat(b)}`,a+b,0,limit); }
  if (['subtraction5','subtraction10'].includes(type)) { const limit=type==='subtraction5'?5:10; const a=2+Math.floor(Math.random()*(limit-1)); const b=1+Math.floor(Math.random()*(a-1)); return numberQuestion(`${a} 个气球飞走 ${b} 个，还剩几个？`,`${a} － ${b} ＝ ❓`,a-b,0,limit); }
  if (type === 'correspondence') { const n=1+Math.floor(Math.random()*9); return numberQuestion('哪张数字卡和点子一样多？','● '.repeat(n),n,1,10); }
  if (type === 'number50' || type === 'number100') { const step=pick([1,2,5,10]); const max=type==='number50'?50:100; const start=1+Math.floor(Math.random()*Math.max(1,max-step*2)); const answer=start+step; return numberQuestion('按照规律，空格里是几？',`${start}　❓　${start+step*2}`,answer,1,max); }
  if (type === 'arithmetic20') { const add=Math.random()>.5; const a=add?6+Math.floor(Math.random()*8):11+Math.floor(Math.random()*9); const b=1+Math.floor(Math.random()*(add?20-a:a-1)); const answer=add?a+b:a-b; return numberQuestion(`${a} ${add?'＋':'－'} ${b} ＝？`,'🧮',answer,0,20); }
  if (type === 'word-problem') { const sets=[{q:'车上有 6 人，又上来 3 人，现在有几人？',d:'🚌  6 ＋ 3',a:9},{q:'盘里有 8 块饼干，吃掉 2 块，还剩几块？',d:'🍪  8 － 2',a:6}]; const x=pick(sets); return numberQuestion(x.q,x.d,x.a,0,20); }
  if (type === 'geometry2d') { const sets=[{q:'哪个图形有 3 条边？',o:['🔺','🟨','⚪'],c:0},{q:'哪个图形没有角？',o:['⚪','🔺','🟨'],c:0}]; const x=pick(sets); return choiceQuestion(x.q,x.o,x.c); }
  if (type === 'geometry3d') { const sets=[{q:'哪个物体可以向各个方向滚动？',o:['⚽','🧊','🎁'],c:0},{q:'哪个最像正方体？',o:['🧊','🥫','⚽'],c:0}]; const x=pick(sets); return choiceQuestion(x.q,x.o,x.c); }
  if (type === 'transform') { const sets=[{q:'箭头向右转一次，会指向哪里？',d:'⬆️  ↷',o:['➡️','⬅️','⬇️'],c:0},{q:'哪个图案左右对称？',d:'沿中线对折',o:['🦋','🌙','↗️'],c:0}]; const x=pick(sets); return choiceQuestion(x.q,x.o,x.c,{display:x.d}); }
  if (type === 'measure') return choiceQuestion('用同样长的小方块测量，哪条占 5 格？',[{visual:'▰▰▰',label:'3 格'},{visual:'▰▰▰▰▰',label:'5 格'},{visual:'▰▰▰▰',label:'4 格'}],1,{display:'每格一样长'});
  if (type === 'statistics') { const rows=[{q:'哪种水果最多？',d:'苹果　●●●●<br>香蕉　●●<br>葡萄　●●●',o:['苹果','香蕉','葡萄'],c:0},{q:'哪两种一样多？',d:'小猫　●●●<br>小狗　●●<br>小兔　●●',o:['小狗和小兔','小猫和小狗','小猫和小兔'],c:0}]; const x=pick(rows); return choiceQuestion(x.q,x.o,x.c,{display:x.d}); }
  if (type === 'order') { const sets=[{q:'早上起床后，先做什么？',o:['刷牙','睡觉','吃晚饭'],c:0},{q:'种下一颗种子以后，会发生什么？',o:['发芽','回到种子袋','变成石头'],c:0},{q:'吃饭以前应该先做什么？',o:['洗手','睡觉','穿雨衣'],c:0}]; const x=pick(sets); return choiceQuestion(x.q,x.o,x.c); }
  const sets=[{q:'小红帽戴红帽子。哪个是小红帽？',o:['🔴','🔵','🟡'],c:0},{q:'不是圆形，也不是蓝色。选哪个？',o:['🔴','🟦','🔺'],c:2},{q:'会游泳，但不是小鸟。选哪个？',o:['🐟','🐦','🐰'],c:0}]; const x=pick(sets); return choiceQuestion(x.q,x.o,x.c);
}

function recordAnswer(item, correct) {
  const old = getStats(item.id); const intervals = [0, 1, 3, 7, 14];
  const score = correct ? Math.min(4, old.score + 1) : Math.max(0, old.score - 1);
  const due = new Date(); due.setDate(due.getDate() + intervals[score]);
  state.mastery[item.id] = { score, attempts: old.attempts + 1, correct: old.correct + (correct ? 1 : 0), streak: correct ? old.streak + 1 : 0, last: todayKey(), due: due.getTime() };
  saveState();
}

function handleAnswer(button, index) {
  const task = lesson.tasks[lesson.index]; if (task.answered) return; task.answered = true;
  const correct = index === task.question.correct; $$('.answer-button').forEach(b => b.disabled = true);
  if (correct) {
    button.classList.add('correct'); lesson.correct += 1; lesson.stars += 1; state.stars += 1; recordAnswer(task.item, true); speak('答对了，你真的理解了');
    $('#answerFeedback').innerHTML = `<div class="feedback-box">答对了！${masteryLabel(getStats(task.item.id).score)} <button class="lesson-next" data-next-task>继续</button></div>`;
  } else {
    button.classList.add('wrong'); const right = $$('.answer-button')[task.question.correct]; right.classList.add('correct'); lesson.wrong += 1; recordAnswer(task.item, false); speak('没关系，我们再学一次');
    if (task.retry < 1) {
      const retryTasks = task.item.subject === 'logic' ? [{ kind: 'logic-manipulate', item: task.item }, { kind: 'practice', item: task.item, retry: task.retry + 1, stage: '闯' }] : [{ kind: 'teach', item: task.item }, { kind: 'practice', item: task.item, retry: task.retry + 1 }];
      lesson.tasks.splice(Math.min(lesson.index + 3, lesson.tasks.length), 0, ...retryTasks);
    }
    $('#answerFeedback').innerHTML = `<div class="feedback-box">没关系，正确答案已经亮起来了。稍后熊猫团团会换一种方式再教一次。<button class="lesson-next" data-next-task>我知道了</button></div>`;
  }
  $('#sessionStars').textContent = lesson.stars; saveState();
}

function nextTask() { lesson.index += 1; renderLesson(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

function renderLessonSummary() {
  $('#lessonProgress').style.width = '100%';
  const reviewed = lesson.tasks.filter(t => t.kind === 'practice').length; const accuracy = Math.round(lesson.correct / Math.max(lesson.correct + lesson.wrong, 1) * 100);
  $('#lessonContent').innerHTML = `<span class="lesson-summary-emoji">${accuracy >= 80 ? '🌈' : '🌱'}</span><h2>${accuracy >= 80 ? '今天学得很扎实！' : '今天认真努力了！'}</h2><p class="teach-meaning">学习不是一次全对，而是每次都多懂一点。</p><div class="summary-list"><div class="summary-item"><span>完成练习</span><b>${reviewed} 次</b></div><div class="summary-item"><span>本次正确率</span><b>${accuracy}%</b></div><div class="summary-item"><span>获得星星</span><b>⭐ ${lesson.stars}</b></div></div><div class="summary-actions"><button class="soft-button" data-finish="curriculum">看看成长地图</button><button class="lesson-next" data-finish="home">完成学习</button></div>`;
  if (!lesson.completed) completeLesson();
}

function completeLesson() {
  lesson.completed = true; state.sessions += 1; state.totalMinutes += Math.max(1, Math.round((Date.now() - lesson.startedAt) / 60000));
  if (!state.studyDates.includes(todayKey())) state.studyDates.push(todayKey());
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); const yesterdayKey = yesterday.toISOString().slice(0,10);
  if (state.lastStudy !== todayKey()) state.streak = state.lastStudy === yesterdayKey ? state.streak + 1 : 1;
  state.lastStudy = todayKey(); saveState(); renderHome();
}

function renderReport() {
  const items = allItems(); const attempts = Object.values(state.mastery).reduce((s,x)=>s+x.attempts,0); const correct = Object.values(state.mastery).reduce((s,x)=>s+x.correct,0); const mastered = items.filter(i=>getStats(i.id).score>=4).length;
  $('#reportStats').innerHTML = `<div class="stat-card"><strong>${state.studyDates.length}</strong><span>累计学习天数</span></div><div class="stat-card"><strong>${state.sessions}</strong><span>完成学习次数</span></div><div class="stat-card"><strong>${mastered}</strong><span>掌握知识点</span></div><div class="stat-card"><strong>${attempts ? Math.round(correct/attempts*100) : 0}%</strong><span>累计正确率</span></div>`;
  $('#masteryReport').innerHTML = Object.entries(CURRICULUM).map(([key,s])=>{const p=subjectProgress(key);return `<div class="mastery-report-row"><b>${s.icon} ${s.short}</b><span class="report-track" style="--subject-color:${s.color}"><i style="--value:${p}%"></i></span><span>${p}%</span></div>`}).join('');
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
  gameSession = { subject, level, round: 0, correct: 0, items: pool.slice(0, 5), answered: false };
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
  const sentence = englishSentence(item);
  if (level === 0) return { title:'仔细听，点亮正确的宝物', hint:'可以反复点击声音按钮', speak:item.word, autoSpeak:true, ...languageGameOptions(item, x => ({visual:x.emoji,label:''})) };
  if (level === 1) return { title:`帮 “${item.word}” 找到图片`, hint:'把单词和画面连在一起', ...languageGameOptions(item, x => ({visual:x.emoji,label:x.meaning})) };
  if (level === 2) return { title:'闪出来的图片，英语怎么说？', hint:'快速认一认', display:item.emoji, ...languageGameOptions(item, x => ({visual:x.word,label:x.meaning})) };
  if (level === 3) return { title:`小狐狸看到了 ${item.emoji}，它应该怎么说？`, hint:'选择最合适的一句话', speak:sentence, ...languageGameOptions(item, x => ({visual:englishSentence(x),label:''})) };
  if (level === 4) return { title:'给句子火车装上正确车厢', hint:'读一读完整主题句', display:replaceEnglishWord(sentence,item.word,'＿＿＿'), ...languageGameOptions(item, x => ({visual:x.word,label:x.meaning})) };
  if (level === 5) return { title:'听读绘本句子，选出正确画面', hint:sentence, speak:sentence, autoSpeak:true, display:'📖', ...languageGameOptions(item, x => ({visual:x.emoji,label:x.word})) };
  if (level === 6) return { title:`哪个词以 “${item.word[0].toUpperCase()}” 开头？`, hint:item.phonics || '先慢慢说出每个单词', display:`${item.word[0].toUpperCase()} ${item.word[0].toLowerCase()}`, ...languageGameOptions(item, x => ({visual:x.emoji,label:x.word})) };
  if (level === 7) return { title:'听音、分音，再找到正确单词', hint:item.phonics || '把声音慢慢合起来', speak:item.word, autoSpeak:true, display:item.phonics || `🔤 ${item.word}`, ...languageGameOptions(item, x => ({visual:x.word,label:x.meaning})) };
  if (level === 8) return { title:'哪幅画和这句话说的一样？', hint:'先读关键词，再看画面', speak:sentence, display:sentence, ...languageGameOptions(item, x => ({visual:x.emoji,label:x.meaning})) };
  if (level === 9) return { title:'听一听，找到句子里的高频词', hint:`目标词：${item.word}`, speak:sentence, autoSpeak:true, display:replaceEnglishWord(sentence,item.word,'____'), ...languageGameOptions(item, x => ({visual:x.word,label:x.phonics||''})) };
  const reader = englishReaderLines(item);
  if (level === 10) {
    const sequences = shuffle([
      { lines:[reader[0],reader[1],reader[2]], correct:true },
      { lines:[reader[1],reader[0],reader[2]], correct:false },
      { lines:[reader[0],reader[2],reader[1]], correct:false }
    ]);
    return { title:'哪一组是完整的故事顺序？', hint:'先看开头，再找发展和结尾', display:item.emoji, compact:true, correct:sequences.findIndex(option => option.correct), options:sequences.map(option => ({ visual:option.lines.map((line,index) => `${index + 1}. ${line}`).join('<br>') })) };
  }
  return { title:'这页绘本的关键词是哪一个？', hint:reader.join(' '), speak:reader.join(' '), autoSpeak:true, display:'📖', ...languageGameOptions(item, x => ({visual:x.emoji,label:x.word})) };
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
  return generateLogicQuestion(type);
}

function renderGameRound() {
  if (gameSession.round >= gameSession.items.length) { renderGameResult(); return; }
  const { subject, level, round, items } = gameSession; const item = items[round];
  const question = subject === 'english' ? buildEnglishGame(item, level) : subject === 'chinese' ? buildChineseGame(item, level) : buildLogicGame(item, level);
  gameSession.question = question; gameSession.answered = false;
  $('#gameCorrectCount').textContent = gameSession.correct; $('#gameRoundProgress').style.width = `${round / items.length * 100}%`;
  const sceneClass = `${subject}-game-scene level-${level + 1}`;
  $('#gamePlayContent').innerHTML = `<div class="game-round-label">第 ${round + 1} / ${items.length} 轮</div><div class="${sceneClass}"><span class="game-scene-mascot">${GAME_THEME[subject].icon}</span>${question.display ? `<div class="game-question-display">${question.display}</div>` : '<div class="game-question-display sound-rings">♪</div>'}</div><h2>${question.title}</h2><p>${question.hint || '仔细观察，再做选择'}</p>${question.speak ? `<button class="game-listen" data-speak-now="${question.speak}" data-lang="${subject === 'english' ? 'en-US' : 'zh-CN'}">🔊 再听一次</button>` : ''}<div class="game-choice-grid${question.compact ? ' compact' : ''}">${question.options.map((option,index)=>`<button data-game-choice="${index}"><span>${option.visual}</span>${option.label ? `<small>${option.label}</small>` : ''}</button>`).join('')}</div><div id="gameFeedback"></div>`;
  if (question.autoSpeak) setTimeout(() => speak(question.speak, subject === 'english' ? 'en-US' : 'zh-CN'), 180);
}

function handleGameChoice(button, index) {
  if (!gameSession || gameSession.answered) return; gameSession.answered = true;
  const correct = index === gameSession.question.correct; const buttons = $$('.game-choice-grid button'); buttons.forEach(choice => choice.disabled = true);
  buttons[gameSession.question.correct]?.classList.add('correct');
  if (correct) { gameSession.correct += 1; button.classList.add('correct'); speak('答对啦，继续出发'); }
  else { button.classList.add('wrong'); speak('没关系，看看亮起来的答案'); }
  $('#gameCorrectCount').textContent = gameSession.correct;
  $('#gameFeedback').innerHTML = `<div class="game-feedback ${correct ? 'success' : 'gentle'}"><b>${correct ? '太棒了！' : '找到方法了！'}</b><span>${correct ? '你又点亮了一颗小星星。' : '记住这个答案，下一轮继续加油。'}</span></div><button class="lesson-next" data-next-game-round>${gameSession.round === gameSession.items.length - 1 ? '看看成绩' : '下一轮'}</button>`;
}

function nextGameRound() { gameSession.round += 1; renderGameRound(); }

function renderGameResult() {
  const score = gameSession.correct; const earned = score === 5 ? 3 : score >= 3 ? 2 : 1; const key = gameKey(gameSession.subject, gameSession.level);
  state.gameProgress[key] = Math.max(gameStars(gameSession.subject, gameSession.level), earned); state.stars += earned; saveState();
  $('#gameRoundProgress').style.width = '100%'; $('#gameCorrectCount').textContent = score;
  const passed = score >= 3; const hasNext = passed && gameSession.level < GAME_LEVELS[gameSession.subject].length - 1;
  const action = hasNext ? '<button class="lesson-next" data-next-game-level>下一关</button>' : `<button class="lesson-next" data-replay-game>${passed ? '再玩一次' : '再练一次'}</button>`;
  $('#gamePlayContent').innerHTML = `<div class="game-result"><span class="result-mascot">${GAME_THEME[gameSession.subject].icon}</span><h2>${score >= 4 ? '这一关完成得很棒！' : passed ? '达到解锁标准啦！' : '已经找到不少方法了！'}</h2><div class="result-stars">${[1,2,3].map(n=>`<i class="${n<=earned?'earned':''}">★</i>`).join('')}</div><p>答对 ${score} / 5 题，获得 ${earned} 颗闯关星。${passed ? '下一关已经解锁。' : '答对 3 题就能解锁下一关。'}</p><div><button class="soft-button" data-close-game>回到地图</button>${action}</div></div>`;
  $('#starCount').textContent = state.stars;
}

document.addEventListener('click', event => {
  const nav = event.target.closest('[data-nav]'); if (nav) { navigate(nav.dataset.nav); return; }
  const card = event.target.closest('[data-subject-card]'); if (card) { state.activeSubject=card.dataset.subjectCard;saveState();navigate(SUBJECT_WORLDS[state.activeSubject] || 'curriculum');return; }
  const world = event.target.closest('[data-open-world]'); if (world) { state.activeSubject=world.dataset.openWorld;saveState();navigate(SUBJECT_WORLDS[state.activeSubject] || 'curriculum');return; }
  const stageEntry = event.target.closest('[data-entry-stage]'); if (stageEntry) { const [subject,index] = stageEntry.dataset.entryStage.split(':'); state.entryStages[subject] = Number(index); state.activeSubject = subject; saveState(); navigate(SUBJECT_WORLDS[subject]); requestAnimationFrame(() => document.querySelector(`[data-stage-anchor="${subject}:${index}"]`)?.scrollIntoView({ behavior:'smooth', block:'start' })); return; }
  const unit = event.target.closest('[data-start-unit]'); if (unit) { const [subject,index]=unit.dataset.startUnit.split(':');startUnitLesson(subject,Number(index));return; }
  const gameSubject = event.target.closest('[data-game-subject]'); if (gameSubject) { activeGameSubject = gameSubject.dataset.gameSubject; renderGameHub(); return; }
  const gameStart = event.target.closest('[data-start-game]'); if (gameStart) { const [subject,index] = gameStart.dataset.startGame.split(':'); startProgressiveGame(subject,Number(index)); return; }
  const speakButton = event.target.closest('[data-speak-now]'); if (speakButton) { speak(speakButton.dataset.speakNow,speakButton.dataset.lang);return; }
  const reveal = event.target.closest('[data-reveal-character]'); if (reveal) { const character = reveal.dataset.revealCharacter; reveal.disabled = true; reveal.style.display = 'none'; $('#characterReveal').innerHTML = `<div class="character-reveal"><span>${character}</span><p>原来是“${character}”！图画慢慢变成了汉字。</p><button class="lesson-next" data-next-task>去认识它</button></div>`; speak(character, 'zh-CN'); return; }
  if (event.target.closest('[data-clear-trace]')) { $('#traceCanvas')?._clearTrace?.(); return; }
  const speaking = event.target.closest('[data-start-speaking]'); if (speaking) { startSpeakingCheck(speaking.dataset.startSpeaking); return; }
  if (event.target.closest('[data-finish-speaking]')) { nextTask(); return; }
  const manip = event.target.closest('[data-manip-index]'); if (manip) {
    const task = lesson.tasks[lesson.index]; const index = Number(manip.dataset.manipIndex); const mat = $('#thinkingMat');
    if (index === task.question.correct) {
      $$('.manipulative-tray button').forEach(button => button.disabled = true); manip.classList.add('correct'); mat.classList.add('filled'); mat.innerHTML = `<strong>${task.question.options[index].visual}</strong><small>放对啦！</small>`; $('#manipFeedback').innerHTML = '<button class="lesson-next" data-next-task>我会摆了</button>'; speak('放对啦，你是怎么想的？');
    } else { manip.classList.add('try-again'); setTimeout(() => manip.classList.remove('try-again'), 450); speak('再比一比，换一个试试'); }
    return;
  }
  const reason = event.target.closest('[data-reason-index]'); if (reason) {
    if (reason.dataset.reasonCorrect === 'true') { $$('.reason-options button').forEach(button => button.disabled = true); reason.classList.add('correct'); $('#reasonFeedback').innerHTML = `<div class="reason-spoken">🔊 ${reason.textContent}</div><button class="lesson-next" data-next-task>去闯一关</button>`; speak(reason.textContent); }
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
$('#exitLesson').addEventListener('click',()=>$('#confirmModal').classList.add('show'));
$('#keepLearning').addEventListener('click',()=>$('#confirmModal').classList.remove('show'));
$('#confirmExit').addEventListener('click',()=>{$('#confirmModal').classList.remove('show');lesson=null;navigate('home')});
$('#resetProgress').addEventListener('click',()=>{if(confirm('确定清除全部学习记录吗？此操作无法撤销。')){localStorage.removeItem(STORAGE_KEY);location.reload()}});
$('#soundToggle').textContent=state.sound?'🔊':'🔇';renderHome();
const initialView=location.hash.slice(1);if(initialView==='lesson')startDailyLesson();else if(initialView==='chinese-lesson')startUnitLesson('chinese',0);else if(initialView==='english-lesson')startUnitLesson('english',0);else if(initialView==='logic-lesson')startUnitLesson('logic',0);else if(['home','curriculum','english-world','chinese-world','logic-world','games','report'].includes(initialView))navigate(initialView);
