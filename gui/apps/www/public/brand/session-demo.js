const demo = document.querySelector("[data-session-demo]");

if (demo) {
  const steps = [...demo.querySelectorAll("[data-demo-step]")];
  const panels = [...demo.querySelectorAll("[data-demo-panel]")];
  const play = demo.querySelector("[data-demo-play]");
  const announcement = demo.querySelector("[data-demo-status]");
  const playLabels = {
    ready: "Play demo",
    playing: "Pause demo",
    paused: "Resume demo",
    finished: "Replay demo",
  };

  let active = 0;
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
    announcement.textContent = `Step ${index + 1} of ${steps.length}: ${steps[index].textContent}`;
    remaining = Number(panels[index].dataset.duration);
  }

  function scheduleNextStep() {
    startedAt = performance.now();
    timer = window.setTimeout(() => {
      if (active === steps.length - 1) {
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

  play.addEventListener("click", () => {
    const playback = demo.dataset.playback;
    if (playback === "playing") {
      window.clearTimeout(timer);
      remaining = Math.max(0, remaining - (performance.now() - startedAt));
      setPlayback("paused");
      return;
    }

    if (playback !== "paused") showStep(0);
    setPlayback("playing");
    scheduleNextStep();
  });

  setPlayback("ready");
  play.hidden = false;
}
