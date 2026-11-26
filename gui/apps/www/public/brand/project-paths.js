const guide = document.querySelector("[data-project-guide]");

if (guide) {
  const choices = guide.querySelector(".project-choices");
  const buttons = choices.querySelectorAll("[data-project-path]");
  const panels = guide.querySelectorAll("[data-project-panel]");

  function selectPath(path) {
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset.projectPath === path));
    }
    for (const panel of panels) {
      panel.hidden = panel.dataset.projectPanel !== path;
    }
  }

  for (const button of buttons) {
    button.addEventListener("click", () => selectPath(button.dataset.projectPath));
  }

  selectPath(buttons[0].dataset.projectPath);
  choices.hidden = false;
  guide.dataset.enhanced = "";
}
