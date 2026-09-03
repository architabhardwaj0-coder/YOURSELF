/* =========================================================
   YOURSELF - Main JavaScript (Fixed & Complete)
   ========================================================= */

/* =========================================================
   1. STATE DATA
   ========================================================= */

let subjects = JSON.parse(localStorage.getItem("yourselfSubjects")) || [];
let currentSubjectId = null;
let currentQuestion = null;
let usedQuestionIds = [];
let players = [];
let currentPlayerIndex = 0;
let scores = {};

/* =========================================================
   2. HELPER & UTILITY FUNCTIONS
   ========================================================= */

function saveSubjects() {
    localStorage.setItem("yourselfSubjects", JSON.stringify(subjects));
}

// Fixed Missing Modal Controllers
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = "flex";
        modal.classList.add("active");
    }
}

function closeAllModals() {
    document.querySelectorAll(".modal").forEach(function(modal) {
        modal.style.display = "none";
        modal.classList.remove("active");
    });
}

// Fixed Missing Revision Dropdown Sync
function updateRevisionSubjects() {
    if (!revisionSubject) return;
    
    revisionSubject.innerHTML = '<option value="">-- Select Subject --</option>';
    subjects.forEach(function(subject) {
        const option = document.createElement("option");
        option.value = subject.id;
        option.textContent = subject.name;
        revisionSubject.appendChild(option);
    });
}

/* =========================================================
   3. DOM ELEMENTS
   ========================================================= */

const subjectList = document.getElementById("subjectList");
const noSubjectsMessage = document.getElementById("noSubjectsMessage");
const addSubjectButton = document.getElementById("addSubjectButton");
const subjectNameInput = document.getElementById("subjectName");
const saveSubjectButton = document.getElementById("saveSubjectButton");
const questionInput = document.getElementById("questionInput");
const answerInput = document.getElementById("answerInput");
const addQuestionButton = document.getElementById("addQuestionButton");
const revisionSubject = document.getElementById("revisionSubject");
const questionText = document.getElementById("questionText");
const answerText = document.getElementById("answerText");
const answerBox = document.getElementById("answerBox");
const showAnswerButton = document.getElementById("showAnswerButton");
const randomQuestionButton = document.getElementById("randomQuestionButton");
const correctButton = document.getElementById("correctButton");
const wrongButton = document.getElementById("wrongButton");
const playerNameInput = document.getElementById("playerName");
const addPlayerButton = document.getElementById("addPlayerButton");
const playerList = document.getElementById("playerList");
const spinButton = document.getElementById("spinButton");
const currentPlayer = document.getElementById("currentPlayer");
const scoreBoard = document.getElementById("scoreBoard");
const savedQuestions = document.getElementById("savedQuestions");

/* =========================================================
   4. NAVIGATION & INIT
   ========================================================= */

function showPage(pageId) {
    const pages = document.querySelectorAll(".page");
    pages.forEach(function(page) {
        page.classList.remove("active");
    });

    const selectedPage = document.getElementById(pageId);
    if (selectedPage) {
        selectedPage.classList.add("active");
    }

    const navigationButtons = document.querySelectorAll(".navigation-button");
    navigationButtons.forEach(function(button) {
        button.classList.remove("active");
    });
}

document.querySelectorAll(".navigation-button").forEach(function(button) {
    button.addEventListener("click", function() {
        const target = button.dataset.page;
        if (target) {
            showPage(target);
        }
    });
});

/* =========================================================
   5. DISPLAY SUBJECTS
   ========================================================= */

function displaySubjects() {
    if (!subjectList) return;

    subjectList.innerHTML = "";

    if (subjects.length === 0) {
        if (noSubjectsMessage) noSubjectsMessage.style.display = "block";
        updateRevisionSubjects();
        return;
    }

    if (noSubjectsMessage) noSubjectsMessage.style.display = "none";

    subjects.forEach(function(subject) {
        const card = document.createElement("div");
        card.className = "subject-card";

        const title = document.createElement("h3");
        title.textContent = subject.name;

        const information = document.createElement("p");
        information.textContent = `${subject.questions ? subject.questions.length : 0} question(s)`;

        const openButton = document.createElement("button");
        openButton.className = "open-subject-button";
        openButton.textContent = "Open";
        openButton.addEventListener("click", function() {
            openSubject(subject.id);
        });

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-subject-button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", function() {
            deleteSubject(subject.id);
        });

        card.appendChild(title);
        card.appendChild(information);
        card.appendChild(openButton);
        card.appendChild(deleteButton);
        subjectList.appendChild(card);
    });

    updateRevisionSubjects();
}

