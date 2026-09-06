// State Management
let appData = {
  topics: [],
  mistakes: [],
  members: [],
  punishments: [],
  score: 0,
  revMode: 'you', // 'you' or 'group'
  mistakeMode: false,
  selectedTopic: 'all',
  currentQIndex: 0
};

// Authentication Tabs & Flow
function switchAuthTab(type) {
  document.getElementById('tab-signup').classList.toggle('active', type === 'signup');
  document.getElementById('tab-signin').classList.toggle('active', type === 'signin');
  document.getElementById('form-signup').classList.toggle('hidden', type !== 'signup');
  document.getElementById('form-signin').classList.toggle('hidden', type !== 'signin');
}

function handleAuth(event) {
  event.preventDefault();
  document.getElementById('page-home').classList.remove('active');
  document.getElementById('app-container').classList.remove('hidden');
}

function logout() {
  document.getElementById('app-container').classList.add('hidden');
  document.getElementById('page-home').classList.add('active');
}

function toggleMenu() {
  document.getElementById('dropdown-menu').classList.toggle('hidden');
}

// Navigation
function switchPage(pageName) {
  document.querySelectorAll('.app-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  document.getElementById(`page-${pageName}`).classList.add('active');
  if (pageName === 'revision') loadRevisionQuestions();
  if (pageName === 'mistakes') renderMistakesList();
}

// TOPICS MANAGEMENT (PAGE 3)
function addTopic() {
  const name = document.getElementById('topic-input').value.trim();
  if (!name) return;
  const newTopic = { id: Date.now(), name: name, questions: [] };
  appData.topics.push(newTopic);
  document.getElementById('topic-input').value = '';
  renderTopicsGrid();
  updateTopicDropdowns();
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

let activeTopicId = null;
function openTopicModal(id) {
  activeTopicId = id;
  const topic = appData.topics.find(t => t.id === id);
  document.getElementById('modal-topic-title').innerText = topic.name;
  document.getElementById('topic-modal').classList.remove('hidden');
}

function closeTopicModal() {
  document.getElementById('topic-modal').classList.add('hidden');
}

function showQuestionForm() {
  document.getElementById('add-q-form').classList.remove('hidden');
}

function saveQuestionToTopic() {
  const text = document.getElementById('q-text').value;
  const ans = document.getElementById('q-ans').value;
  const type = document.getElementById('q-type').value;

  const topic = appData.topics.find(t => t.id === activeTopicId);
  topic.questions.push({ id: Date.now(), text, ans, type });
  alert("Question added successfully!");
  closeTopicModal();
}

// REVISION PAGE LOGIC (PAGE 4)
function setRevisionMode(mode) {
  appData.revMode = mode;
  document.getElementById('btn-mode-you').classList.toggle('active', mode === 'you');
  document.getElementById('btn-mode-group').classList.toggle('active', mode === 'group');
  document.getElementById('group-controls').classList.toggle('hidden', mode === 'you');
}

function updateTopicDropdowns() {
  const select = document.getElementById('revision-topic-select');
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
  document.getElementById('btn-mistake-toggle').innerText = `Mistake Mode: ${appData.mistakeMode ? 'ON' : 'OFF'}`;
  loadRevisionQuestions();
}

function loadRevisionQuestions() {
  let questions = [];
  const selected = document.getElementById('revision-topic-select').value;
  
  if (selected === 'all') {
    appData.topics.forEach(t => questions.push(...t.questions));
  } else {
    const t = appData.topics.find(top => top.id == selected);
    if (t) questions = t.questions;
  }

  if (appData.mistakeMode) {
    const mistakeIds = appData.mistakes.map(m => m.questionId);
    questions = questions.filter(q => mistakeIds.includes(q.id));
  }

  if (questions.length > 0) {
    const q = questions[0];
    document.getElementById('q-display-text').innerText = q.text;
    document.getElementById('hidden-answer').innerText = q.ans;
  } else {
    document.getElementById('q-display-text').innerText = "No questions found.";
  }
}

function showAnswer() {
  document.getElementById('hidden-answer').classList.remove('hidden');
}

function gradeAnswer(isCorrect) {
  if (isCorrect) {
    appData.score += 10;
  } else {
    appData.score -= 20;
    // Add to mistakes
    appData.mistakes.push({
      topicId: document.getElementById('revision-topic-select').value,
      questionId: Date.now(),
      mode: appData.revMode
    });
  }
  document.getElementById('score-display').innerText = `Score: ${appData.score}`;
}

// SPINNER & PUNISHMENT (GROUP MODE)
function addGroupMember() {
  const name = document.getElementById('member-name').value;
  if (name) {
    appData.members.push(name);
    document.getElementById('members-list').innerText = appData.members.join(', ');
  }
}

function spinWheel() {
  if (appData.members.length === 0) return alert("Add members first!");
  const randomIndex = Math.floor(Math.random() * appData.members.length);
  document.getElementById('spin-result').innerText = `Turn: ${appData.members[randomIndex]}`;
}

// MISTAKES PAGE LOGIC (PAGE 5)
function renderMistakesList() {
  const container = document.getElementById('mistakes-container');
  container.innerHTML = `<p>Total Mistakes Saved: ${appData.mistakes.length}</p>`;
}