// ===== CONFIG =====
const BASE_URL = "https://kbc-quiz-app-ian9.vercel.app";
const QUESTION_TIME = 30; // seconds per question

const MONEY_LADDERS = {
  easy:   [1000, 2000, 3000, 5000, 10000],
  medium: [20000, 40000, 80000, 160000, 320000],
  hard:   [640000, 1250000, 2500000, 5000000, 10000000]
};
const MILESTONE_INDEX = 2; // guaranteed amount marker (3rd rung)

// ===== STATE =====
let questions = [];
let currentIndex = 0;
let difficulty = "easy";
let ladder = [];
let selectedOption = null;
let pendingOption = null;
let timerInterval = null;
let timeLeft = QUESTION_TIME;
let usedLifelines = { fifty: false, poll: false, flip: false };
let bankedAmount = 0;

// ===== DOM =====
const screens = {
  intro: document.getElementById("intro-screen"),
  start: document.getElementById("start-screen"),
  quiz: document.getElementById("quiz-screen"),
  result: document.getElementById("result-screen"),
  error: document.getElementById("error-screen")
};

const el = {
  tapStart: document.getElementById("tap-start-btn"),
  tapPrompt: document.getElementById("tap-prompt"),
  introContent: document.getElementById("intro-content"),
  diffCards: document.querySelectorAll(".diff-card"),
  prizeAmount: document.getElementById("prize-amount"),
  qNumber: document.getElementById("q-number"),
  qTotal: document.getElementById("q-total"),
  questionText: document.getElementById("question-text"),
  options: document.getElementById("options"),
  ladder: document.getElementById("ladder"),
  timerFill: document.getElementById("timer-fill"),
  timerText: document.getElementById("timer-text"),
  timerWrap: document.querySelector(".timer-wrap"),
  quitBtn: document.getElementById("quit-bank-btn"),
  quitAmount: document.getElementById("quit-amount"),
  pollResult: document.getElementById("poll-result"),
  ll5050: document.getElementById("ll-5050"),
  llPoll: document.getElementById("ll-poll"),
  llFlip: document.getElementById("ll-flip"),
  modal: document.getElementById("lockin-modal"),
  lockinChoice: document.getElementById("lockin-choice"),
  lockinConfirm: document.getElementById("lockin-confirm"),
  lockinCancel: document.getElementById("lockin-cancel"),
  resultEyebrow: document.getElementById("result-eyebrow"),
  resultHeading: document.getElementById("result-heading"),
  resultAmount: document.getElementById("result-amount"),
  resultSub: document.getElementById("result-sub"),
  playAgain: document.getElementById("play-again-btn"),
  retryBtn: document.getElementById("retry-btn"),
  confettiLayer: document.getElementById("confetti-layer"),
  wrongFlash: document.getElementById("wrong-flash")
};

function triggerWrongFX() {
  el.wrongFlash.classList.remove("active");
  void el.wrongFlash.offsetWidth; // restart animation
  el.wrongFlash.classList.add("active");

  document.body.classList.remove("screen-shake");
  void document.body.offsetWidth;
  document.body.classList.add("screen-shake");
}

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

function formatINR(num) {
  // Indian digit grouping: last 3 digits, then groups of 2
  const s = String(num);
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return grouped + "," + last3;
}
function money(num) { return "₹" + formatINR(num); }

// ===== SOUND (Web Audio API — synthesized, no files) =====
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function tone(freq, duration, type = "sine", startGain = 0.15, delay = 0) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = startGain;
  osc.connect(gain).connect(audioCtx.destination);
  const t0 = audioCtx.currentTime + delay;
  gain.gain.setValueAtTime(startGain, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

// low, punchy "timpani" style hit using a fast pitch drop
function thump(delay = 0, startFreq = 160, gain = 0.3) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = "sine";
  osc.connect(g).connect(audioCtx.destination);
  const t0 = audioCtx.currentTime + delay;
  osc.frequency.setValueAtTime(startFreq, t0);
  osc.frequency.exponentialRampToValueAtTime(startFreq * 0.4, t0 + 0.25);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
  osc.start(t0);
  osc.stop(t0 + 0.4);
}

