const menu = document.querySelector("[data-landing-menu]");

if (menu) {
  const trigger = menu.querySelector("summary");
  for (const link of menu.querySelectorAll("nav a")) {
    link.addEventListener("click", () => { menu.open = false; });
  }
  menu.addEventListener("focusout", ({ relatedTarget }) => {
    if (menu.open && relatedTarget && !menu.contains(relatedTarget)) menu.open = false;
  });
  document.addEventListener("click", (event) => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener("keydown", (event) => {
    if (!menu.open || event.key !== "Escape") return;
    menu.open = false;
    trigger.focus();
  });
  matchMedia("(max-width: 620px)").addEventListener("change", ({ matches }) => {
    if (!matches) menu.open = false;
  });
}
