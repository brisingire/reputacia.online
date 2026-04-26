const caseMetaEl = document.getElementById("case-meta");
const notFoundEl = document.getElementById("case-not-found");
const contentEl = document.getElementById("case-content");
const reviewListEl = document.getElementById("review-list");
const orderForm = document.getElementById("order-form");
const orderStatusEl = document.getElementById("order-status");
const selectedCountEl = document.getElementById("selected-count");
const totalPriceEl = document.getElementById("total-price");
const pricePerItemEl = document.getElementById("price-per-item");
const reviewsFoundCountEl = document.getElementById("reviews-found-count");
const selectAllReviewsEl = document.getElementById("select-all-reviews");
const selectedReviewDetailsEl = document.getElementById("selected-review-details");
const casePageUrlEl = document.getElementById("case-page-url");
const sourceMapsUrlEl = document.getElementById("source-maps-url");

const LEGAL_REASONS = [
  "Unwahre Tatsachenbehauptung",
  "Beleidigung / persoenlicher Angriff",
  "Kein Kundenkontakt / kein Leistungsbezug",
  "Spam / Manipulation",
  "Datenschutz / Persoenlichkeitsrecht",
  "Sonstiger Verstoss",
];

function getTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") || "";
}

function getStoredCases() {
  const raw = localStorage.getItem("reputalex_cases");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOrder(order) {
  const raw = localStorage.getItem("reputalex_orders");
  let orders = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      orders = Array.isArray(parsed) ? parsed : [];
    } catch {
      orders = [];
    }
  }
  orders.unshift(order);
  localStorage.setItem("reputalex_orders", JSON.stringify(orders));
}

function renderReviews(caseData) {
  if (reviewsFoundCountEl) {
    reviewsFoundCountEl.textContent = String(caseData.reviews.length || 0);
  }
  reviewListEl.innerHTML = caseData.reviews
    .map((review, idx) => {
      return `
        <article class="review-card" data-review-id="${review.id}">
          <div class="review-card-top">
            <label class="review-head">
              <input
                type="checkbox"
                class="js-review-toggle"
                data-review-id="${review.id}"
                name="selectedReviews[]"
                value="${idx + 1} | ${review.stars} Sterne | ${review.author}"
              />
              <span>Auswaehlen</span>
            </label>
            <p class="review-meta"><strong>${review.stars} Sterne</strong> • ${review.author}, ${review.date}</p>
          </div>
          <p>${review.text}</p>
        </article>
      `;
    })
    .join("");
}

function updateTotals(pricePerReview) {
  const selected = Array.from(document.querySelectorAll(".js-review-toggle")).filter(
    (el) => el.checked,
  );
  const count = selected.length;
  selectedCountEl.textContent = String(count);
  totalPriceEl.textContent = String(count * pricePerReview);
}

function updateSelectedReviewDetails(caseData) {
  if (!selectedReviewDetailsEl) return;
  const selectedIds = Array.from(document.querySelectorAll(".js-review-toggle:checked")).map(
    (el) => el.dataset.reviewId,
  );
  const selected = selectedIds
    .map((id) => caseData.reviews.find((entry) => entry.id === id))
    .filter(Boolean)
    .map((review, idx) => {
      return `${idx + 1}) ${review.stars} Sterne | ${review.author} | ${review.date} | ${review.text}`;
    });
  selectedReviewDetailsEl.value = selected.join("\n");
}

function bindReviewInteractions(pricePerReview, caseData) {
  const toggles = Array.from(document.querySelectorAll(".js-review-toggle"));
  const selectionStorageKey = `reputalex_selection_${caseData.token}`;

  const persistSelection = () => {
    const selectedIds = toggles
      .filter((toggle) => toggle.checked)
      .map((toggle) => toggle.dataset.reviewId);
    localStorage.setItem(selectionStorageKey, JSON.stringify(selectedIds));
  };

  const restoreSelection = () => {
    try {
      const raw = localStorage.getItem(selectionStorageKey);
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids)) return;
      toggles.forEach((toggle) => {
        toggle.checked = ids.includes(toggle.dataset.reviewId);
      });
    } catch {
      /* ignore */
    }
  };

  const syncSelectAll = () => {
    if (!selectAllReviewsEl) return;
    const allSelected = toggles.length > 0 && toggles.every((toggle) => toggle.checked);
    selectAllReviewsEl.checked = allSelected;
  };

  toggles.forEach((toggle) => {
    toggle.addEventListener("change", () => {
      syncSelectAll();
      updateTotals(pricePerReview);
      updateSelectedReviewDetails(caseData);
      persistSelection();
    });
  });

  if (selectAllReviewsEl) {
    selectAllReviewsEl.addEventListener("change", () => {
      toggles.forEach((toggle) => {
        toggle.checked = selectAllReviewsEl.checked;
      });
      updateTotals(pricePerReview);
      updateSelectedReviewDetails(caseData);
      persistSelection();
    });
  }

  restoreSelection();
  syncSelectAll();
  updateTotals(pricePerReview);
  updateSelectedReviewDetails(caseData);
}

