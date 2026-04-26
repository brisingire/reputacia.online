const forms = document.querySelectorAll(".js-formspree-form");

for (const form of forms) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const statusId = form.dataset.statusTarget;
    const statusMessage = statusId ? document.getElementById(statusId) : null;
    const thanksUrl = String(form.dataset.thanksUrl || "").trim();

    if (!statusMessage) {
      return;
    }

    statusMessage.textContent = "Изпращане на запитване...";
    statusMessage.style.color = "#4b5563";

    const formData = new FormData(form);

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
        },
      });

      if (response.ok) {
        statusMessage.textContent =
          "Благодарим. Вашето запитване беше изпратено успешно.";
        statusMessage.style.color = "#166534";
        form.reset();
        if (thanksUrl) {
          window.location.assign(thanksUrl);
        }
      } else {
        let detail =
          "Запитването не можа да бъде изпратено. Моля, опитайте отново.";
        try {
          const data = await response.json();
          if (data && data.error) {
            detail = String(data.error);
          }
        } catch {
          /* ignore */
        }
        if (response.status === 404) {
          detail =
            "В момента запитването не може да бъде изпратено. Моля, опитайте отново след няколко минути.";
        } else if (response.status === 422) {
          detail =
            "Въведените данни не могат да бъдат обработени. Моля, проверете полетата и опитайте отново.";
        } else if (
          /form not found|form_not_found/i.test(detail) &&
          response.status !== 404
        ) {
          detail =
            "Запитването не може да бъде доставено в момента. Моля, опитайте отново.";
        }
        statusMessage.textContent = detail;
        statusMessage.style.color = "#b91c1c";
      }
    } catch (error) {
      statusMessage.textContent =
        "Мрежова грешка. Моля, проверете връзката и опитайте отново.";
      statusMessage.style.color = "#b91c1c";
      console.error(error);
    }
  });
}
