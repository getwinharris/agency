import { wordmark } from "./brand.ts";

export const sampleWorktrees = [
  { agent: "Codex", branch: "work/notes-empty-state", task: "Update the empty-state UI." },
  { agent: "OpenCode", branch: "work/notes-tests", task: "Add a regression test." },
] as const;

const steps = [
  {
    id: "project",
    label: "Connect a project",
    title: "Connect a project",
    context: "Projects",
    description: "Pair the desktop app with your private Core, then select a Git project.",
    duration: 2600,
    screen: `<div class="demo-project demo-reveal">
      <span class="demo-project-icon" aria-hidden="true"></span>
      <div><strong>Field Notes</strong><span>Git repository</span></div>
      <span class="demo-tag">Selected</span>
    </div>`,
  },
  {
    id: "run",
    label: "Run parallel agents",
    title: "Two worktrees. One repository.",
    context: "Field Notes",
    description: "Create separate Git worktrees on your Core machine, then run one agent in each folder.",
    duration: 4500,
    screen: `<ul class="demo-branches" aria-label="Sample worktrees" role="list">
      ${sampleWorktrees.map(({ agent, branch, task }) => `<li class="demo-branch demo-reveal">
        <strong>${agent}</strong>
        <code>${branch}</code>
        <p>${task}</p>
      </li>`).join("")}
    </ul>`,
  },
  {
    id: "reconnect",
    label: "Reconnect and review",
    title: "Reopen the thread",
    context: "Field Notes · Codex",
    description: "Reopen the thread and review each branch before merging in Git.",
    duration: 3300,
    screen: `<p class="demo-reconnected demo-reveal"><span class="demo-dot" aria-hidden="true"></span>Reconnected to your private Core</p>
    <div class="demo-summary demo-reveal"><strong>Git review</strong>
      <p>Review the UI and test changes in their branches, then merge the changes you choose into <code>main</code> in Git.</p>
    </div>`,
  },
];

export function sessionWalkthrough() {
  const outline = steps.map(({ id, label }, index) => `
    <li><button type="button" data-demo-step aria-pressed="${index === 0}" aria-controls="demo-${id}" aria-describedby="demo-${id}-hint" disabled>${label}</button></li>`).join("");
  const screens = steps.map(({ id, label, title, context, description, duration, screen }, index) => `
    <article id="demo-${id}" class="demo-panel" data-demo-panel data-duration="${duration}" aria-label="${label} preview"${index === 0 ? "" : " hidden"}>
      <p class="demo-context">${context}</p>
      <h3>${title}</h3>
      <p id="demo-${id}-hint" class="demo-hint">${description}</p>
      ${screen}
    </article>`).join("");

  return `<section class="workflow" id="how-it-works" aria-labelledby="workflow-heading" data-session-demo>
    <header class="demo-heading">
      <h2 id="workflow-heading">From a Git project to a reopened thread</h2>
      <p class="demo-intro">A sample project with two coding agents and an example of reopening a thread on a private Core.</p>
    </header>
    <div class="demo-window">
      <div class="demo-titlebar">
        <div class="demo-window-identity">
          <img src="${wordmark}" alt="bapX" width="120" height="40">
          <span>Session preview</span>
        </div>
        <button type="button" class="button button-secondary demo-play" data-demo-play aria-controls="demo-display" hidden>Play demo</button>
      </div>
      <div class="demo-workspace">
        <ol class="demo-steps" role="list" aria-label="Demo steps">${outline}
        </ol>
        <div class="demo-panels" id="demo-display">${screens}
        </div>
      </div>
    </div>
    <p class="demo-announcement" data-demo-status role="status"></p>
  </section>`;
}
