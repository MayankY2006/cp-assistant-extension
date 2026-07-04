# CP Assistant — One-Line Hint Extension

A click-to-scan browser extension that gives one-line editorial-style
nudges for competitive programming problems, without ever revealing the
full solution.

## Install (Chrome / Edge / Brave — unpacked)

1. Unzip this folder somewhere permanent (don't delete it after installing).
2. Go to `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this folder.
5. Pin the extension icon to your toolbar for quick access.

## Set up your API key

1. Click the extension icon, then **"Set Anthropic API key"** at the bottom
   — or right-click the icon → **Options**.
2. Paste an API key from https://console.anthropic.com/settings/keys and
   click **Save**.
3. The key is stored only in your browser's local extension storage. All
   requests go directly from your browser to Anthropic's API — nothing
   passes through any other server.

## How to use it

1. Open a problem page on **Codeforces, AtCoder, LeetCode, CSES, or
   CodeChef**.
2. Click the extension icon.
3. Click **🔍 Scan Problem** — this reads the problem statement from the
   current page (nothing is scanned automatically or in the background).
4. Use:
   - **💡 Give me a Nudge** — click repeatedly for progressively stronger
     hints (levels 1 → 4). Never names a technique or shows code.
   - **❓ Explain Statement** — clarifies confusing wording or terminology.
     Optionally paste the exact confusing sentence.
   - **🧠 Ask Question** — ask a specific clarifying question about the
     problem.
5. Click **↻ Rescan this page** if you navigate to a different problem
   in the same tab, or want to reset your nudge progress.

## How it works

- Scanning is **manual only**, triggered by your click — the extension
  never reads page content automatically.
- `popup.js` injects a small extraction function into the active tab to
  pull the problem title, statement, and sample input/output using
  site-specific selectors (Codeforces, AtCoder, LeetCode, CSES, CodeChef).
- The extracted text is sent to Claude via the Anthropic Messages API,
  guided by strict system prompts (see `prompts.js`) that enforce:
  - no naming of algorithms/data structures
  - no code or pseudocode
  - hints tied to one of four lenses: Observation, Experimentation,
    Assumption, or Sample Focus
  - escalating specificity across 4 nudge levels, never revealing "how"
- Each tab's scanned problem and current nudge level are cached locally
  (`chrome.storage.local`) so reopening the popup doesn't lose progress.

## Known limitations / next steps

- **LeetCode & CodeChef** render their problem pages via JavaScript (SPA),
  so the description may not be present yet at the instant you click scan
  if the page just loaded — reload the page fully, then scan.
- Selectors are based on current site markup and may need updates if these
  platforms redesign their pages.
- No backend yet — each user supplies their own Anthropic API key. A future
  version could add a shared backend with caching per problem (most value
  for popular problems, much lower cost) as discussed in the product spec.
- No hint caching yet — every nudge is a fresh API call.
