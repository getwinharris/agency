const page = document.querySelector("[data-download-page]");

if (page) {
  const { userAgent, platform, maxTouchPoints, userAgentData } = navigator;
  const hints = [userAgentData?.platform, platform, userAgent].filter(Boolean).join(" ");
  let detected;

  // iPadOS desktop mode can present a Mac platform string.
  if (/iPad|iPhone|iPod/i.test(hints) || (/Mac/i.test(hints) && maxTouchPoints > 1)) {
    detected = null;
  } else if (/Android/i.test(hints)) {
    detected = "android";
  } else if (/Windows|Win32|Win64/i.test(hints)) {
    detected = "windows";
  } else if (/Mac/i.test(hints)) {
    detected = "macos";
  } else if (/Linux/i.test(hints) && !/CrOS|Chrome OS/i.test(hints)) {
    detected = "linux";
  }

  const notice = page.querySelector("[data-download-detection]");
  // Highlight the OS only. Browser platform strings don't reliably identify CPU architecture.
  const card = detected && page.querySelector(`[data-download-platform="${detected}"]`);
  if (card && notice) {
    const name = card.querySelector("h3").textContent;
    card.dataset.recommended = "true";
    notice.textContent = `${name} detected. All platform options are shown below.`;
    notice.hidden = false;
  }
}