// bright shimmering cymbal/gong swell — built from filtered noise
function cymbalSwell(delay = 0, duration = 1.4, gain = 0.22) {
  if (!audioCtx) return;
  const bufferSize = Math.floor(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const decay = Math.pow(1 - i / bufferSize, 1.8);
    data[i] = (Math.random() * 2 - 1) * decay;
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const hp = audioCtx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 3000;

  const g = audioCtx.createGain();
  g.gain.value = gain;

  noise.connect(hp).connect(g).connect(audioCtx.destination);
  noise.start(audioCtx.currentTime + delay);
}

// rich bell-like chord tone with a touch of chorus (slightly detuned layer)
function bell(freq, delay = 0, duration = 1.2, gain = 0.13) {
  if (!audioCtx) return;
  [0, 4].forEach((detune, i) => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(g).connect(audioCtx.destination);
    const t0 = audioCtx.currentTime + delay;
    const layerGain = i === 0 ? gain : gain * 0.5;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(layerGain, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  });
}

const sound = {
  tick: () => tone(880, 0.06, "square", 0.05),
  select: () => tone(520, 0.08, "triangle", 0.08),
  lockWhoosh: () => { tone(200, 0.4, "sawtooth", 0.06); tone(300, 0.4, "sawtooth", 0.04, 0.05); },
  correct: () => { tone(523, 0.15, "sine", 0.12); tone(659, 0.15, "sine", 0.12, 0.12); tone(784, 0.25, "sine", 0.14, 0.24); },
  wrong: () => {
    tone(180, 0.5, "sawtooth", 0.18);
    tone(120, 0.6, "sawtooth", 0.16, 0.15);
    tone(80, 0.7, "square", 0.14, 0.3);
  },
  levelUp: () => { tone(660, 0.12, "sine", 0.1); tone(880, 0.18, "sine", 0.12, 0.1); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, "sine", 0.12, i * 0.14)); },
  tap: () => { tone(700, 0.05, "sine", 0.1); tone(1000, 0.04, "sine", 0.06, 0.03); },
  diffEasy: () => { tone(659, 0.15, "sine", 0.12); tone(880, 0.2, "sine", 0.12, 0.1); },
  diffMedium: () => { tone(494, 0.12, "triangle", 0.13); tone(659, 0.15, "triangle", 0.13, 0.09); tone(880, 0.2, "triangle", 0.13, 0.18); },
  diffHard: () => {
    thump(0, 130, 0.3);
    tone(392, 0.15, "sawtooth", 0.12, 0.05);
    tone(523, 0.18, "sawtooth", 0.13, 0.14);
    tone(659, 0.25, "sawtooth", 0.14, 0.23);
  },

  // The big reveal: sub boom + shimmering cymbal swell + rich bell chord, all landing together
  reveal: () => {
    thump(0, 100, 0.35);
    cymbalSwell(0, 1.4, 0.22);
    [523.25, 659.25, 784.0, 1046.5].forEach((f) => bell(f, 0.05, 1.3, 0.12));
  }
};

// ===== INTRO =====
// First tap ANYWHERE on the intro screen triggers the big reveal + sound together
el.tapPrompt.addEventListener("click", () => {
  ensureAudio();
  sound.tap();
  setTimeout(() => sound.reveal(), 90);

  el.tapPrompt.classList.add("fading-out");
  el.introContent.classList.add("reveal");

  // show the "Take the Hot Seat" button shortly after the reveal lands
  setTimeout(() => {
    el.tapStart.classList.remove("hidden");
  }, 900);
});

el.tapStart.addEventListener("click", (e) => {
  e.stopPropagation();
  sound.select();
  showScreen("start");
});

// ===== DIFFICULTY SELECT =====
el.diffCards.forEach(card => {
  card.addEventListener("click", () => {
    const diffSounds = { easy: sound.diffEasy, medium: sound.diffMedium, hard: sound.diffHard };
    (diffSounds[card.dataset.diff] || sound.select)();
    startQuiz(card.dataset.diff);
  });
});

async function startQuiz(diff) {
  difficulty = diff;
  ladder = MONEY_LADDERS[diff];
  usedLifelines = { fifty: false, poll: false, flip: false };
  [el.ll5050, el.llPoll, el.llFlip].forEach(b => { b.disabled = false; b.classList.remove("used"); });
  bankedAmount = 0;

  try {
    const res = await fetch(`${BASE_URL}/questions/${diff}.json`);
    if (!res.ok) throw new Error("Failed to fetch questions");
    questions = await res.json();

    currentIndex = 0;
    el.qTotal.textContent = questions.length;
    showScreen("quiz");
    renderLadder();
    renderQuestion();
  } catch (err) {
    console.error(err);
    showScreen("error");
  }
}

