(() => {
  const section = document.querySelector("[data-credential-routes]");
  const controls = section?.querySelector("[data-credential-filter]");
  const status = section?.querySelector("[data-route-summary]");
  if (!controls || !status) return;
  controls.hidden = false;
  const diagram = section.querySelector(".credential-diagram");
  const connectors = section.querySelectorAll("[data-connector-side]");
  const alignRoutes = () => {
    for (const svg of connectors) {
      const side = svg.dataset.connectorSide;
      const lane = section.querySelector(`.credential-${side}`);
      const box = svg.getBoundingClientRect();
      if (!lane || !box.width || !box.height) continue;
      const w = box.width;
      const h = box.height;
      const center = h / 2;
      const viewBox = `0 0 ${w} ${h}`;
      if (svg.getAttribute("viewBox") !== viewBox) svg.setAttribute("viewBox", viewBox);
      for (const row of lane.querySelectorAll("li[data-route]")) {
        const icon = row.querySelector("[data-route-icon]")?.getBoundingClientRect();
        const route = row.dataset.route;
        const curve = svg.querySelector(`path[data-route="${route}"]`);
        if (!icon || !curve) continue;
        const left = side === "left";
        const x = (left ? icon.right + 6 : icon.left - 6) - box.left;
        const y = icon.top + icon.height / 2 - box.top;
        const reach = (left ? w - x : x) * .5;
        const d = left
          ? `M${x} ${y} C${x + reach} ${y} ${w - reach} ${center} ${w} ${center}`
          : `M0 ${center} C${reach} ${center} ${x - reach} ${y} ${x} ${y}`;
        if (curve.getAttribute("d") === d) continue;
        curve.setAttribute("d", d);
      }
    }
  };
  const roomNetworks = section.querySelectorAll("[data-room-network]");
  const alignRoomLinks = roomNetwork => {
    const side = roomNetwork.dataset.roomNetwork;
    const box = roomNetwork.getBoundingClientRect();
    if (!box.width || !box.height) return;
    roomNetwork.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    const center = id => {
      const icon = section.querySelector(`.credential-${side} [data-route="${id}"] [data-route-icon]`);
      if (!icon) return null;
      const r = icon.getBoundingClientRect();
      return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top, gap: r.width / 2 + 4 };
    };
    for (const path of roomNetwork.querySelectorAll("[data-room-from]")) {
      const a = center(path.dataset.roomFrom);
      const b = center(path.dataset.roomTo);
      if (!a || !b) continue;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length <= a.gap + b.gap) continue;
      const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length;
      const bend = Number(path.dataset.bend) * Math.min(1, box.width / 350);
      const outward = Math.max(4, Math.min(a.x-a.gap, b.x-b.gap) - Math.min(23,box.width*.07));
      const d = side === "left"
        ? `M${a.x-a.gap} ${a.y} C${outward} ${a.y} ${outward} ${b.y} ${b.x-b.gap} ${b.y}`
        : `M${a.x + dx * a.gap} ${a.y + dy * a.gap} Q${(a.x+b.x)/2 - dy*bend} ${(a.y+b.y)/2 + dx*bend} ${b.x-dx*b.gap} ${b.y-dy*b.gap}`;
      if (path.getAttribute("d") !== d) path.setAttribute("d", d);
    }
  };
  const alignTeam = () => {
    const svg = section.querySelector("[data-team-network]");
    const hub = section.querySelector(".credential-hub-ring")?.getBoundingClientRect();
    const cloud = section.querySelector('.credential-right [data-route="hermes"] [data-route-icon]')?.getBoundingClientRect();
    const box = svg?.getBoundingClientRect();
    if (!box?.width || !box.height || !hub || !cloud) return;
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    const cx = hub.left + hub.width / 2 - box.left;
    const cy = hub.top + hub.height / 2 - box.top;
    const hubR = hub.width / 2;
    for (const path of svg.querySelectorAll("[data-team-link]")) {
      const person = section.querySelector(`[data-team-role="${path.dataset.teamLink}"]`);
      const avatar = person?.querySelector(".credential-team-avatar")?.getBoundingClientRect();
      if (!avatar?.width) continue;
      const isOwner = path.dataset.teamLink === "owner";
      const x = avatar.left + avatar.width / 2 - box.left;
      const y = (isOwner ? person.getBoundingClientRect().bottom + 4 : avatar.top - 4) - box.top;
      const hx = cx, hy = cy + (isOwner ? -hubR : hubR);
      const midY = (y+hy)/2;
      path.setAttribute("d", `M${x} ${y} C${x} ${midY} ${hx} ${midY} ${hx} ${hy}`);
    }
    const targetX = cloud.left - box.left - 5;
    const targetY = cloud.top + cloud.height/2 - box.top;
    const x = cx + hubR*.70, y = cy + hubR*.70;
    const midY = (y+targetY)/2;
    svg.querySelector("[data-team-cloud]")?.setAttribute("d", `M${x} ${y} C${x+10} ${midY} ${targetX-18} ${targetY} ${targetX} ${targetY}`);
  };
  const layout = () => { alignRoutes(); roomNetworks.forEach(alignRoomLinks); alignTeam(); };
  layout();
  if (diagram && typeof ResizeObserver !== "undefined") new ResizeObserver(layout).observe(diagram);
  const sources = [...section.querySelectorAll("[data-source-choice]")];
  const routeGroups = new Map([...section.querySelectorAll("[data-source-targets]")].map(panel =>
    [panel.dataset.priceRoute, panel.dataset.sourceTargets.split(" ")]));
  let hovered = null;
  let focused = null;
  const syncActive = () => {
    const view = section.dataset.filter;
    const route = view === "all" ? hovered ?? (focused?.matches(":focus-visible") ? focused.closest("[data-route]").dataset.route : null) : view;
    const activeRoutes = new Set(route ? [route, ...(routeGroups.get(route) ?? [])] : []);
    section.toggleAttribute("data-route-focus", Boolean(route));
    for (const node of section.querySelectorAll("[data-route], [data-dot-route]")) {
      node.toggleAttribute("data-route-active", activeRoutes.has(node.dataset.route ?? node.dataset.dotRoute));
    }
  };
  for (const icon of section.querySelectorAll("[data-route-icon]")) {
    const route = icon.closest("[data-route]").dataset.route;
    if (icon.tagName !== "BUTTON") icon.addEventListener("mousedown", event => event.preventDefault());
    icon.addEventListener("pointerenter", event => {
      if (event.pointerType === "touch") return;
      hovered = route;
      syncActive();
    });
    icon.addEventListener("pointerleave", () => { hovered = null; syncActive(); });
    icon.addEventListener("focus", () => { focused = icon; syncActive(); });
    icon.addEventListener("blur", () => { focused = null; syncActive(); });
  }
  const render = choice => {
    const route = choice.dataset.routeChoice ?? choice.dataset.sourceChoice;
    const inOverview = route === "all";
    section.dataset.filter = route;
    const standalone = [...section.querySelectorAll("[data-standalone-plan]")];
    const activePlan = standalone.find(panel => panel.dataset.standalonePlan === route);
    if (diagram) diagram.hidden = Boolean(activePlan);
    for (const panel of standalone) panel.hidden = panel !== activePlan;
    if (!activePlan) layout();
    for (const roomNetwork of [...roomNetworks, ...section.querySelectorAll("[data-team-network]")]) {
      if (inOverview) roomNetwork.unpauseAnimations?.();
      else roomNetwork.pauseAnimations?.();
    }
    for (const button of [...controls.querySelectorAll("button"), ...sources]) {
      button.setAttribute("aria-pressed", String(button === choice));
    }
    for (const panel of section.querySelectorAll("[data-price-route]")) {
      panel.hidden = panel.dataset.priceRoute !== route;
    }
    syncActive();
    status.textContent = route === "all" ? "All agent routes shown." : `${choice.getAttribute("aria-label")} route highlighted.`;
  };
  for (const source of sources) source.addEventListener("click", () => render(source));
  controls.addEventListener("click", event => {
    const choice = event.target.closest("button[data-route-choice]");
    if (choice && controls.contains(choice)) render(choice);
  });
})();
