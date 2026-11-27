const demo = document.querySelector("[data-session-demo]");

if (demo) {
  const steps = [...demo.querySelectorAll("[data-demo-step]")];
  const panels = [...demo.querySelectorAll("[data-demo-panel]")];
  const play = demo.querySelector("[data-demo-play]");
  const announcement = demo.querySelector("[data-demo-status]");
  const agentPicker = demo.querySelector("[data-demo-agent-picker]");
  const agents = [...demo.querySelectorAll("[data-demo-agent]")];
  const agentCards = [...demo.querySelectorAll("[data-demo-agent-card]")];
  const runPanel = agentPicker.closest("[data-demo-panel]");
  const configuredAgents = agents.map((_, index) => index)
    .filter((index) => !agentCards[index].hasAttribute("data-demo-agent-unavailable"));
  const playLabels = {
    ready: "Play demo",
    playing: "Pause demo",
    paused: "Resume demo",
    finished: "Replay demo",
  };

  let active = 0;
  let activeAgent = 0;
  let timer;
  let startedAt;
  let remaining;

  function setPlayback(state) {
    demo.dataset.playback = state;
    play.textContent = playLabels[state];
  }

  function showStep(index) {
    active = index;
    for (const [position, step] of steps.entries()) {
      const selected = position === index;
      step.setAttribute("aria-pressed", String(selected));
      panels[position].hidden = !selected;
    }
    resetStepTimer();
    announceStep();
  }

  function resetStepTimer() {
    remaining = Number(panels[active].dataset.duration);
  }

  function announceStep() {
    const step = `Step ${active + 1} of ${steps.length}: ${steps[active].textContent}.`;
    if (panels[active] !== runPanel) {
      announcement.textContent = step;
      return;
    }
    const name = agents[activeAgent].textContent;
    const status = agentCards[activeAgent].hasAttribute("data-demo-agent-unavailable") ? "unavailable" : "configured";
    announcement.textContent = `${step} Second worktree: ${name}, ${status} in this example.`;
  }

  function showAgent(index) {
    activeAgent = index;
    for (const [position, button] of agents.entries()) {
      const selected = position === index;
      button.setAttribute("aria-pressed", String(selected));
      agentCards[position].hidden = !selected;
    }
  }

  function scheduleNextStep() {
    startedAt = performance.now();
    timer = window.setTimeout(() => {
      const nextAgent = panels[active] === runPanel
        ? configuredAgents.find((index) => index > activeAgent)
        : undefined;
      if (nextAgent !== undefined) {
        showAgent(nextAgent);
        resetStepTimer();
        announceStep();
        scheduleNextStep();
      } else if (active === steps.length - 1) {
        setPlayback("finished");
      } else {
        showStep(active + 1);
        scheduleNextStep();
      }
    }, remaining);
  }

  for (const [index, step] of steps.entries()) {
    step.disabled = false;
    step.addEventListener("click", () => {
      window.clearTimeout(timer);
      setPlayback("ready");
      showStep(index);
    });
  }

  function pausePlayback() {
    window.clearTimeout(timer);
    remaining = Math.max(0, remaining - (performance.now() - startedAt));
    setPlayback("paused");
  }

  agentPicker.addEventListener("focusin", () => {
    if (demo.dataset.playback === "playing") pausePlayback();
  });

  for (const [index, agent] of agents.entries()) {
    agent.addEventListener("click", () => {
      window.clearTimeout(timer);
      setPlayback("ready");
      showAgent(index);
      announceStep();
    });
  }

  play.addEventListener("click", () => {
    const playback = demo.dataset.playback;
    if (playback === "playing") {
      pausePlayback();
      return;
    }

    if (playback !== "paused") {
      showAgent(configuredAgents[0]);
      showStep(0);
    }
    setPlayback("playing");
    scheduleNextStep();
  });

  setPlayback("ready");
  play.hidden = false;
  agentPicker.hidden = false;
}
