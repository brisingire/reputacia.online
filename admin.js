const adminForm = document.getElementById("admin-analyze-form");
const importForm = document.getElementById("admin-import-form");
const statusMessage = document.getElementById("admin-status");
const importStatusMessage = document.getElementById("import-status");
const resultBox = document.getElementById("admin-result");
const customerLinkEl = document.getElementById("customer-link");
const openCustomerLinkEl = document.getElementById("open-customer-link");

const PRICE_PER_REVIEW_EUR = 49;

function parseCompanyName(mapsUrl) {
  try {
    const url = new URL(mapsUrl);
    const placeMatch = url.pathname.match(/\/place\/([^/]+)/i);
    if (placeMatch && placeMatch[1]) {
      return decodeURIComponent(placeMatch[1]).replace(/\+/g, " ").trim();
    }
  } catch {
    return "";
  }
  return "";
}

function parseSearchQuery(mapsUrl) {
  const fromPath = parseCompanyName(mapsUrl);
  if (fromPath) {
    return fromPath;
  }
  try {
    const url = new URL(mapsUrl);
    const q = url.searchParams.get("q");
    if (q) {
      return q.trim();
    }
  } catch {
    return mapsUrl;
  }
  return mapsUrl;
}

function createToken() {
  return `rl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function detectGround(text) {
  const value = text.toLowerCase();
  if (/idiot|betrug|abzocke|kriminell|verbrecher|arsch|dumm/i.test(value)) {
    return "Beleidigung / persoenlicher Angriff";
  }
  if (/nie dort|kein kunde|nie kunden|ohne kontakt/i.test(value)) {
    return "Kein Kundenkontakt / kein Leistungsbezug";
  }
  if (/copy|spam|bot|fake/i.test(value)) {
    return "Spam / Manipulation";
  }
  if (/datenschutz|privat|adresse|telefon/i.test(value)) {
    return "Datenschutz / Persoenlichkeitsrecht";
  }
  return "Unwahre Tatsachenbehauptung";
}

function computeScore(text, rating) {
  let score = 52;
  const value = text.toLowerCase();
  if (rating <= 2) score += 12;
  if (/betrug|abzocke|kriminell|fake|nie dort|idiot|hass/i.test(value)) score += 18;
  if (value.length > 160) score += 6;
  if (value.length < 30) score -= 6;
  return Math.max(40, Math.min(96, score));
}

function isLikelyNegativeReview(review) {
  const text = String(review.text || "").toLowerCase();
  const stars = Number(review.stars || 0);
  if (stars > 0 && stars <= 3) {
    return true;
  }
  return /schlecht|nie wieder|abzocke|betrug|fake|unfreundlich|katastrophe|enttaeuscht|problem/i.test(
    text,
  );
}

async function fetchGooglePlace(apiKey, mapsUrl) {
  const query = parseSearchQuery(mapsUrl);
  const searchResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.googleMapsUri",
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 1,
      languageCode: "de",
    }),
  });

  if (!searchResponse.ok) {
    throw new Error(`Google Suche fehlgeschlagen (${searchResponse.status})`);
  }

  const searchData = await searchResponse.json();
  const place = searchData?.places?.[0];
  if (!place?.id) {
    throw new Error("Kein Unternehmen zur URL gefunden.");
  }

  const detailResponse = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(place.id)}?languageCode=de`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,googleMapsUri,reviews,rating,userRatingCount",
      },
    },
  );

  if (!detailResponse.ok) {
    throw new Error(`Google Details fehlgeschlagen (${detailResponse.status})`);
  }

  return detailResponse.json();
}

function mapReviewsFromGoogle(placeDetails) {
  const reviews = Array.isArray(placeDetails.reviews) ? placeDetails.reviews : [];
  const mapped = reviews
    .filter((review) => review.text?.text)
    .map((review) => {
      const text = String(review.text.text || "").trim();
      const rating = Number(review.rating || 0);
      return {
        id: `rev_${Math.random().toString(36).slice(2, 9)}`,
        author: review.authorAttribution?.displayName || "Unbekannt",
        stars: rating || 0,
        date: review.relativePublishTimeDescription || "ohne Zeitangabe",
        text,
        score: computeScore(text, rating),
        suggestedGround: detectGround(text),
      };
    });

  const negativeOnly = mapped.filter((review) => isLikelyNegativeReview(review));
  negativeOnly.sort((a, b) => a.stars - b.stars || b.score - a.score);

  return {
    allMappedCount: mapped.length,
    negativeReviews: negativeOnly,
  };
}

