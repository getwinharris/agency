const menu = document.querySelector(".mobile-links");

menu?.addEventListener("click", (event) => {
  if (event.target.closest("a")) menu.open = false;
});

menu?.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menu.open) {
    menu.open = false;
    menu.querySelector("summary").focus();
  }
});

const form = document.querySelector("#mediahub-inquiry");

if (form) {
  const status = document.querySelector("#brief-status");
  const success = document.querySelector("#brief-success");
  const submitButton = form.querySelector('button[type="submit"]');
  const errors = form.querySelectorAll("[data-field-error]");
  const startedAt = form.elements.namedItem("startedAt");
  const service = form.elements.namedItem("service");
  const consent = form.elements.namedItem("consent");
  const campaign = new URLSearchParams(location.search);
  startedAt.value = String(Date.now());

  for (const link of document.querySelectorAll("[data-service]")) {
    link.addEventListener("click", () => { service.value = link.dataset.service; });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitButton.disabled || !form.reportValidity()) return;

    for (const error of errors) {
      error.textContent = "";
      form.elements.namedItem(error.dataset.fieldError)?.removeAttribute("aria-invalid");
    }

    const context = {
      page: `${location.origin}${location.pathname}`.slice(0, 240),
      referrer: document.referrer.split(/[?#]/, 1)[0].slice(0, 500),
      utmSource: campaign.get("utm_source") || "",
      utmMedium: campaign.get("utm_medium") || "",
      utmCampaign: campaign.get("utm_campaign") || "",
      utmContent: campaign.get("utm_content") || "",
      device: innerWidth < 720 ? "mobile" : innerWidth < 1100 ? "tablet" : "desktop",
    };
    const body = { ...Object.fromEntries(new FormData(form)), ...context, consent: consent.checked };

    submitButton.disabled = true;
    status.textContent = "Submitting project brief…";
    try {
      const response = await fetch("/api/mediahub/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        let firstInvalidField;
        for (const error of errors) {
          const message = data?.fields?.[error.dataset.fieldError];
          if (typeof message !== "string" || !message) continue;
          const field = form.elements.namedItem(error.dataset.fieldError);
          error.textContent = message;
          field.setAttribute("aria-invalid", "true");
          firstInvalidField ??= field;
        }
        firstInvalidField?.focus();
        status.textContent = typeof data?.message === "string" ? data.message : "Your project brief could not be submitted. Please try again.";
        return;
      }

      const reference = data?.inquiry?.id;
      if (response.status !== 201 || typeof reference !== "string" || !reference) {
        status.textContent = "We could not confirm your submission. Please contact MediaHub for help.";
        return;
      }

      success.querySelector("strong").textContent = reference;
      form.hidden = true;
      success.hidden = false;
      success.focus();
      window.dataLayer?.push({ event: "mediahub_lead_submitted", inquiry_id: reference, service: body.service });
    } catch {
      status.textContent = "We could not confirm your submission. Check your connection and try again.";
    } finally {
      submitButton.disabled = false;
    }
  });

  form.hidden = false;
}
