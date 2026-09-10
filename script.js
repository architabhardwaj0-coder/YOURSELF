document.addEventListener('DOMContentLoaded', () => {
    let currentUser = JSON.parse(localStorage.getItem('user')) || null;
    let currentTopicId = null;
    let currentTopicName = null;
    let selectedQuestionType = null;
    let questionsList = [];
    let currentQuestionIndex = 0;
    let currentScore = 0;
    let mistakeQueue = [];

    function switchPage(pageId) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
    }

    if (currentUser) {
        switchPage('page-dashboard');
    }

    // --- Page 1: Auth & Modals Logic ---
    const modalSignup = document.getElementById('modal-signup');
    const modalSignin = document.getElementById('modal-signin');

    document.getElementById('btn-open-signup').onclick = () => modalSignup.classList.remove('hidden');
    document.getElementById('btn-open-signin').onclick = () => modalSignin.classList.remove('hidden');

    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.onclick = (e) => e.target.closest('.custom-modal').classList.add('hidden');
    });

    document.getElementById('form-signup').onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('su-username').value;
        const email = document.getElementById('su-email').value;
        const password = document.getElementById('su-password').value;

        if (!email.endsWith('.com')) {
            alert('Email must include .com validation.');
            return;
        }

        try {
            const res = await fetch('/api/signup', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ username, email, password })
            });
            const data = await res.json();
            if (res.ok) {
                currentUser = { id: data.user_id, username: data.username };
                localStorage.setItem('user', JSON.stringify(currentUser));
                modalSignup.classList.add('hidden');
                switchPage('page-dashboard');
            } else {
                alert(data.error);
            }
        } catch (err) { console.error(err); }
    };

    document.getElementById('form-signin').onsubmit = async (e) => {
        e.preventDefault();
        const identifier = document.getElementById('si-identifier').value;
        const password = document.getElementById('si-password').value;

        try {
            const res = await fetch('/api/signin', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ identifier, password })
            });
            const data = await res.json();
            if (res.ok) {
                currentUser = { id: data.user_id, username: data.username };
                localStorage.setItem('user', JSON.stringify(currentUser));
                modalSignin.classList.add('hidden');
                switchPage('page-dashboard');
            } else {
                alert(data.error);
            }
        } catch (err) { console.error(err); }
    };

    // --- Page 2: Dashboard Menu ---
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const dropdownBox = document.getElementById('dropdown-box');
    hamburgerBtn.onclick = () => dropdownBox.classList.toggle('hidden');

    document.getElementById('logout-btn').onclick = () => {
        localStorage.removeItem('user');
        currentUser = null;
        switchPage('page-landing');
    };

    document.querySelectorAll('.dash-option-box').forEach(box => {
        box.onclick = () => {
            const pageType = box.getAttribute('data-page');
            if (pageType === 'topic') {
                switchPage('page-topic');
                loadTopicsList();
            } else if (pageType === 'revision') {
                switchPage('page-revision');
                loadRevisionTopicsList();
            } else {
                alert(`${pageType.toUpperCase()} module is ready for next integration.`);
            }
        };
    });

    document.querySelectorAll('.back-navigation-btn').forEach(btn => {
        btn.onclick = () => {
            const target = btn.getAttribute('data-target');
            if (target === 'dashboard') switchPage('page-dashboard');
            if (target === 'topic') switchPage('page-topic');
        };
    });

    // --- Page 3: Topic Page & Zig-Zag Layout ---
    const topicInputField = document.getElementById('topic-input-field');
    topicInputField.onkeypress = async (e) => {
        if (e.key === 'Enter' && topicInputField.value.trim() !== '') {
            const topicName = topicInputField.value.trim();
            try {
                const res = await fetch('/api/topics', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ user_id: currentUser.id, name: topicName })
                });
                if (res.ok) {
                    topicInputField.value = '';
                    loadTopicsList();
                }
            } catch (err) { console.error(err); }
        }
    };

    async function loadTopicsList() {
        try {
            const res = await fetch(`/api/topics?user_id=${currentUser.id}`);
            const topics = await res.json();
            const container = document.getElementById('topics-zigzag-list');
            container.innerHTML = '';
            topics.forEach(t => {
                const item = document.createElement('div');
                item.className = 'topic-item-card';
                item.textContent = t.name;
                item.onclick = () => {
                    currentTopicId = t.id;
                    currentTopicName = t.name;
                    document.getElementById('active-topic-name-header').textContent = t.name;
                    switchPage('page-questions');
                };
                container.appendChild(item);
            });
        } catch (err) { console.error(err); }
    }

    // --- Page 4: Add Questions Modals & Input Logic ---
    const modalQType = document.getElementById('modal-q-type');
    const modalQInput = document.getElementById('modal-q-input');

    document.getElementById('open-question-type-modal').onclick = () => modalQType.classList.remove('hidden');

    document.querySelectorAll('.modal-action-btn').forEach(btn => {
        btn.onclick = () => {
            selectedQuestionType = btn.getAttribute('data-qtype');
            document.getElementById('modal-input-heading').textContent = `Add ${btn.textContent}`;
            modalQType.classList.add('hidden');
            modalQInput.classList.remove('hidden');
        };
    });

    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
            tab.classList.add('active');
            document.getElementById(`tab-panel-${tab.getAttribute('data-tab')}`).classList.remove('hidden');
        };
    });

    document.getElementById('save-question-submit').onclick = async () => {
        const qText = document.getElementById('q-text-input').value;
        const aText = document.getElementById('a-text-input').value;
        const optionsText = document.getElementById('options-text-input').value;

        if (!qText || !aText) {
            alert('Please enter both question and answer text.');
            return;
        }

        try {
            const res = await fetch('/api/questions', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    topic_id: currentTopicId,
                    q_type: selectedQuestionType,
                    question_text: qText,
                    answer_text: aText,
                    options: optionsText
                })
            });
            if (res.ok) {
                alert('Question successfully saved!');
                document.getElementById('q-text-input').value = '';
                document.getElementById('a-text-input').value = '';
                document.getElementById('options-text-input').value = '';
                modalQInput.classList.add('hidden');
            }
        } catch (err) { console.error(err); }
    };

    // --- Page 5: Revision System & Workflow ---
    async function loadRevisionTopicsList() {
        try {
            const res = await fetch(`/api/topics?user_id=${currentUser.id}`);
            const topics = await res.json();
            const container = document.getElementById('revision-topics-zigzag');
            container.innerHTML = '';
            topics.forEach(t => {
                const item = document.createElement('div');
                item.className = 'topic-item-card';
                item.textContent = t.name;
                item.onclick = () => launchQuizSession(t.id);
                container.appendChild(item);
            });
        } catch (err) { console.error(err); }
    }

    async function launchQuizSession(topicId) {
        try {
            const res = await fetch(`/api/questions?topic_id=${topicId}`);
            questionsList = await res.json();
            if (questionsList.length === 0) {
                alert('No questions found for this topic!');
                return;
            }
            currentScore = 0;
            currentQuestionIndex = 0;
            mistakeQueue = [];
            document.getElementById('current-score-num').textContent = currentScore;
            document.getElementById('quiz-session-overlay').classList.remove('hidden');
            renderQuizQuestion();
        } catch (err) { console.error(err); }
    }

    document.getElementById('quit-quiz-btn').onclick = () => {
        document.getElementById('quiz-session-overlay').classList.add('hidden');
    };

    function renderQuizQuestion() {
        const flowMode = document.getElementById('rev-flow-dropdown').value;
        if (flowMode === 'random' && questionsList.length > 0) {
            currentQuestionIndex = Math.floor(Math.random() * questionsList.length);
        }

        if (currentQuestionIndex >= questionsList.length) {
            if (mistakeQueue.length > 0) {
                questionsList = [...mistakeQueue];
                mistakeQueue = [];
                currentQuestionIndex = 0;
            } else {
                alert(`Revision finished! Final Score: ${currentScore}`);
                document.getElementById('quiz-session-overlay').classList.add('hidden');
                return;
            }
        }

        const q = questionsList[currentQuestionIndex];
        document.getElementById('quiz-q-title').textContent = q.question_text;
        document.getElementById('quiz-user-input').value = '';
        document.getElementById('quiz-feedback-msg').textContent = '';

        const optionsContainer = document.getElementById('quiz-options-container');
        optionsContainer.innerHTML = '';
        if (q.options) {
            q.options.split(',').forEach(opt => {
                const pill = document.createElement('button');
                pill.className = 'quiz-option-pill';
                pill.textContent = opt.trim();
                pill.onclick = () => {
                    document.getElementById('quiz-user-input').value = opt.trim();
                };
                optionsContainer.appendChild(pill);
            });
        }
    }

    document.getElementById('submit-quiz-answer-btn').onclick = () => {
        const userAns = document.getElementById('quiz-user-input').value.trim();
        const q = questionsList[currentQuestionIndex];
        const mistakeModeOn = document.getElementById('mistake-mode-switch').checked;
        const feedbackEl = document.getElementById('quiz-feedback-msg');

        if (userAns.toLowerCase() === q.answer_text.toLowerCase()) {
            currentScore += 10;
            feedbackEl.style.color = '#28a745';
            feedbackEl.textContent = 'Correct! (+10 Points)';
        } else {
            currentScore -= 20;
            feedbackEl.style.color = '#dc3545';
            feedbackEl.textContent = `Wrong! Correct answer: ${q.answer_text}`;
            if (mistakeModeOn) {
                mistakeQueue.push(q);
            }
        }

        document.getElementById('current-score-num').textContent = currentScore;
        currentQuestionIndex++;

        setTimeout(() => {
            renderQuizQuestion();
        }, 1500);
    };
});