/* =========================================================
   6. SUBJECT MANAGEMENT (Add, Delete, Open)
   ========================================================= */

if (saveSubjectButton) {
    saveSubjectButton.addEventListener("click", function() {
        if (!subjectNameInput) return;
        const name = subjectNameInput.value.trim();

        if (name === "") {
            alert("Please enter a subject name.");
            return;
        }

        const alreadyExists = subjects.some(function(subject) {
            return subject.name.toLowerCase() === name.toLowerCase();
        });

        if (alreadyExists) {
            alert("This subject already exists.");
            return;
        }

        const newSubject = {
            id: Date.now().toString(),
            name: name,
            questions: []
        };

        subjects.push(newSubject);
        saveSubjects();
        subjectNameInput.value = "";
        closeAllModals();
        displaySubjects();
    });
}

function deleteSubject(subjectId) {
    const subject = subjects.find(function(item) {
        return item.id === subjectId;
    });

    if (!subject) return;

    if (!confirm(`Delete "${subject.name}"?`)) return;

    subjects = subjects.filter(function(item) {
        return item.id !== subjectId;
    });

    saveSubjects();
    displaySubjects();
}

function openSubject(subjectId) {
    currentSubjectId = subjectId;
    const subject = subjects.find(function(item) {
        return item.id === subjectId;
    });

    if (!subject) return;

    const selectedSubjectName = document.getElementById("selectedSubjectName");
    if (selectedSubjectName) {
        selectedSubjectName.textContent = subject.name;
    }

    displaySavedQuestions();
    openModal("subjectDetailsModal");
}

/* =========================================================
   7. QUESTION MANAGEMENT (Fixed Incomplete Code)
   ========================================================= */

if (addQuestionButton) {
    addQuestionButton.addEventListener("click", function() {
        if (!questionInput || !answerInput || !currentSubjectId) return;

        const qText = questionInput.value.trim();
        const aText = answerInput.value.trim();

        if (!qText || !aText) {
            alert("Please enter both question and answer.");
            return;
        }

        const subject = subjects.find(s => s.id === currentSubjectId);
        if (subject) {
            subject.questions.push({
                id: Date.now().toString(),
                question: qText,
                answer: aText
            });
            saveSubjects();
            displaySavedQuestions();
            displaySubjects();
            questionInput.value = "";
            answerInput.value = "";
        }
    });
}

function displaySavedQuestions() {
    if (!savedQuestions) return;

    savedQuestions.innerHTML = "";

    const subject = subjects.find(function(item) {
        return item.id === currentSubjectId;
    });

    if (!subject || !subject.questions || subject.questions.length === 0) {
        savedQuestions.innerHTML = "<p>No questions added yet.</p>";
        return;
    }

    subject.questions.forEach(function(q, index) {
        const item = document.createElement("div");
        item.className = "question-item";
        item.style.marginBottom = "10px";
        item.innerHTML = `
            <strong>Q${index + 1}: ${q.question}</strong>
            <p>A: ${q.answer}</p>
            <button onclick="deleteQuestion('${q.id}')" style="color:red; background:none; border:none; cursor:pointer;">Delete</button>
        `;
        savedQuestions.appendChild(item);
    });
}

function deleteQuestion(questionId) {
    const subject = subjects.find(s => s.id === currentSubjectId);
    if (!subject) return;

    subject.questions = subject.questions.filter(q => q.id !== questionId);
    saveSubjects();
    displaySavedQuestions();
    displaySubjects();
}

// Initial Call on Load
displaySubjects();