function getStoredCases() {
  const raw = localStorage.getItem("reputalex_cases");
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCase(casePayload) {
  const existing = getStoredCases();
  existing.unshift(casePayload);
  localStorage.setItem("reputalex_cases", JSON.stringify(existing));
}

function publishCustomerLink(token) {
  const customerLink = `./kundenbereich.html?token=${encodeURIComponent(token)}`;
  customerLinkEl.textContent = customerLink;
  customerLinkEl.href = customerLink;
  openCustomerLinkEl.href = customerLink;
  resultBox.classList.remove("hidden");
}

function toReviewFromScrape(item, idx) {
  const text = String(item?.text || "").trim();
  const stars = Number(item?.rating || 0);
  return {
    id: `scr_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
    author: String(item?.author || "Unbekannt"),
    stars: Number.isFinite(stars) ? stars : 0,
    date: String(item?.when || "ohne Zeitangabe"),
    text,
    score: computeScore(text, stars),
    suggestedGround: detectGround(text),
  };
}

adminForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(adminForm);
  const googleApiKey = String(formData.get("googleApiKey") || "").trim();
  const mapsUrl = String(formData.get("mapsUrl") || "").trim();
  const inputClientName = String(formData.get("clientName") || "").trim();

  if (!googleApiKey) {
    statusMessage.textContent = "Bitte einen Google Places API Key eingeben.";
    statusMessage.style.color = "#b91c1c";
    return;
  }

  if (!mapsUrl) {
    statusMessage.textContent = "Bitte eine Google-Maps-URL eingeben.";
    statusMessage.style.color = "#b91c1c";
    return;
  }

  let url;
  try {
    url = new URL(mapsUrl);
  } catch {
    statusMessage.textContent = "Die URL ist ungueltig.";
    statusMessage.style.color = "#b91c1c";
    return;
  }

  if (!/google\./i.test(url.hostname) || !/maps/i.test(mapsUrl)) {
    statusMessage.textContent =
      "Bitte eine gueltige Google-Maps-Unternehmensseite verwenden.";
    statusMessage.style.color = "#b91c1c";
    return;
  }

  statusMessage.textContent = "Analyse laeuft: Reale Bewertungen werden geladen...";
  statusMessage.style.color = "#4b5563";
  resultBox.classList.add("hidden");

  try {
    const placeDetails = await fetchGooglePlace(googleApiKey, mapsUrl);
    const reviewResult = mapReviewsFromGoogle(placeDetails);
    const foundReviews = reviewResult.negativeReviews;

    if (foundReviews.length === 0) {
      throw new Error(
        "Google hat fuer dieses Profil aktuell keine klar negativen Rezensionen im API-Ausschnitt geliefert.",
      );
    }

    const companyName =
      inputClientName ||
      placeDetails.displayName?.text ||
      parseCompanyName(mapsUrl) ||
      "Unbekanntes Unternehmen";
    const token = createToken();
    const casePayload = {
      token,
      createdAt: new Date().toISOString(),
      companyName,
      mapsUrl,
      pricePerReview: PRICE_PER_REVIEW_EUR,
      reviews: foundReviews,
      source: "google_places_api",
      apiReviewCountLoaded: reviewResult.allMappedCount,
      negativeReviewCountLoaded: foundReviews.length,
      placeAddress: placeDetails.formattedAddress || "",
      placeRating: placeDetails.rating || null,
      placeReviewCount: placeDetails.userRatingCount || null,
    };

    saveCase(casePayload);
    publishCustomerLink(token);
    statusMessage.textContent =
      `Analyse erfolgreich: ${foundReviews.length} negative Bewertungen gefunden (von ${reviewResult.allMappedCount} API-Rezensionen). Kundenlink wurde erstellt.`;
    statusMessage.style.color = "#166534";
  } catch (error) {
    statusMessage.textContent = `Analyse fehlgeschlagen: ${error.message}`;
    statusMessage.style.color = "#b91c1c";
  }
});

importForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  importStatusMessage.textContent = "Import wird verarbeitet...";
  importStatusMessage.style.color = "#4b5563";

  const companyName = String(
    document.getElementById("import-company-name")?.value || "",
  ).trim();
  const fileInput = document.getElementById("import-json-file");
  const textInput = document.getElementById("import-json-text");

  if (!companyName) {
    importStatusMessage.textContent = "Bitte einen Unternehmensnamen angeben.";
    importStatusMessage.style.color = "#b91c1c";
    return;
  }

  let rawJson = String(textInput?.value || "").trim();
  const file = fileInput?.files?.[0];

  if (!rawJson && file) {
    rawJson = await file.text();
  }

  if (!rawJson) {
    importStatusMessage.textContent =
      "Bitte JSON einfuegen oder eine JSON-Datei auswaehlen.";
    importStatusMessage.style.color = "#b91c1c";
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    importStatusMessage.textContent = "JSON ist ungueltig formatiert.";
    importStatusMessage.style.color = "#b91c1c";
    return;
  }

  const rawReviews = Array.isArray(parsed?.reviews) ? parsed.reviews : [];
  const cleanedReviews = rawReviews
    .map((entry, idx) => toReviewFromScrape(entry, idx))
    .filter((entry) => entry.text && entry.stars > 0 && isLikelyNegativeReview(entry));

  if (cleanedReviews.length === 0) {
    importStatusMessage.textContent =
      "Im JSON wurden keine verwertbaren negativen Bewertungen gefunden.";
    importStatusMessage.style.color = "#b91c1c";
    return;
  }

  const token = createToken();
  const casePayload = {
    token,
    createdAt: new Date().toISOString(),
    companyName,
    mapsUrl: String(parsed?.sourceUrl || ""),
    pricePerReview: PRICE_PER_REVIEW_EUR,
    reviews: cleanedReviews,
    source: "scraper_json_import",
    importedReviewCount: rawReviews.length,
    negativeReviewCountLoaded: cleanedReviews.length,
    scraperMode: String(parsed?.mode || "unknown"),
    scrapedAt: String(parsed?.scrapedAt || ""),
  };

  saveCase(casePayload);
  publishCustomerLink(token);
  importStatusMessage.textContent =
    `Import erfolgreich: ${cleanedReviews.length} negative Bewertungen uebernommen. Kundenlink erstellt.`;
  importStatusMessage.style.color = "#166534";
});
