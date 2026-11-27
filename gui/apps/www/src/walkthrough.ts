import { wordmark } from "./brand.ts";

const steps = [
  {
    id: "project",
    label: "Choose a project",
    description: "Pick an existing project in the desktop app.",
    duration: 2600,
    screen: `<p class="demo-context">Projects</p>
      <h3>Choose a project</h3>
      <div class="demo-project demo-reveal">
        <span class="demo-project-icon" aria-hidden="true"></span>
        <div><strong>Field Notes</strong><span>Git repository</span></div>
        <span class="demo-tag">Selected</span>
      </div>`,
  },
  {
    id: "launch",
    label: "Launch Codex",
    description: "Start a thread on your configured private Core.",
    duration: 3200,
    screen: `<p class="demo-context">Field Notes</p>
      <h3>New thread</h3>
      <div class="demo-composer demo-reveal">
        <p>Add an empty state to the notes list.</p>
        <div class="demo-tags"><span class="demo-tag">Codex</span><span class="demo-tag">Private Linux Core</span></div>
      </div>`,
  },
  {
    id: "progress",
    label: "Follow progress",
    description: "Watch Codex report its work as the thread runs.",
    duration: 4500,
    screen: `<p class="demo-context">Field Notes · Codex</p>
      <h3>Notes empty state</h3>
      <ul class="demo-events" aria-label="Sample activity">
        <li class="demo-reveal"><span aria-hidden="true">✓</span>Read <code>src/NotesList.tsx</code></li>
        <li class="demo-reveal"><span aria-hidden="true">✓</span>Added the empty state</li>
        <li class="demo-reveal"><span class="demo-running" aria-hidden="true"></span>Running <code>npm test</code></li>
      </ul>`,
  },
  {
    id: "reconnect",
    label: "Reconnect",
    description: "Reopen the same remote thread from the desktop app.",
    duration: 3300,
    screen: `<p class="demo-context">Field Notes · Codex</p>
      <h3>Notes empty state</h3>
      <p class="demo-reconnected demo-reveal"><span class="demo-dot" aria-hidden="true"></span>Reconnected to your private Core</p>
      <div class="demo-summary demo-reveal"><strong>Codex</strong><p>The notes list now shows a helpful message when it’s empty. All tests passed.</p></div>`,
  },
];

export function sessionWalkthrough() {
  const outline = steps.map(({ id, label, description }, index) => `
    <li>
      <button type="button" data-demo-step aria-pressed="${index === 0}" aria-controls="demo-${id}" aria-describedby="demo-${id}-hint" disabled>${label}</button>
      <p id="demo-${id}-hint">${description}</p>
    </li>`).join("");
  const screens = steps.map(({ id, label, duration, screen }, index) => `
    <article id="demo-${id}" class="demo-panel" data-demo-panel data-duration="${duration}" aria-label="${label} preview"${index === 0 ? "" : " hidden"}>
      ${screen}
    </article>`).join("");

  return `<section class="workflow" id="how-it-works" aria-labelledby="workflow-heading" data-session-demo>
    <header class="demo-heading">
      <div>
        <p class="demo-label">Interactive demo</p>
        <h2 id="workflow-heading">Follow a Codex session.</h2>
        <p class="demo-intro">A sample thread in the desktop app, running on a private Linux Core.</p>
      </div>
      <button type="button" class="button button-secondary demo-play" data-demo-play aria-controls="demo-display" hidden>Play demo</button>
    </header>
    <div class="demo-layout">
      <ol class="demo-steps" role="list" aria-label="Demo steps">${outline}
      </ol>
      <div class="demo-window" id="demo-display">
        <div class="demo-titlebar">
          <img src="${wordmark}" alt="bapX" width="120" height="40">
          <span>Session preview</span>
        </div>
        <div class="demo-workspace">
          <div class="demo-sidebar" aria-hidden="true">
            <p>Projects</p>
            <span>Field Notes</span>
          </div>
          <div class="demo-panels">${screens}
          </div>
        </div>
      </div>
    </div>
    <p class="demo-announcement" data-demo-status role="status"></p>
  </section>`;
}