el.retryBtn.addEventListener("click", () => startQuiz(difficulty));

// ===== LADDER =====
function renderLadder() {
  el.ladder.innerHTML = "";
  ladder.forEach((amount, i) => {
    const rung = document.createElement("div");
    rung.className = "ladder-rung";
    if (i < currentIndex) rung.classList.add("passed");
    if (i === currentIndex) rung.classList.add("current");
    const star = i === MILESTONE_INDEX ? '<span class="rung-star">★</span>' : "";
    rung.innerHTML = `<span>${star}${i + 1}</span><span>${money(amount)}</span>`;
    el.ladder.appendChild(rung);
  });
  el.ladder.scrollLeft = el.ladder.scrollWidth;
}

// ===== QUESTION RENDER =====
function renderQuestion() {
  selectedOption = null;
  pendingOption = null;
  el.pollResult.classList.add("hidden");
  el.pollResult.innerHTML = "";

  const q = questions[currentIndex];
  el.qNumber.textContent = currentIndex + 1;
  el.questionText.textContent = q.question;
  el.prizeAmount.textContent = money(ladder[currentIndex]);
  el.quitAmount.textContent = formatINR(bankedAmount);

  const letters = ["A", "B", "C", "D"];
  el.options.innerHTML = "";
  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "opt-btn";
    btn.style.animationDelay = `${i * 0.06}s`;
    btn.innerHTML = `<span class="opt-letter">${letters[i]}</span><span>${opt}</span>`;
    btn.addEventListener("click", () => selectOption(opt, btn));
    el.options.appendChild(btn);
  });

  renderLadder();
  startTimer();
}

// ===== TIMER =====
function startTimer() {
  clearInterval(timerInterval);
  timeLeft = QUESTION_TIME;
  el.timerWrap.classList.remove("urgent");
  updateTimerUI();

  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerUI();
    if (timeLeft <= 10 && timeLeft > 0) sound.tick();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      handleTimeUp();
    }
  }, 1000);
}

function updateTimerUI() {
  const circumference = 283;
  const pct = timeLeft / QUESTION_TIME;
  el.timerFill.style.strokeDashoffset = String(circumference * (1 - pct));
  el.timerText.textContent = timeLeft;
  if (timeLeft <= 10) {
    el.timerFill.style.stroke = "var(--danger)";
    el.timerWrap.classList.add("urgent");
  } else if (timeLeft <= 20) {
    el.timerFill.style.stroke = "var(--gold-400)";
  } else {
    el.timerFill.style.stroke = "var(--success)";
  }
}

function handleTimeUp() {
  const allBtns = el.options.querySelectorAll(".opt-btn");
  allBtns.forEach(b => b.disabled = true);
  const q = questions[currentIndex];
  allBtns.forEach(b => {
    if (b.textContent.trim().endsWith(q.answer)) b.classList.add("correct");
  });
  sound.wrong();
  triggerWrongFX();
  setTimeout(() => endGame(false, "Time ran out before you locked in an answer."), 1400);
}

// ===== SELECT + LOCK-IN =====
function selectOption(optionText, btnEl) {
  if (pendingOption) return;
  sound.select();
  el.options.querySelectorAll(".opt-btn").forEach(b => b.classList.remove("selected"));
  btnEl.classList.add("selected");
  pendingOption = optionText;

  const letters = ["A", "B", "C", "D"];
  const idx = Array.from(el.options.children).indexOf(btnEl);
  el.lockinChoice.textContent = `${letters[idx]}. ${optionText}`;
  el.modal.classList.remove("hidden");
}

el.lockinCancel.addEventListener("click", () => {
  el.modal.classList.add("hidden");
  pendingOption = null;
});

el.lockinConfirm.addEventListener("click", () => {
  el.modal.classList.add("hidden");
  clearInterval(timerInterval);
  sound.lockWhoosh();
  lockInAnswer(pendingOption);
});

function lockInAnswer(optionText) {
  selectedOption = optionText;
  const allBtns = el.options.querySelectorAll(".opt-btn");
  allBtns.forEach(b => b.disabled = true);

  // dramatic suspense pause
  setTimeout(() => revealAnswer(optionText, allBtns), 1500);
}

