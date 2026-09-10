document.addEventListener('DOMContentLoaded', () => {
    // State management
    let currentUser = JSON.parse(localStorage.getItem('user')) || null;
    let currentTopicId = null;
    let currentTopicName = null;
    let selectedQuestionType = null;
    let questionsList = [];
    let currentQuestionIndex = 0;
    let currentScore = 0;
    let mistakeQueue = [];

    // Navigation utility
    function switchPage(pageId) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
    }

    if (currentUser) {
        switchPage('page-dashboard');
    }

    // --- Page 1: Auth & Modals ---
    const signupModal = document.getElementById('signup-modal');
    const signinModal = document.getElementById('signin-modal');

    document.getElementById('show-signup-btn').onclick = () => signupModal.classList.remove('hidden');
    document.getElementById('show-signin-btn').onclick = () => signinModal.classList.remove('hidden');

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = (e) => e.target.closest('.modal').classList.add('hidden');
    });

    // Sign Up Logic
    document.getElementById('signup-form').onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('su-username').value;
        const email = document.getElementById('su-email').value;
        const password = document.getElementById('su-password').value;

        if (!email.endsWith('.com')) {
            alert('Email must end with .com');
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
                signupModal.classList.add('hidden');
                switchPage('page-dashboard');
            } else {
                alert(data.error);
            }
        } catch (err) { console.error(err); }
    };

    // Sign In Logic
    document.getElementById('signin-form').onsubmit = async (e) => {
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
                signinModal.classList.add('hidden');
                switchPage('page-dashboard');
            } else {
                alert(data.error);
            }
        } catch (err) { console.error(err); }
    };

    // --- Page 2: Dashboard Menu ---
    const hamburgerToggle = document.getElementById('hamburger-toggle');
    const dropdownMenu = document.getElementById('dropdown-menu');
    hamburgerToggle.onclick = () => dropdownMenu.classList.toggle('hidden');

    document.getElementById('menu-logout').onclick = () => {
        localStorage.removeItem('user');
        currentUser = null;
        switchPage('page-landing');
    };

    // Card Clicks
    document.querySelectorAll('.dash-card').forEach(card => {
        card.onclick = () => {
            const target = card.getAttribute('data-target');
            if (target === 'topic') {
                switchPage('page-topic');
                loadTopics();
            } else if (target === 'revision') {
                switchPage('page-revision');
                loadRevisionTopics();
            } else {
                alert(`${target.toUpperCase()} feature coming up!`);
            }
        };
    });

    // Back Buttons Handler
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.onclick = () => {
            const target = btn.getAttribute('data-back');
            if (target === 'dashboard') switchPage('page-dashboard');
            if (target === 'topic') switchPage('page-topic');
        };
    });

    // --- Page 3: Topic Page & Zig-Zag Grid ---
    const topicInput = document.getElementById('topic-input');
    topicInput.onkeypress = async (e) => {
        if (e.key === 'Enter' && topicInput.value.trim() !== '') {
            const topicName = topicInput.value.trim();
            try {
                const res = await fetch('/api/topics', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ user_id: currentUser.id, name: topicName })
                });
                if (res.ok) {
                    topicInput.value = '';
                    loadTopics();
                }
            } catch (err) { console.error(err); }
        }
    };

    async function loadTopics() {
        try {
            const res = await fetch(`/api/topics?user_id=${currentUser.id}`);
            const topics = await res.json();
            const container = document.getElementById('topics-container');
            container.innerHTML = '';
            topics.forEach(t => {
                const card = document.createElement('div');
                card.className = 'topic-card';
                card.textContent = t.name;
                card.onclick = () => {
                    currentTopicId = t.id;
                    currentTopicName = t.name;
                    document.getElementById('current-topic-title').textContent = t.name;
                    switchPage('page-questions');
                };
                container.appendChild(card);
            });
        } catch (err) { console.error(err); }
    }

    // --- Page 4: Add Questions Logic ---
    const qTypeModal = document.getElementById('q-type-modal');
    const qInputModal = document.getElementById('q-input-modal');

    document.getElementById('open-q-modal').onclick = () => qTypeModal.classList.remove('hidden');

    document.querySelectorAll('.q-type-opt').forEach(opt => {
        opt.onclick = () => {
            selectedQuestionType = opt.getAttribute('data-type');
            document.getElementById('selected-type-title').textContent = `Add ${opt.textContent}`;
            qTypeModal.classList.add('hidden');
            qInputModal.classList.remove('hidden');
        };
    });

    // Tab switching inside input methods
    document.querySelectorAll('.tab-btn').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.method-panel').forEach(p => p.classList.add('hidden'));
            tab.classList.add('active');
            document.getElementById(`method-${tab.getAttribute('data-method')}`).classList.remove('hidden');
        };
    });

    document.getElementById('save-question-btn').onclick = async () => {
        const qText = document.getElementById('q-text').value;
        const aText = document.getElementById('a-text').value;
        const optText = document.getElementById('opt-text').value;

        if (!qText || !aText) {
            alert('Please fill question and answer fields.');
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
                    options: optText
                })
            });
            if (res.ok) {
                alert('Question saved successfully!');
                document.getElementById('q-text').value = '';
                document.getElementById('a-text').value = '';
                document.getElementById('opt-text').value = '';
                qInputModal.classList.add('hidden');
            }
        } catch (err) { console.error(err); }
    };

    // --- Page 5: Revision System & Workflow ---
    async function loadRevisionTopics() {
        try {
            const res = await fetch(`/api/topics?user_id=${currentUser.id}`);
            const topics = await res.json();
            const container = document.getElementById('revision-topics-list');
            container.innerHTML = '';
            topics.forEach(t => {
                const card = document.createElement('div');
                card.className = 'topic-card';
                card.textContent = t.name;
                card.onclick = () => startRevisionSession(t.id);
                container.appendChild(card);
            });
        } catch (err) { console.error(err); }
    }

    async function startRevisionSession(topicId) {
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
            document.getElementById('live-score').textContent = currentScore;
            document.getElementById('revision-session').classList.remove('hidden');
            displayNextQuestion();
        } catch (err) { console.error(err); }
    }

    document.getElementById('quit-revision').onclick = () => {
        document.getElementById('revision-session').classList.add('hidden');
    };

    function displayNextQuestion() {
        const flowMode = document.getElementById('rev-flow-type').value;
        if (flowMode === 'random' && questionsList.length > 0) {
            currentQuestionIndex = Math.floor(Math.random() * questionsList.length);
        }

        if (currentQuestionIndex >= questionsList.length) {
            if (mistakeQueue.length > 0) {
                questionsList = [...mistakeQueue];
                mistakeQueue = [];
                currentQuestionIndex = 0;
            } else {
                alert(`Revision completed! Final Score: ${currentScore}`);
                document.getElementById('revision-session').classList.add('hidden');
                return;
            }
        }

        const q = questionsList[currentQuestionIndex];
        document.getElementById('quiz-q-text').textContent = q.question_text;
        document.getElementById('quiz-answer-input').value = '';
        document.getElementById('quiz-feedback').textContent = '';
        
        const optContainer = document.getElementById('quiz-options-container');
        optContainer.innerHTML = '';
        if (q.options) {
            q.options.split(',').forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'q-type-opt';
                btn.textContent = opt.trim();
                btn.onclick = () => {
                    document.getElementById('quiz-answer-input').value = opt.trim();
                };
                optContainer.appendChild(btn);
            });
        }
    }

    document.getElementById('submit-answer-btn').onclick = () => {
        const userAns = document.getElementById('quiz-answer-input').value.trim();
        const q = questionsList[currentQuestionIndex];
        const mistakeModeOn = document.getElementById('mistake-mode-toggle').checked;
        const feedback = document.getElementById('quiz-feedback');

        if (userAns.toLowerCase() === q.answer_text.toLowerCase()) {
            currentScore += 10;
            feedback.style.color = 'green';
            feedback.textContent = 'Correct! +10 Points';
        } else {
            currentScore -= 20;
            feedback.style.color = 'red';
            feedback.textContent = `Wrong! Correct answer was: ${q.answer_text}`;
            if (mistakeModeOn) {
                mistakeQueue.push(q);
            }
        }

        document.getElementById('live-score').textContent = currentScore;
        currentQuestionIndex++;

        setTimeout(() => {
            displayNextQuestion();
        }, 1500);
    };
});