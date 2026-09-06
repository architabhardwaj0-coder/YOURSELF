// Global State
let appData = {
  topics: [],
  mistakes: [],
  members: [],
  punishments: [],
  score: 0,
  revMode: 'you',
  mistakeMode: false,
  activeTopicId: null
};

// AUTHENTICATION & LOGIN
function switchAuthTab(tab) {
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('tab-signin').classList.toggle('active', tab === 'signin');
  document.getElementById('form-signup').classList.toggle('page-hidden', tab !== 'signup');
  document.getElementById('form-signin').classList.toggle('page-hidden', tab !== 'signin');
}

function handleAuthSubmit(e) {
  e.preventDefault();
  document.getElementById('page-1').classList.remove('active-page');
  document.getElementById('app-wrapper').classList.remove('page-hidden');
  openPage('page-2'); // Open Dashboard
}

function handleLogout() {
  document.getElementById('app-wrapper').classList.add('page-hidden');
  document.getElementById('page-1').classList.add('active-page');
}

function toggleMenu() {
  document.getElementById('dropdown-menu').classList.toggle('page-hidden');
}

// REAL PAGE SWITCHING ROUTER
function openPage(pageId, navBtn) {
  // Hide all screens
  document.querySelectorAll('.page-screen').forEach(screen => {
    screen.classList.remove('active-page');
  });

  // Show selected screen
  document.getElementById(pageId).classList.add('active-page');

  // Highlight bottom nav button
  if (navBtn) {
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    navBtn.classList.add('active');
  }

  // Load page specific data
  if (pageId === 'page-4') initRevision();
  if (pageId === 'page-5') renderMistakes();
}

// PAGE 3: TOPICS LOGIC
function saveNewTopic() {
  const input = document.getElementById('topic-title-input');
  const title = input.value.trim();
  if (!title) return;

  const newTopic = { id: Date.now(), name: title, questions: [] };
  appData.topics.push(newTopic);
  input.value = '';

  renderTopicsGrid();
  updateDropdowns();
}

function renderTopicsGrid() {
  const grid = document.getElementById('topics-grid');
  grid.innerHTML = '';

  appData.topics.forEach(t => {
    const card = document.createElement('div');
    card.className = 'topic-card';
    card.innerText = t.name;
    card.onclick = () => openTopicModal(t.id);
    grid.appendChild(card);
  });
}

function openTopicModal(id) {
  appData.activeTopicId = id;
  const topic = appData.topics.find(t => t.id === id);
  document.getElementById('modal-topic-title').innerText = topic.name;
  document.getElementById('topic-modal').classList.remove('page-hidden');
}

function closeTopicModal() {
  document.getElementById('topic-modal').classList.add('page-hidden');
}

function toggleQuestionForm() {
  document.getElementById('q-add-box').classList.toggle('page-hidden');
}

function addQuestionToTopic() {
  const text = document.getElementById('q-text').value;
  const ans = document.getElementById('q-ans').value;
  const topic = appData.topics.find(t => t.id === appData.activeTopicId);

  topic.questions.push({ id: Date.now(), text, ans });
  alert("Question saved!");
  closeTopicModal();
}

// PAGE 4: REVISION & GROUP LOGIC
function setMode(mode) {
  appData.revMode = mode;
  document.getElementById('btn-you-mode').classList.toggle('active', mode === 'you');
  document.getElementById('btn-group-mode').classList.toggle('active', mode === 'group');
  document.getElementById('group-tools').classList.toggle('page-hidden', mode === 'you');
}

function updateDropdowns() {
  const select = document.getElementById('revision-topic-dropdown');
  const mSelect = document.getElementById('mistake-topic-select');

  select.innerHTML = '<option value="all">All Topics</option>';
  mSelect.innerHTML = '<option value="all">All Topics</option>';

  appData.topics.forEach(t => {
    select.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    mSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
  });
}

function toggleMistakeMode() {
  appData.mistakeMode = !appData.mistakeMode;
  const btn = document.getElementById('btn-mistake-mode');
  btn.innerText = `Mistake Mode: ${appData.mistakeMode ? 'ON' : 'OFF'}`;
  initRevision();
}

function initRevision() {
  let questions = [];
  const selected = document.getElementById('revision-topic-dropdown').value;

  if (selected === 'all') {
    appData.topics.forEach(t => questions.push(...t.questions));
  } else {
    const topic = appData.topics.find(t => t.id == selected);
    if (topic) questions = topic.questions;
  }

  if (questions.length > 0) {
    document.getElementById('q-text-display').innerText = questions[0].text;
    document.getElementById('q-ans-display').innerText = questions[0].ans;
  } else {
    document.getElementById('q-text-display').innerText = "No questions available.";
  }
}

function revealAnswer() {
  document.getElementById('q-ans-display').classList.remove('page-hidden');
}

function gradeUser(pts) {
  appData.score += pts;
  document.getElementById('score-display').innerText = `Score: ${appData.score}`;
  if (pts < 0) {
    appData.mistakes.push({ id: Date.now() });
  }
}

// Group Tools
function addMember() {
  const val = document.getElementById('member-input').value.trim();
  if (val) {
    appData.members.push(val);
    document.getElementById('members-chip-list').innerText = appData.members.join(', ');
    document.getElementById('member-input').value = '';
  }
}

function spinDynamicWheel() {
  if (appData.members.length === 0) return alert('Add members first!');
  const idx = Math.floor(Math.random() * appData.members.length);
  document.getElementById('spin-output').innerText = `Turn: ${appData.members[idx]}`;
}

// PAGE 5: MISTAKES LOGIC
function renderMistakes() {
  document.getElementById('mistakes-list').innerText = `Total Mistakes Recorded: ${appData.mistakes.length}`;
}