function init() {
  const token = getTokenFromUrl();
  const cases = getStoredCases();
  const caseData = cases.find((entry) => entry.token === token);

  if (!token || !caseData) {
    notFoundEl.classList.remove("hidden");
    contentEl.classList.add("hidden");
    caseMetaEl.textContent = "";
    return;
  }

  const pricePerReview = Number(caseData.pricePerReview) || 49;
  pricePerItemEl.textContent = String(pricePerReview);
  const metaParts = [`Unternehmen: ${caseData.companyName}`];
  if (caseData.mapsUrl) {
    metaParts.push(`Profil: ${caseData.mapsUrl}`);
  }
  if (caseData.source === "scraper_json_import") {
    metaParts.push(
      `Quelle: Scraper-Import (${caseData.negativeReviewCountLoaded || 0} von ${caseData.importedReviewCount || 0} Bewertungen)`,
    );
  }
  caseMetaEl.textContent = metaParts.join(" | ");
  contentEl.classList.remove("hidden");
  notFoundEl.classList.add("hidden");

  if (casePageUrlEl) {
    casePageUrlEl.value = window.location.href;
  }
  if (sourceMapsUrlEl) {
    sourceMapsUrlEl.value = caseData.mapsUrl || "";
  }

  if (orderForm.companyName) {
    orderForm.companyName.value = caseData.companyName;
  }

  renderReviews(caseData);
  bindReviewInteractions(pricePerReview, caseData);

  orderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selectedIds = Array.from(
      document.querySelectorAll(".js-review-toggle:checked"),
    ).map((el) => el.dataset.reviewId);

    if (selectedIds.length === 0) {
      orderStatusEl.textContent = "Bitte waehlen Sie mindestens eine Bewertung aus.";
      orderStatusEl.style.color = "#b91c1c";
      return;
    }

    const selectedReviews = selectedIds.map((reviewId) => {
      const review = caseData.reviews.find((entry) => entry.id === reviewId);
      const reasonEl = document.querySelector(`.js-reason[data-review-id="${reviewId}"]`);
      const noteEl = document.querySelector(`.js-note[data-review-id="${reviewId}"]`);
      return {
        reviewId,
        summary: review ? review.text : "",
        reason: reasonEl ? reasonEl.value : "",
        note: noteEl ? noteEl.value.trim() : "",
      };
    });

    const formData = new FormData(orderForm);
    const selectedReasons = formData.getAll("reasons[]").map((reason) => String(reason).trim());
    if (selectedReasons.length === 0) {
      orderStatusEl.textContent =
        "Bitte waehlen Sie mindestens einen Grund fuer den Loeschantrag aus.";
      orderStatusEl.style.color = "#b91c1c";
      return;
    }

    const street = String(formData.get("street") || "").trim();
    const houseNumber = String(formData.get("houseNumber") || "").trim();
    const postalCode = String(formData.get("postalCode") || "").trim();
    const city = String(formData.get("city") || "").trim();
    const companyAddress = `${street} ${houseNumber}, ${postalCode} ${city}`.trim();

    const order = {
      orderId: `order_${Date.now()}`,
      token,
      createdAt: new Date().toISOString(),
      ownerName: String(formData.get("ownerName") || "").trim(),
      companyName: String(formData.get("companyName") || "").trim(),
      street,
      houseNumber,
      postalCode,
      city,
      companyAddress,
      contactEmail: String(formData.get("contactEmail") || "").trim(),
      total: selectedReviews.length * pricePerReview,
      pricePerReview,
      reasons: selectedReasons,
      selectedReviews,
      consentAuthority: Boolean(formData.get("consentAuthority")),
      consentCosts: Boolean(formData.get("consentCosts")),
    };

    saveOrder(order);
    updateSelectedReviewDetails(caseData);

    try {
      const payload = new FormData(orderForm);
      const response = await fetch(orderForm.action, {
        method: "POST",
        body: payload,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Formularversand fehlgeschlagen (${response.status})`);
      }

      orderStatusEl.textContent =
        "Vielen Dank. Der Auftrag wurde uebermittelt. Ausgewaehlte Bewertungen bleiben zur Nachvollziehbarkeit markiert.";
      orderStatusEl.style.color = "#166534";
    } catch (error) {
      orderStatusEl.textContent =
        "Der Auftrag wurde lokal gespeichert, konnte aber nicht per E-Mail uebermittelt werden. Bitte erneut senden.";
      orderStatusEl.style.color = "#b91c1c";
      console.error(error);
    }
  });
}

init();
