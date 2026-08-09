'use strict';

const STORAGE_KEY_MISTAKES = 'koutan_mistakes';
const STORAGE_KEY_BOOKMARKS = 'koutan_bookmarks';
const STORAGE_KEY_THEME = 'koutan_theme';

let allQuestions = null; // { tech: [...], law: [...] } loaded from questions.json

const state = {
  currentQuestions: [],
  currentQuestionIndex: 0,
  score: 0,
  selectedOptionIndex: null,
  isAnswered: false,
};

// DOM要素の取得
const loadingMessageP = document.getElementById('loading-message');
const loadingErrorP = document.getElementById('loading-error');
const menuAreaDiv = document.getElementById('menu-area');
const quizAreaDiv = document.getElementById('quiz-area');
const resultAreaDiv = document.getElementById('result-area');
const subjectSelect = document.getElementById('subject-select');
const iterationSelect = document.getElementById('iteration-select');
const questionYearP = document.getElementById('question-year');
const questionTextP = document.getElementById('question-text');
const optionsAreaDiv = document.getElementById('options-area');
const feedbackAreaDiv = document.getElementById('feedback-area');
const submitBtn = document.getElementById('submit-btn');
const nextBtn = document.getElementById('next-btn');
const bookmarkBtn = document.getElementById('bookmark-btn');
const themeToggleBtn = document.getElementById('theme-toggle');

// --- 初期化処理 ---
async function init() {
  initTheme();
  bindStaticEventListeners();

  try {
    const response = await fetch('questions.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    allQuestions = await response.json();
  } catch (err) {
    console.error('問題データの読み込みに失敗しました', err);
    loadingMessageP.classList.add('hidden');
    loadingErrorP.classList.remove('hidden');
    return;
  }

  loadingMessageP.classList.add('hidden');
  menuAreaDiv.classList.remove('hidden');
  populateIterations();
  updateDataStats();
}

function bindStaticEventListeners() {
  themeToggleBtn.addEventListener('click', toggleTheme);
  document.getElementById('start-normal-btn').addEventListener('click', () => startQuiz('normal'));
  document.getElementById('start-mistakes-btn').addEventListener('click', () => startQuiz('mistakes'));
  document.getElementById('start-bookmarks-btn').addEventListener('click', () => startQuiz('bookmarks'));
  document.getElementById('clear-mistakes-btn').addEventListener('click', () => clearData('mistakes'));
  document.getElementById('clear-bookmarks-btn').addEventListener('click', () => clearData('bookmarks'));
  document.getElementById('return-menu-btn').addEventListener('click', returnToMenu);
  bookmarkBtn.addEventListener('click', toggleBookmark);
  submitBtn.addEventListener('click', submitAnswer);
  nextBtn.addEventListener('click', nextQuestion);
  document.addEventListener('keydown', handleKeydown);
}

// --- テーマ設定 (ダークモード) ---
function initTheme() {
  const theme = localStorage.getItem(STORAGE_KEY_THEME);
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  }
}

function toggleTheme() {
  document.body.classList.toggle('dark-theme');
  const isDark = document.body.classList.contains('dark-theme');
  localStorage.setItem(STORAGE_KEY_THEME, isDark ? 'dark' : 'light');
}

