// ---- DOM refs ----
const scanBtn = document.getElementById('scanBtn');
const scanSection = document.getElementById('scan-section');
const problemSection = document.getElementById('problem-section');
const problemTitleEl = document.getElementById('problemTitle');
const nudgeBtn = document.getElementById('nudgeBtn');
const explainBtn = document.getElementById('explainBtn');
const askBtn = document.getElementById('askBtn');
const rescanBtn = document.getElementById('rescanBtn');
const levelIndicator = document.getElementById('levelIndicator');
const inputArea = document.getElementById('inputArea');
const freeText = document.getElementById('freeText');
const submitFreeText = document.getElementById('submitFreeText');
const loadingEl = document.getElementById('loading');
const outputEl = document.getElementById('output');
const errorBox = document.getElementById('errorBox');

let currentTabId = null;
let problem = null;      // { title, statement, samples, url }
let nudgeLevel = 0;      // 0..4
let pendingMode = null;  // 'explain' | 'ask' | null

// ---- init ----
init();

async function init() {
  const tab = await getActiveTab();
  currentTabId = tab.id;
  const key = storageKey(tab.id);
  const stored = await chrome.storage.local.get(key);
  if (stored[key]) {
    problem = stored[key].problem;
    nudgeLevel = stored[key].nudgeLevel || 0;
    showProblemUI();
  }
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
  });
}

function storageKey(tabId) {
  return 'cp_scan_' + tabId;
}

async function persist() {
  const key = storageKey(currentTabId);
  await chrome.storage.local.set({ [key]: { problem, nudgeLevel } });
}

// ---- scanning ----
scanBtn.addEventListener('click', async () => {
  hideError();
  scanBtn.disabled = true;
  scanBtn.textContent = '🔍 Scanning…';
  try {
    const tab = await getActiveTab();
    currentTabId = tab.id;
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractProblemFromPage,
    });

    if (!result) {
      showError('No problem detected on this page. Open a problem page on Codeforces, AtCoder, LeetCode, CSES, or CodeChef and try again.');
      return;
    }

    problem = result;
    nudgeLevel = 0;
    await persist();
    showProblemUI();
  } catch (err) {
    showError('Could not scan this page: ' + err.message);
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = '🔍 Scan Problem';
  }
});

rescanBtn.addEventListener('click', async () => {
  const key = storageKey(currentTabId);
  await chrome.storage.local.remove(key);
  problem = null;
  nudgeLevel = 0;
  pendingMode = null;
  outputEl.classList.add('hidden');
  inputArea.classList.add('hidden');
  hideError();
  problemSection.classList.add('hidden');
  scanSection.classList.remove('hidden');
});

function showProblemUI() {
  scanSection.classList.add('hidden');
  problemSection.classList.remove('hidden');
  problemTitleEl.textContent = problem.title || 'Problem detected';
  updateLevelIndicator();
}

function updateLevelIndicator() {
  levelIndicator.textContent = nudgeLevel > 0 ? `Nudge level: ${nudgeLevel} / 4` : '';
}

