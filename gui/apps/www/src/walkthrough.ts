import { wordmark } from "./brand.ts";

const steps = [
  {
    id: "project",
    label: "Connect a project",
    description: "Select a Git project in the desktop app and pair it with your private Core.",
    duration: 2600,
    screen: `<p class="demo-context">Projects</p>
      <h3>Connect a project</h3>
      <div class="demo-project demo-reveal">
        <span class="demo-project-icon" aria-hidden="true"></span>
        <div><strong>Field Notes</strong><span>Git repository</span></div>
        <span class="demo-tag">Selected</span>
      </div>`,
  },
  {
    id: "run",
    label: "Run parallel agents",
    description: "Give each agent a Git worktree so edits stay on separate branches.",
    duration: 4500,
    screen: `<p class="demo-context">Field Notes</p>
      <h3>Two worktrees. One repository.</h3>
      <ul class="demo-branches" aria-label="Sample worktrees">
        <li class="demo-branch demo-reveal">
          <strong>Codex</strong>
          <code>work/notes-empty-state</code>
          <p>Update the empty-state UI.</p>
        </li>
        <li class="demo-branch demo-reveal">
          <strong>OpenCode</strong>
          <code>work/notes-tests</code>
          <p>Add a regression test.</p>
        </li>
      </ul>`,
  },
  {
    id: "reconnect",
    label: "Reconnect and review",
    description: "Reopen the thread and review each branch before merging in Git.",
    duration: 3300,
    screen: `<p class="demo-context">Field Notes · Codex</p>
      <h3>Reopen the thread</h3>
      <p class="demo-reconnected demo-reveal"><span class="demo-dot" aria-hidden="true"></span>Reconnected to your private Core</p>
      <div class="demo-summary demo-reveal"><strong>Git review</strong>
        <p>Review the UI and test changes in their branches, then merge the changes you choose into <code>main</code> in Git.</p>
      </div>`,
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
        <h2 id="workflow-heading">From a Git project to a reopened thread</h2>
        <p class="demo-intro">A sample project with two coding agents and an example of reopening a thread on a private Core.</p>
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
