import { wordmark } from "./brand.ts";

type SampleAgent = {
  id: string;
  agent: string;
  branch: string;
  task: string;
  unavailable?: boolean;
};

const primaryAgent: SampleAgent = {
  id: "codex",
  agent: "Codex",
  branch: "work/notes-empty-state",
  task: "Update the layout shown when there are no notes.",
};

const agentChoices: SampleAgent[] = [
  { id: "opencode", agent: "OpenCode", branch: "work/notes-tests", task: "Add a regression test for creating the first note." },
  { id: "claude", agent: "Claude Code", branch: "work/notes-onboarding", task: "Clarify the first-run instructions and keyboard shortcuts." },
  { id: "pi", agent: "Pi", branch: "work/notes-fixtures", task: "Prepare an empty notebook fixture for the test suite." },
  { id: "cursor", agent: "Cursor", branch: "work/notes-focus", task: "Review keyboard focus when the first note is saved." },
  { id: "hermes", agent: "Hermes Agent", branch: "work/notes-summary", task: "Summarize the changes for review once its CLI and account are configured.", unavailable: true },
];

export const sampleWorktrees = [primaryAgent, agentChoices[0]];

function worktreeCard({ id, agent, branch, task, unavailable }: SampleAgent, selectable = false, visible = true) {
  return `<li class="demo-branch demo-reveal${selectable ? " demo-agent-spotlight" : ""}"${selectable ? `
    id="demo-agent-${id}" data-demo-agent-card${unavailable ? " data-demo-agent-unavailable" : ""}` : ""}${visible ? "" : " hidden"}>
    <div class="demo-branch-heading">
      <strong>${agent}</strong>
      <span class="demo-agent-state">${unavailable ? "Unavailable" : "Configured"}</span>
    </div>
    <code>${branch}</code>
    <p>${task}</p>
  </li>`;
}

function runPreview() {
  return `<div class="demo-agent-picker" data-demo-agent-picker hidden>
    <p id="demo-agent-label">Choose an agent for the second worktree</p>
    <div class="demo-agent-choices" role="group" aria-labelledby="demo-agent-label">
      ${agentChoices.map(({ id, agent }, index) => `<button type="button" data-demo-agent
        aria-pressed="${index === 0}" aria-controls="demo-agent-${id}">${agent}</button>`).join("")}
    </div>
  </div>
  <ul class="demo-branches" aria-label="Sample worktrees" role="list">
    ${worktreeCard(primaryAgent)}
    ${agentChoices.map((agent, index) => worktreeCard(agent, true, index === 0)).join("")}
  </ul>`;
}

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
    description: "On this sample Core, Codex handles the UI while a second worktree takes a separate task.",
    duration: 3200,
    screen: runPreview(),
  },
  {
    id: "reconnect",
    label: "Reconnect and review",
    title: "Reopen the thread",
    context: "Field Notes · Codex",
    description: "Reopen the Codex thread, then review the worktrees with changes before merging in Git.",
    duration: 3300,
    screen: `<p class="demo-reconnected demo-reveal"><span class="demo-dot" aria-hidden="true"></span>Reconnected to your private Core</p>
    <div class="demo-summary demo-reveal"><strong>Git review</strong>
      <p>Review the changes on each branch, then merge the ones you choose into <code>main</code> in Git.</p>
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
      <p class="demo-intro">Explore a sample project, then reopen a thread on a private Core. Agent setup and tasks shown here are illustrative.</p>
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
