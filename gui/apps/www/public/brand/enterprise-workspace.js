(() => {
  const tour = document.querySelector("[data-landing-tour]");
  const label = document.querySelector("[data-workspace-target]");
  if (!tour || !label) return;
  const find = key => tour.querySelector(`[data-tour-${key}]`);
  const play = find("play");
  const send = find("send");
  const target = find("target");
  const agent = find("agent");
  const prompt = find("prompt");
  const message = find("message");
  const response = find("response");
  const status = find("status");
  const goal = tour.querySelector(".tour-goal");
  const picked = tour.querySelector(".tour-sidebar b");
  function updateTarget() {
    label.dataset.workspaceTarget = target.value;
    picked.dataset.environment = target.value;
    for (const word of label.querySelectorAll("[data-target-word]")) {
      if (word.dataset.targetWord === target.value) word.removeAttribute("aria-hidden");
      else word.setAttribute("aria-hidden", "true");
    }
  }
  play.addEventListener("click", () => {
    send.disabled = false;
    send.hidden = false;
    target.disabled = agent.disabled = true;
    target.value = "local";
    agent.selectedIndex = 0;
    message.hidden = response.hidden = true;
    prompt.hidden = false;
    goal.open = false;
    updateTarget();
    status.textContent = "Send the sample prompt.";
    play.textContent = "Replay demo";
    send.focus();
  });
  send.addEventListener("click", () => {
    send.disabled = send.hidden = true;
    prompt.hidden = true;
    message.hidden = response.hidden = false;
    goal.open = true;
    target.disabled = false;
    status.textContent = "Goal complete. Try switching this thread from Local to Cloud.";
    target.focus();
  });
  target.addEventListener("change", () => {
    updateTarget();
    agent.disabled = false;
    status.textContent = `Working in ${target.selectedOptions[0].text}. Try choosing another agent.`;
  });
  agent.addEventListener("change", () => {
    status.textContent = `${agent.value} is selected for this sample in ${target.selectedOptions[0].text}.`;
  });
})();