// ---- This function is injected into the page. It must be self-contained. ----
function extractProblemFromPage() {
  function clean(text) {
    return (text || '').replace(/\s+\n/g, '\n').trim();
  }
  function truncate(text, max) {
    return text.length > max ? text.slice(0, max) + ' …[truncated]' : text;
  }

  const host = location.hostname;
  let title = document.title;
  let statement = '';
  let samples = '';

  try {
    if (host.includes('codeforces.com')) {
      const container = document.querySelector('.problem-statement');
      if (!container) return null;
      title = container.querySelector('.title')?.innerText || title;
      const clone = container.cloneNode(true);
      const sampleNodes = clone.querySelectorAll('.sample-test');
      const sampleTexts = [];
      sampleNodes.forEach((n) => {
        sampleTexts.push(n.innerText);
        n.remove();
      });
      statement = clean(clone.innerText);
      samples = clean(sampleTexts.join('\n---\n'));
    } else if (host.includes('atcoder.jp')) {
      const container = document.querySelector('#task-statement');
      if (!container) return null;
      title = document.querySelector('.h2')?.innerText || title;
      statement = clean(container.innerText);
    } else if (host.includes('leetcode.com')) {
      const container =
        document.querySelector('[data-track-load="description_content"]') ||
        document.querySelector('div[class*="description"]') ||
        document.querySelector('[data-cy="question-content"]');
      if (!container) return null;
      title = document.querySelector('[data-cy="question-title"]')?.innerText || title;
      statement = clean(container.innerText);
    } else if (host.includes('cses.fi')) {
      const container = document.querySelector('.content');
      if (!container) return null;
      title = document.querySelector('h1')?.innerText || title;
      statement = clean(container.innerText);
    } else if (host.includes('codechef.com')) {
      const container =
        document.querySelector('.problem-statement') ||
        document.querySelector('[class*="problem-statement"]') ||
        document.querySelector('main');
      if (!container) return null;
      statement = clean(container.innerText);
    } else {
      return null;
    }
  } catch (e) {
    return null;
  }

  if (!statement || statement.length < 20) return null;

  return {
    title: clean(title),
    statement: truncate(statement, 6000),
    samples: truncate(samples, 2000),
    url: location.href,
  };
}

// ---- Nudge flow ----
nudgeBtn.addEventListener('click', async () => {
  pendingMode = null;
  inputArea.classList.add('hidden');
  hideError();
  nudgeLevel = Math.min(nudgeLevel + 1, 4);
  await persist();
  updateLevelIndicator();

  const userContent = buildProblemContext() +
    `\n\nRequested nudge level: ${nudgeLevel}`;

  await runCompletion(NUDGE_SYSTEM_PROMPT, userContent);
});

// ---- Explain Statement flow ----
explainBtn.addEventListener('click', () => {
  hideError();
  pendingMode = 'explain';
  inputArea.classList.remove('hidden');
  freeText.placeholder = 'Optional: paste the confusing sentence or term (leave blank to explain the whole statement)';
  freeText.value = '';
  freeText.focus();
});

// ---- Ask Question flow ----
askBtn.addEventListener('click', () => {
  hideError();
  pendingMode = 'ask';
  inputArea.classList.remove('hidden');
  freeText.placeholder = 'Ask a clarifying question about the problem';
  freeText.value = '';
  freeText.focus();
});

submitFreeText.addEventListener('click', async () => {
  hideError();
  const text = freeText.value.trim();
  if (pendingMode === 'ask' && !text) {
    showError('Type a question first.');
    return;
  }

  let system, userContent;
  if (pendingMode === 'explain') {
    system = EXPLAIN_SYSTEM_PROMPT;
    userContent = buildProblemContext() +
      (text ? `\n\nSpecific phrase/term to explain: ${text}` : '\n\nExplain the whole statement in plain language.');
  } else {
    system = ASK_SYSTEM_PROMPT;
    userContent = buildProblemContext() + `\n\nUser question: ${text}`;
  }

  inputArea.classList.add('hidden');
  await runCompletion(system, userContent);
});

function buildProblemContext() {
  let ctx = `PROBLEM TITLE: ${problem.title}\n\nSTATEMENT:\n${problem.statement}`;
  if (problem.samples) {
    ctx += `\n\nSAMPLE INPUT/OUTPUT:\n${problem.samples}`;
  }
  return ctx;
}

// ---- Claude API call ----
async function runCompletion(system, userContent) {
  showLoading(true);
  outputEl.classList.add('hidden');
  try {
    const text = await callClaude(system, userContent);
    outputEl.textContent = text;
    outputEl.classList.remove('hidden');
  } catch (err) {
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

async function callClaude(system, userContent) {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) {
    throw new Error('No Groq API key found. Paste one above and click Save key.');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    }),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error?.message || `API request failed (${response.status}).`);
  }

  return (data.choices || [])
    .map((choice) => choice.message?.content || '')
    .join('\n')
    .trim();
}

// ---- UI helpers ----
function showLoading(on) {
  loadingEl.classList.toggle('hidden', !on);
}
function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove('hidden');
}
function hideError() {
  errorBox.classList.add('hidden');
  errorBox.textContent = '';
}
