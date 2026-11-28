(() => {
  const scene = document.querySelector("[data-workflow-scene]");
  const root = scene?.querySelector("[data-workflow-streams]");
  if (!root) return;
  const bars = [...scene.querySelectorAll(".workflow-bar")];
  const points = bars.flatMap(bar => [...bar.querySelectorAll(".workflow-mark")]);
  const plot = scene.querySelector(".workflow-scene-visual");
  const readout = scene.querySelector("[data-workflow-reveal]");
  const local = scene.querySelector("[data-workflow-local-state]");
  const cloud = scene.querySelector("[data-workflow-cloud-state]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let current = 0;
  function inspect(index) {
    current = index;
    const point = points[index];
    const group = bars[Math.floor(index / 6)];
    group.setAttribute("aria-label", point.dataset.workflowLabel);
    group.querySelector(".workflow-tooltip").textContent = point.dataset.workflowLabel;
    for (const item of points) item.toggleAttribute("data-workflow-inspected", item === point);
  }
  function pointAt(event, bar, group) {
    const { left, width } = bar.getBoundingClientRect();
    return group * 6 + Math.max(0, Math.min(5, Math.floor((event.clientX - left) * 6 / width)));
  }
  function setTabStop(index) { bars.forEach((bar, i) => { bar.tabIndex = i === index ? 0 : -1; }); }
  setTabStop(0);
  bars.forEach((bar,index) => {
    bar.addEventListener("pointermove", event => {
      if (event.pointerType !== "touch") inspect(pointAt(event,bar,index));
    });
    bar.addEventListener("click", event => {
      if (event.detail > 0) inspect(pointAt(event,bar,index));
      const on = bar.getAttribute("aria-pressed") !== "true";
      for (const candidate of bars) candidate.setAttribute("aria-pressed", String(candidate === bar && on));
    });
    bar.addEventListener("focus", () => {
      setTabStop(index);
      if (Math.floor(current/6) !== index) inspect(index * 6);
    });
    bar.addEventListener("keydown", event => {
      if (!["ArrowRight","ArrowLeft","Home","End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 :
        Math.max(0, Math.min(points.length - 1, current + (event.key === "ArrowRight" ? 1 : -1)));
      inspect(next);
      bars[Math.floor(next / 6)].focus();
    });
  });
  inspect(0);
  function renderHandoff() {
    const raw = plot.style.getPropertyValue("--scene-progress");
    const progress = reduced.matches ? 1 : raw ? Number(raw) : 1;
    const after = progress >= .48;
    const percent = Math.floor(progress * 100);
    const value = percent >= 80 ? "80%+" : percent >= 50 ? `${percent}%` : "–";
    if (readout && readout.textContent !== value) readout.textContent = value;
    const localLabel = after ? "Local · Pauses" : "Local · Running";
    const cloudLabel = after ? "Cloud · Continues" : "Cloud · Ready";
    if (local.textContent !== localLabel) local.textContent = localLabel;
    if (cloud.textContent !== cloudLabel) cloud.textContent = cloudLabel;
    plot.toggleAttribute("data-cloud-running", after);
  }
  new MutationObserver(renderHandoff).observe(plot,{attributes:true,attributeFilter:["style"]});
  reduced.addEventListener("change", renderHandoff);
  renderHandoff();
  let paused = false;
  function update() {
    root.toggleAttribute("data-workflow-motion", !reduced.matches);
    root.toggleAttribute("data-workflow-paused", paused);
  }
  document.addEventListener("bapx-page-motion", (event) => { paused = event.detail.paused; update(); });
  reduced.addEventListener("change", update);
  if ("IntersectionObserver" in window) new IntersectionObserver(([entry]) => {
    root.toggleAttribute("data-workflow-in-view", entry.isIntersecting);
  }).observe(root);
  else root.setAttribute("data-workflow-in-view", "");
  update();
})();
