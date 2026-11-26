const demo = document.querySelector("[data-session-demo]");
const view = demo.querySelector("canvas");
const context = view.getContext("2d");
const caption = demo.querySelector(".mode-caption");
const controls = demo.querySelector(".mode-controls");
const header = document.querySelector(".site-header");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const copy = {
  local: "Your Mac runs the native coding agent.",
  remote: "Your private Linux Core runs the agent and keeps its session history.",
};

let mode = "local";
let frame = 0;
let visible = true;
controls.hidden = false;

function render(time) {
  const x = mode === "local" ? 168 : 510;
  const y = 181;
  const phase = motion.matches ? 0 : (time % 1900) / 1900;
  context.clearRect(0, 0, view.width, view.height);
  context.beginPath();
  context.arc(x, y, 11 + 9 * phase, 0, Math.PI * 2);
  context.strokeStyle = `rgba(209, 181, 255, ${0.55 * (1 - phase)})`;
  context.lineWidth = 2;
  context.stroke();
  context.beginPath();
  context.arc(x, y, 4, 0, Math.PI * 2);
  context.fillStyle = "#d1b5ff";
  context.fill();
}

function loop(time) {
  render(time);
  frame = requestAnimationFrame(loop);
}

function updateAnimation() {
  if (!context) return;
  cancelAnimationFrame(frame);
  render(0);
  if (!motion.matches && visible && !document.hidden) frame = requestAnimationFrame(loop);
}

for (const button of controls.querySelectorAll("button")) {
  button.addEventListener("click", () => {
    mode = button.dataset.mode;
    caption.textContent = copy[mode];
    for (const item of controls.querySelectorAll("button")) {
      item.setAttribute("aria-pressed", String(item === button));
    }
    updateAnimation();
  });
}

if ("IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    updateAnimation();
  }).observe(demo);
}

window.addEventListener("scroll", () => header.classList.toggle("is-scrolled", scrollY > 18), { passive: true });
motion.addEventListener("change", updateAnimation);
document.addEventListener("visibilitychange", updateAnimation);
updateAnimation();
