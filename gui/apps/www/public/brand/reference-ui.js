(() => {
  const roster = document.querySelector("[data-agent-tracks]");
  if (!roster || !window.IntersectionObserver) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      if (!reduced.matches) entry.target.animate(
        [{ transform: "translateY(12px)", opacity: .58 }, { transform: "translateY(0)", opacity: 1 }],
        { duration: 360, easing: "cubic-bezier(.2,.75,.3,1)" },
      );
    }
  }, { threshold: .45 });
  for (const card of roster.querySelectorAll("[data-roster-agent]")) observer.observe(card);
})();

(() => {
  const root = document.querySelector("[data-agent-tracks]");
  if (!root) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const filterControls = root.querySelector("[data-roster-controls]");
  const filterButtons = [...filterControls.querySelectorAll("button")];
  const shared = root.querySelector('[data-agent-group="core"]');
  const extra = root.querySelector('[data-agent-group="desktop"]');
  const status = root.querySelector("[data-roster-status]");
  filterControls.hidden = false;
  let transitions = [];
  function filter(value) {
    extra.hidden = value === "core";
    shared.hidden = value === "desktop";
    for (const button of filterButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.rosterFilter === value));
    }
    const groups = [...root.querySelectorAll("[data-agent-group]:not([hidden])")];
    const cards = groups.flatMap((group) => [...group.querySelectorAll("[data-roster-agent]")]);
    status.textContent = `${cards.length} registered integrations` + (value === "core" ? " for Private Core." : value === "desktop" ? " available only through desktop." : ".");
    for (const active of transitions) active.cancel();
    transitions = reduced.matches ? [] : groups.map((group) => group.animate(
        [{ opacity: .5, transform: "translateY(5px)" }, { opacity: 1, transform: "none" }],
        { duration: 300, easing: "ease-out" },
      ));
  }
  reduced.addEventListener("change", () => { for (const active of transitions) active.cancel(); });
  status.textContent = `${root.querySelectorAll("[data-roster-agent]").length} registered integrations.`;
  for (const button of filterButtons) button.addEventListener("click", () => filter(button.dataset.rosterFilter));

  // Responsive pointer effect stays local to each existing bapX icon tile.
  root.addEventListener("pointermove", (event) => {
    if (reduced.matches || event.pointerType !== "mouse") return;
    const card = event.target.closest("[data-roster-agent]");
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--pointer-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    card.style.setProperty("--pointer-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
  });
})();

(() => {
  const lab = document.querySelector(".motion-lab");
  if (!lab) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  for (const control of lab.querySelectorAll("[data-motion-interactive]")) control.hidden = false;
  const route = lab.querySelector("[data-motion-route]");
  const routeStatus = route.querySelector("[data-route-status]");
  const routeButtons = [...route.querySelectorAll("[data-route-button]")];
  const routeText = {
    local: "Open an existing project folder and start a local thread.",
    core: "Transfer the thread and project changes to the connected private Core. Reopen the thread there to continue.",
    return: "Bring the thread and changes back to your local project when you are ready.",
  };
  function drawRoute(value) {
    route.dataset.route = value;
    for (const button of routeButtons) button.setAttribute("aria-pressed", String(button.dataset.routeButton === value));
    routeStatus.textContent = routeText[value];
  }
  for (const button of routeButtons) {
    button.addEventListener("click", () => drawRoute(button.dataset.routeButton));
    button.addEventListener("pointerenter", () => { route.dataset.routePreview = button.dataset.routeButton; });
    button.addEventListener("pointerleave", () => { delete route.dataset.routePreview; });
    button.addEventListener("focus", () => { route.dataset.routePreview = button.dataset.routeButton; });
    button.addEventListener("blur", () => { delete route.dataset.routePreview; });
  }

  const branchSlider = lab.querySelector("[data-branch-slider]");
  const branches = lab.querySelector("[data-branch-list]");
  const count = lab.querySelector("[data-branch-count]");
  branchSlider.addEventListener("input", () => {
    const size = Number(branchSlider.value);
    count.value = String(size);
    while (branches.children.length > size) branches.lastElementChild.remove();
    while (branches.children.length < size) {
      const branch = document.createElement("li");
      branch.textContent = `task / ${String(branches.children.length + 1).padStart(2, "0")}`;
      branches.append(branch);
      if (!reduced.matches) branch.animate(
        [{ opacity: 0, transform: "translateY(7px)" }, { opacity: 1, transform: "none" }],
        { duration: 320, easing: "ease-out" },
      );
    }
  });

  const night = lab.querySelector("[data-motion-night]");
  const time = night.querySelector("[data-night-time]");
  const local = night.querySelector("[data-night-local]");
  const core = night.querySelector("[data-night-core]");
  const marker = night.querySelector("[data-night-marker]");
  const status = night.querySelector("[data-night-status]");
  const stages = [...night.querySelectorAll("[data-night-stage]")];
  const sleepHour = stages[1].firstChild;
  let animation = [], frame = 0;
  function progress(step) {
    stages.forEach((stage,i)=>stage.toggleAttribute("data-active",i<=step));
  }
  function play() {
    const x = Math.round((14 + (292 * Number(time.value)) / 6) * 100) / 100;
    local.setAttribute("d", `M14 39H${x}`);
    marker.setAttribute("d", `M${x} 18V109`);
    sleepHour.textContent = time.selectedOptions[0].text + " ";
    cancelAnimationFrame(frame);
    for (const active of animation) active.cancel();
    if (reduced.matches) progress(2);
    else {
      const started = performance.now();
      const tick = (now) => {
        const ratio = Math.max(0, Math.min(1,(now-started)/1800));
        progress(ratio>=1?2:ratio>=Number(time.value)/6?1:0);
        if(ratio<1) frame=requestAnimationFrame(tick);
      };
      frame=requestAnimationFrame(tick);
    }
    animation = reduced.matches ? [] : [local, core].map((path) => path.animate(
      [{ strokeDashoffset: "100" }, { strokeDashoffset: "0" }],
      { duration: 1800, easing: "cubic-bezier(.22,.61,.36,1)" },
    ));
  }
  time.addEventListener("change", () => {
    status.textContent = `At ${time.selectedOptions[0].text}, local work pauses. The example Core can continue while online.`;
    play();
  });
  night.querySelector("[data-night-replay]").addEventListener("click", play);
  reduced.addEventListener("change", () => { for (const active of animation) active.cancel(); cancelAnimationFrame(frame); progress(2); });
  if ("IntersectionObserver" in window) {
    const observe = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observe.disconnect();
      play();
    }, { threshold: .4 });
    observe.observe(night.querySelector("svg"));
  }
})();
