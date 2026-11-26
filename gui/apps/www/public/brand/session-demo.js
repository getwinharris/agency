const demo = document.querySelector("[data-session-demo]");
const controls = demo?.querySelector(".mode-controls");
const caption = demo?.querySelector(".mode-caption");

if (demo && controls && caption) {
  const messages = {
    local: "Keep the coding agent, files, and worktree on your Mac for a local session.",
    remote: "Connect to your private Linux Core and return to the remote session when you reconnect.",
  };
  const buttons = controls.querySelectorAll("button[data-mode]");

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;
      demo.dataset.activeMode = mode;
      caption.textContent = messages[mode];

      for (const option of buttons) {
        option.setAttribute("aria-pressed", String(option === button));
      }
    });
  }

  controls.hidden = false;
}
