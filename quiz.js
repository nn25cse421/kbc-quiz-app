// TODO: replace this with your real Vercel URL once deployed
// Example: "https://kbc-quiz-app-xxxx.vercel.app"
const BASE_URL = "https://kbc-quiz-app-ian9.vercel.app";

let questions = [];
let currentIndex = 0;
let score = 0;

const startScreen = document.getElementById("start-screen");
const quizScreen = document.getElementById("quiz-screen");
const resultScreen = document.getElementById("result-screen");
const errorScreen = document.getElementById("error-screen");

const qNumberEl = document.getElementById("q-number");
const qTotalEl = document.getElementById("q-total");
const questionTextEl = document.getElementById("question-text");
const optionsEl = document.getElementById("options");
const scoreTextEl = document.getElementById("score-text");

function showScreen(screen) {
  [startScreen, quizScreen, resultScreen, errorScreen].forEach(s => s.classList.add("hidden"));
  screen.classList.remove("hidden");
}

async function startQuiz(difficulty) {
  try {
    const res = await fetch(`${BASE_URL}/questions/${difficulty}.json`);
    if (!res.ok) throw new Error("Failed to fetch questions");
    questions = await res.json();

    currentIndex = 0;
    score = 0;
    qTotalEl.textContent = questions.length;

    showScreen(quizScreen);
    renderQuestion();
  } catch (err) {
    console.error(err);
    showScreen(errorScreen);
  }
}

function renderQuestion() {
  const q = questions[currentIndex];
  qNumberEl.textContent = currentIndex + 1;
  questionTextEl.textContent = q.question;
  optionsEl.innerHTML = "";

  q.options.forEach(option => {
    const btn = document.createElement("button");
    btn.textContent = option;
    btn.onclick = () => selectAnswer(option, btn);
    optionsEl.appendChild(btn);
  });
}

function selectAnswer(selected, btnEl) {
  const q = questions[currentIndex];
  const allButtons = optionsEl.querySelectorAll("button");
  allButtons.forEach(b => b.disabled = true);

  if (selected === q.answer) {
    btnEl.classList.add("correct");
    score++;
  } else {
    btnEl.classList.add("wrong");
    allButtons.forEach(b => {
      if (b.textContent === q.answer) b.classList.add("correct");
    });
  }

  setTimeout(() => {
    currentIndex++;
    if (currentIndex < questions.length) {
      renderQuestion();
    } else {
      finishQuiz();
    }
  }, 1000);
}

function finishQuiz() {
  scoreTextEl.textContent = `You scored ${score} / ${questions.length}`;
  showScreen(resultScreen);
}

function restartQuiz() {
  showScreen(startScreen);
}
