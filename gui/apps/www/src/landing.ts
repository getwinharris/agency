import { sampleWorktrees } from "./walkthrough.ts";

export function landingHero(docs: string) {
  const branches = sampleWorktrees.map(({ agent, branch }) => `
          <li><strong>${agent}</strong><code>${branch}</code></li>`).join("");
  return `<section class="hero" aria-labelledby="headline">
    <div class="hero-content">
      <h1 id="headline">Run your coding agents on <em>bapX.</em></h1>
      <p>Connect a Git project to your own Linux Core, run a supported coding agent, and reopen the same thread from the desktop app.</p>
      <div class="actions">
        <a class="button button-primary" href="${docs}/private-core/">Set up a private Core <span class="arrow" aria-hidden="true"></span></a>
        <a class="button button-secondary" href="#how-it-works">See the walkthrough <span class="arrow arrow-down" aria-hidden="true"></span></a>
      </div>
      <nav class="hero-resources" aria-label="Product resources">
        <a href="${docs}/desktop-packaging/">Desktop packages</a>
        <a href="${docs}/">Read Docs</a>
      </nav>
    </div>
    <figure class="worktree-figure" aria-labelledby="worktree-figure-label">
      <figcaption id="worktree-figure-label">Sample workflow</figcaption>
      <div class="worktree-diagram">
        <div class="worktree-origin"><span>Git project</span><strong>Field Notes</strong></div>
        <div class="worktree-core"><span class="worktree-core-icon" aria-hidden="true"></span><strong>Private Linux Core</strong></div>
        <ul class="worktree-branches" aria-label="Separate Git worktrees">${branches}
        </ul>
      </div>
    </figure>
  </section>`;
}

const modes = [
  { name: "Local project", machine: "Your computer", checkout: "Your open project folder" },
  { name: "Git worktree", machine: "Your computer", checkout: "A separate folder and Git branch for each agent" },
  { name: "Private Core", machine: "A Linux machine you control", checkout: "Your project on the Core machine", highlight: true },
];

export function runModes(docs: string) {
  const cards = modes.map(({ name, machine, checkout, highlight }) => `
    <article class="bapx-mode${highlight ? " bapx-mode--core" : ""}">
      <h3>${name}</h3>
      <dl>
        <div><dt>Machine</dt><dd>${machine}</dd></div>
        <div><dt>Git checkout</dt><dd>${checkout}</dd></div>
      </dl>
    </article>`).join("");
  return `<section class="bapx-run-modes" aria-labelledby="bapx-run-modes-title">
    <h2 id="bapx-run-modes-title">How agents run in bapX</h2>
    <div class="bapx-mode-grid">${cards}
    </div>
    <div class="bapx-availability">
      <h3>Desktop availability</h3>
      <p>Build from source for Apple Silicon, Windows x64, or Linux x64. Public installers and bapX-hosted agents are pending.</p>
      <a href="${docs}/release-notes/#pending">Check release status</a>
    </div>
  </section>`;
}

const questions = [
  {
    question: "What is bapX Agents?",
    answer: "bapX Agents brings coding agents into one desktop app. Work in your project, give parallel tasks separate Git branches, or connect to a private Linux Core.",
    link: ["/", "Read the bapX Docs"],
  },
  {
    question: "How can I get the desktop app?",
    answer: "Build from source for Apple Silicon, Windows x64, or Linux x64. The release notes track when public installers are ready.",
    link: ["/desktop-packaging/", "See desktop build instructions"],
  },
  {
    question: "How do I run my own Core?",
    answer: "Start with a dedicated Ubuntu 24.04 machine. Install Core and the Codex CLI, sign in to Codex, then pair the desktop app using the Core’s HTTPS URL and token.",
    link: ["/private-core/", "Read the private Core setup guide"],
  },
  {
    question: "Can a coding agent help me set up bapX?",
    answer: "A coding agent can help you follow the desktop build instructions for your platform. Review the commands it proposes and sign in to your own coding provider when prompted.",
    link: ["/desktop-packaging/", "Read the build instructions"],
  },
  {
    question: "Which agents and accounts can I use?",
    answer: "Use Codex or OpenCode in the desktop app with a supported account or API key. The private Core setup guide uses Codex and walks through signing in with your own account.",
    link: ["/private-core/#1-install-tools-and-build", "Set up Codex on your Core"],
  },
  {
    question: "What costs should I expect when self-hosting?",
    answer: "You provide the Linux machine and the account or API key your coding agent uses. Hosting and model costs depend on the services and plans you choose.",
  },
  {
    question: "Can a task continue if I close my laptop?",
    answer: "Tasks running on your private Core can continue while the Linux machine stays online. Reconnect from the desktop app to reopen the thread. Local tasks need the computer running them to stay awake.",
  },
  {
    question: "Where are my repository, history, and keys kept?",
    answer: "Your repository and session history live on the private Linux machine. Private Core is for one trusted user, with threads sharing that machine. The guide keeps service credentials separate from the coding agent’s account. Your agent connects to the model provider you configure.",
    link: ["/private-core/#3-saved-history", "Read how Core stores session history"],
  },
];

export function landingFaq(docs: string) {
  const disclosures = questions.map(({ question, answer, link }) => `
      <details>
        <summary>${question}</summary>
        <div class="bapx-faq-answer">
          <p>${answer}</p>${link ? `
          <a href="${docs}${link[0]}">${link[1]}</a>` : ""}
        </div>
      </details>`).join("");
  return `<section class="bapx-faq" id="faq" aria-labelledby="bapx-faq-title">
    <div class="bapx-faq-heading">
      <h2 id="bapx-faq-title">Frequently asked questions</h2>
      <a href="${docs}/">Browse the documentation <span class="arrow" aria-hidden="true"></span></a>
    </div>
    <div class="bapx-faq-list">${disclosures}
    </div>
  </section>`;
}