function revealAnswer(optionText, allBtns) {
  const q = questions[currentIndex];
  const isCorrect = optionText === q.answer;

  allBtns.forEach(b => {
    if (b.textContent.trim().endsWith(q.answer)) b.classList.add("correct");
    else if (b.textContent.trim().endsWith(optionText) && !isCorrect) b.classList.add("wrong");
  });

  if (isCorrect) {
    sound.correct();
    bankedAmount = ladder[currentIndex];
    setTimeout(() => {
      sound.levelUp();
      currentIndex++;
      if (currentIndex < questions.length) {
        renderQuestion();
      } else {
        endGame(true, "You answered every question correctly!");
      }
    }, 1200);
  } else {
    sound.wrong();
    triggerWrongFX();
    setTimeout(() => endGame(false, `The correct answer was "${q.answer}".`), 1600);
  }
}

// ===== QUIT & BANK =====
el.quitBtn.addEventListener("click", () => {
  clearInterval(timerInterval);
  sound.select();
  endGame(null, "You walked away with your banked winnings.");
});

// ===== LIFELINES =====
el.ll5050.addEventListener("click", () => {
  if (usedLifelines.fifty || pendingOption) return;
  usedLifelines.fifty = true;
  el.ll5050.disabled = true;
  sound.select();

  const q = questions[currentIndex];
  const wrongBtns = Array.from(el.options.children).filter(b => !b.textContent.trim().endsWith(q.answer));
  // eliminate two random wrong options
  const shuffled = wrongBtns.sort(() => Math.random() - 0.5).slice(0, 2);
  shuffled.forEach(b => b.classList.add("eliminated"));
});

el.llPoll.addEventListener("click", () => {
  if (usedLifelines.poll || pendingOption) return;
  usedLifelines.poll = true;
  el.llPoll.disabled = true;
  sound.select();

  const q = questions[currentIndex];
  const opts = q.options;
  // simulated audience poll, biased toward correct answer
  let remaining = 100;
  const results = opts.map((opt, i) => {
    if (i === opts.length - 1) return remaining;
    const isCorrect = opt === q.answer;
    const val = isCorrect
      ? Math.floor(40 + Math.random() * 30)
      : Math.floor(Math.random() * (remaining / (opts.length - i)));
    remaining -= val;
    return val;
  });

  el.pollResult.classList.remove("hidden");
  el.pollResult.innerHTML = opts.map((opt, i) => `
    <div class="poll-row">
      <span style="width:18px">${["A","B","C","D"][i]}</span>
      <div class="poll-bar-track"><div class="poll-bar-fill" style="width:${results[i]}%"></div></div>
      <span>${results[i]}%</span>
    </div>
  `).join("");
});

el.llFlip.addEventListener("click", () => {
  if (usedLifelines.flip || pendingOption) return;
  usedLifelines.flip = true;
  el.llFlip.disabled = true;
  sound.select();

  // shuffle the option order for a fresh look at the same question
  const q = questions[currentIndex];
  q.options = [...q.options].sort(() => Math.random() - 0.5);
  renderQuestion();
});

// ===== END GAME =====
function endGame(won, message) {
  let finalAmount;
  let heading;
  let eyebrow;

  if (won === true) {
    finalAmount = ladder[ladder.length - 1];
    heading = "JACKPOT!";
    eyebrow = "Perfect run";
    launchConfetti();
    sound.win();
  } else if (won === false) {
    finalAmount = bankedAmount;
    heading = finalAmount > 0 ? "GAME OVER" : "BETTER LUCK NEXT TIME";
    eyebrow = "Incorrect answer";
  } else {
    finalAmount = bankedAmount;
    heading = "WINNINGS BANKED";
    eyebrow = "You walked away";
    if (finalAmount > 0) launchConfetti();
  }

  el.resultEyebrow.textContent = eyebrow;
  el.resultHeading.textContent = heading;
  el.resultAmount.textContent = money(finalAmount);
  el.resultSub.textContent = message;

  showScreen("result");
}

el.playAgain.addEventListener("click", () => {
  showScreen("start");
});

// ===== CONFETTI =====
function launchConfetti() {
  const colors = ["#f5c94d", "#ffe08a", "#4d6bff", "#2ee6a6", "#ff3b5c"];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = 2.5 + Math.random() * 2 + "s";
    piece.style.animationDelay = Math.random() * 0.6 + "s";
    el.confettiLayer.appendChild(piece);
    setTimeout(() => piece.remove(), 5500);
  }
}