// --- データ保存・取得処理 ---
function getStoredIds(key) {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

function saveStoredIds(key, ids) {
  localStorage.setItem(key, JSON.stringify(ids));
  updateDataStats();
}

function updateDataStats() {
  document.getElementById('mistake-count').textContent = getStoredIds(STORAGE_KEY_MISTAKES).length;
  document.getElementById('bookmark-count').textContent = getStoredIds(STORAGE_KEY_BOOKMARKS).length;
}

function clearData(type) {
  if (confirm('本当に履歴をクリアしますか？')) {
    if (type === 'mistakes') saveStoredIds(STORAGE_KEY_MISTAKES, []);
    if (type === 'bookmarks') saveStoredIds(STORAGE_KEY_BOOKMARKS, []);
  }
}

// --- メニュー生成 ---
function populateIterations() {
  // 全問題から試験回（"令和7年度第2回"など）を抽出して重複排除
  const iterations = new Set();
  ['tech', 'law'].forEach(subj => {
    allQuestions[subj].forEach(q => {
      const match = q.year.match(/^(.*?)\s/); // 最初の空白までを抽出
      if (match) iterations.add(match[1]);
    });
  });

  iterationSelect.innerHTML = '<option value="all">すべての試験回 (ランダム)</option>';
  iterations.forEach(iter => {
    const option = document.createElement('option');
    option.value = iter;
    option.textContent = iter;
    iterationSelect.appendChild(option);
  });
}

// --- シャッフル (Fisher-Yates) ---
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// --- クイズ開始処理 ---
function startQuiz(mode) {
  let tempQuestions = [];
  const subject = subjectSelect.value;

  if (mode === 'normal') {
    const selectedIter = iterationSelect.value;
    if (selectedIter === 'all') {
      tempQuestions = [...allQuestions[subject]];
    } else {
      tempQuestions = allQuestions[subject].filter(q => q.year.startsWith(selectedIter));
    }
  } else if (mode === 'mistakes') {
    const mistakeIds = getStoredIds(STORAGE_KEY_MISTAKES);
    ['tech', 'law'].forEach(subj => {
      tempQuestions = tempQuestions.concat(allQuestions[subj].filter(q => mistakeIds.includes(q.id)));
    });
  } else if (mode === 'bookmarks') {
    const bookmarkIds = getStoredIds(STORAGE_KEY_BOOKMARKS);
    ['tech', 'law'].forEach(subj => {
      tempQuestions = tempQuestions.concat(allQuestions[subj].filter(q => bookmarkIds.includes(q.id)));
    });
  }

  if (tempQuestions.length === 0) {
    alert('条件に一致する問題がありません。');
    return;
  }

  state.currentQuestions = shuffle(tempQuestions);
  state.currentQuestionIndex = 0;
  state.score = 0;

  menuAreaDiv.classList.add('hidden');
  resultAreaDiv.classList.add('hidden');
  quizAreaDiv.classList.remove('hidden');

  displayQuestion();
}

// --- 画面表示 ---
function displayQuestion() {
  state.isAnswered = false;
  state.selectedOptionIndex = null;
  const question = state.currentQuestions[state.currentQuestionIndex];

  // プログレスバーとステータス更新
  document.getElementById('current-q-num').textContent = state.currentQuestionIndex + 1;
  document.getElementById('total-q-num').textContent = state.currentQuestions.length;
  document.getElementById('correct-count').textContent = state.score;
  document.getElementById('accuracy-rate').textContent =
    state.currentQuestionIndex === 0 ? '0.0' : ((state.score / state.currentQuestionIndex) * 100).toFixed(1);

  const progressPercent = (state.currentQuestionIndex / state.currentQuestions.length) * 100;
  document.getElementById('progress-bar').style.width = `${progressPercent}%`;

  // ブックマーク状態の表示
  updateBookmarkButtonState(question.id);

  questionYearP.textContent = question.year;
  questionTextP.textContent = question.question;

  optionsAreaDiv.innerHTML = '';
  question.options.forEach((option, index) => {
    const button = document.createElement('button');
    button.textContent = `${index + 1}. ${option}`;
    button.addEventListener('click', () => handleSelectOption(index));
    optionsAreaDiv.appendChild(button);
  });

  feedbackAreaDiv.classList.add('hidden');
  submitBtn.classList.remove('hidden');
  submitBtn.disabled = true;
  nextBtn.classList.add('hidden');
}

// --- ブックマーク機能 ---
function updateBookmarkButtonState(id) {
  const bookmarks = getStoredIds(STORAGE_KEY_BOOKMARKS);
  if (bookmarks.includes(id)) {
    bookmarkBtn.classList.add('bookmarked');
    bookmarkBtn.textContent = '★ ブックマーク済';
  } else {
    bookmarkBtn.classList.remove('bookmarked');
    bookmarkBtn.textContent = '☆ ブックマーク';
  }
}

function toggleBookmark() {
  const id = state.currentQuestions[state.currentQuestionIndex].id;
  let bookmarks = getStoredIds(STORAGE_KEY_BOOKMARKS);

  if (bookmarks.includes(id)) {
    bookmarks = bookmarks.filter(b => b !== id);
  } else {
    bookmarks.push(id);
  }
  saveStoredIds(STORAGE_KEY_BOOKMARKS, bookmarks);
  updateBookmarkButtonState(id);
}

// --- 解答処理 ---
function handleSelectOption(index) {
  if (state.isAnswered) return;
  state.selectedOptionIndex = index;
  Array.from(optionsAreaDiv.children).forEach((btn, i) => {
    btn.classList.toggle('selected', i === index);
  });
  submitBtn.disabled = false;
}

function submitAnswer() {
  if (state.selectedOptionIndex === null) return;
  checkAnswer(state.selectedOptionIndex);
}

function checkAnswer(selectedIndex) {
  state.isAnswered = true;
  submitBtn.classList.add('hidden');
  const question = state.currentQuestions[state.currentQuestionIndex];
  const isCorrect = selectedIndex === question.answer;
  const optionButtons = optionsAreaDiv.children;

  let mistakes = getStoredIds(STORAGE_KEY_MISTAKES);

  if (isCorrect) {
    state.score++;
    optionButtons[selectedIndex].classList.add('correct');
    feedbackAreaDiv.innerHTML = `<h3>正解！</h3><p>${question.explanation}</p>`;
    feedbackAreaDiv.className = 'feedback-correct';

    // 正解した場合は「間違えた問題リスト」から削除
    mistakes = mistakes.filter(id => id !== question.id);
  } else {
    optionButtons[selectedIndex].classList.add('incorrect');
    optionButtons[question.answer].classList.add('correct');
    feedbackAreaDiv.innerHTML = `<h3>不正解...</h3><p>正解は ${question.answer + 1} です。</p><p>${question.explanation}</p>`;
    feedbackAreaDiv.className = 'feedback-incorrect';

    // 不正解の場合は「間違えた問題リスト」に追加（重複防止）
    if (!mistakes.includes(question.id)) {
      mistakes.push(question.id);
    }
  }
  saveStoredIds(STORAGE_KEY_MISTAKES, mistakes);

  // リアルタイムステータスの更新（解答後）
  document.getElementById('correct-count').textContent = state.score;
  document.getElementById('accuracy-rate').textContent =
    ((state.score / (state.currentQuestionIndex + 1)) * 100).toFixed(1);

  for (const btn of optionButtons) {
    btn.disabled = true;
  }

  feedbackAreaDiv.classList.remove('hidden');
  nextBtn.classList.remove('hidden');
  if (state.currentQuestionIndex === state.currentQuestions.length - 1) {
    nextBtn.textContent = '結果を見る';
  }
}

function nextQuestion() {
  state.currentQuestionIndex++;
  if (state.currentQuestionIndex < state.currentQuestions.length) {
    displayQuestion();
  } else {
    showResult();
  }
}

function showResult() {
  quizAreaDiv.classList.add('hidden');
  resultAreaDiv.classList.remove('hidden');
  const percentage = (state.score / state.currentQuestions.length) * 100;
  document.getElementById('score-text').textContent =
    `${state.score} 問正解 / 全 ${state.currentQuestions.length} 問`;
  document.getElementById('result-detail').textContent = `最終正答率: ${percentage.toFixed(1)}%`;
}

function returnToMenu() {
  resultAreaDiv.classList.add('hidden');
  menuAreaDiv.classList.remove('hidden');
  nextBtn.textContent = '次の問題へ';
  updateDataStats(); // メニューに戻る際に統計を更新
}

// --- キーボードショートカット ---
function handleKeydown(e) {
  if (quizAreaDiv.classList.contains('hidden')) return;

  if (state.isAnswered) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      nextQuestion();
    }
  } else {
    let optionIndex = -1;
    if (e.key === 'a' || e.key === '1') optionIndex = 0;
    if (e.key === 's' || e.key === '2') optionIndex = 1;
    if (e.key === 'd' || e.key === '3') optionIndex = 2;
    if (e.key === 'f' || e.key === '4') optionIndex = 3;

    const currentQuestion = state.currentQuestions[state.currentQuestionIndex];
    if (optionIndex !== -1 && optionIndex < currentQuestion.options.length) {
      handleSelectOption(optionIndex);
    } else if ((e.key === 'Enter' || e.key === ' ') && state.selectedOptionIndex !== null) {
      e.preventDefault();
      submitAnswer();
    }
  }
}

init();
