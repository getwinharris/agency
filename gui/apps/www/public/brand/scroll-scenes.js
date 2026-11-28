(() => {
  const scenes = [...document.querySelectorAll("[data-scroll-scene]")];
  if (!scenes.length) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let pending = false;
  function draw() {
    pending = false;
    if (reduced.matches) return;
    const viewport = Math.max(1, document.documentElement.clientHeight);
    const progress = scenes.map(scene => {
      const { top, height } = scene.getBoundingClientRect();
      // Measure layout rather than the reveal offset, so reversing to the
      // same scroll position yields the same progress.
      const offsetY = Number.parseFloat(getComputedStyle(scene).translate.split(" ")[1]) || 0;
      const distance = Math.min(viewport * .35, Math.max(108, height * .6));
      return Math.max(0, Math.min(1, (viewport * .94 - (top - offsetY)) / distance)).toFixed(3);
    });
    scenes.forEach((scene, i) => {
      if (scene.style.getPropertyValue("--scene-progress") !== progress[i])
        scene.style.setProperty("--scene-progress", progress[i]);
    });
  }
  function schedule() {
    if (!pending && !reduced.matches) {
      pending = true;
      requestAnimationFrame(draw);
    }
  }
  for (const event of ["scroll", "resize", "load", "pageshow"]) addEventListener(event, schedule, { passive: true });
  reduced.addEventListener("change", schedule);
  schedule();
})();
