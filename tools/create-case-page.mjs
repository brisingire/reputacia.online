import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { scrapeBadReviews } from "./scrape-core.mjs";

const DEFAULT_FORM_ACTION = "https://formspree.io/f/meevnwql";
/** Live site origin for generated links (override with --base-url or PUBLIC_SITE_URL). */
export const DEFAULT_PUBLIC_BASE = "https://reputacia.online";
export const CASE_TEMPLATE_VERSION = "2026-04-26-bg-v2";

function envPublicBase() {
  const raw = String(process.env.PUBLIC_SITE_URL || "").trim();
  return raw ? raw.replace(/\/$/, "") : "";
}

export function resolvePublicBaseUrl(baseUrl = "") {
  const trimmed = String(baseUrl || "").trim();
  if (trimmed) {
    return trimmed.replace(/\/$/, "");
  }
  const fromEnv = envPublicBase();
  if (fromEnv) {
    return fromEnv;
  }
  return DEFAULT_PUBLIC_BASE.replace(/\/$/, "");
}

function resolveThanksRedirectUrl(baseUrl = "") {
  const base = resolvePublicBaseUrl(baseUrl);
  return `${base}/thanks.html`;
}

function getArg(name, fallback = "") {
  const key = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(key));
  return hit ? hit.slice(key.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function randomSuffix(len = 8) {
  // Hex token keeps URLs simple and hard to guess.
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

async function loadReviewsFromJson(jsonPath, maxRating, limit) {
  const raw = await fs.readFile(path.resolve(process.cwd(), jsonPath), "utf8");
  const parsed = JSON.parse(raw);
  const sourceReviews = Array.isArray(parsed.reviews) ? parsed.reviews : [];
  const cleaned = sourceReviews
    .map((entry) => ({
      author: String(entry.author || "Неизвестен"),
      rating: Number(entry.rating || 0),
      when: String(entry.when || ""),
      text: String(entry.text || "").trim(),
    }))
    .filter((entry) => entry.text && entry.rating > 0 && entry.rating <= maxRating)
    .slice(0, limit);

  return {
    payload: {
      sourceUrl: parsed.sourceUrl || "",
      scrapedAt: parsed.scrapedAt || new Date().toISOString(),
      maxRating,
      mode: parsed.mode || "json-import",
      totalLoadedCards: parsed.totalLoadedCards || sourceReviews.length,
      count: cleaned.length,
      reviews: cleaned,
    },
    source: "json-import",
  };
}

function renderCasePage({
  company,
  slug,
  sourceUrl,
  formAction,
  thanksRedirectUrl,
  canonicalCasePageUrl,
  maxRating,
  reviews,
  scrapedAt,
}) {
  const reviewsMarkup = reviews
    .map((review, idx) => {
      const author = escapeHtml(review.author || "Неизвестен");
      const text = escapeHtml(review.text || "");
      const when = escapeHtml(review.when || "");
      const rating = Number(review.rating || 0);
      const summary = `${idx + 1} | ${rating} звезди | ${author} | ${when}`.trim();
      return `
      <article class="review-card">
        <div class="review-card-top">
          <label class="review-head">
            <input type="checkbox" name="selectedReviews[]" value="${escapeHtml(summary)}" class="review-checkbox" checked data-summary="${escapeHtml(
              summary,
            )}" />
            <span>Избери</span>
          </label>
          <p class="review-meta"><strong>${rating} звезди</strong>${when ? ` • ${when}` : ""} • ${author}</p>
        </div>
        <p class="review-text">${text}</p>
      </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="bg">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(company)} | Подготовка на искания за премахване</title>
    <meta name="x-case-template-version" content="${CASE_TEMPLATE_VERSION}" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <meta name="googlebot" content="noindex, nofollow, noarchive" />
    <style>
      body { margin:0; font-family: Inter, system-ui, sans-serif; background: radial-gradient(circle at top left, #eef4ff 0%, #f5f7fb 42%, #f4f6fb 100%); color:#0f172a; line-height:1.5; }
      .container { width:min(1120px,94%); margin:0 auto; }
      .top { padding:28px 0 16px; }
      h1 { margin:0 0 8px; font-size:clamp(1.65rem,3vw,2.25rem); letter-spacing:-.02em; }
      .muted { color:#475569; }
      .panel { background:linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,251,255,.97)); border:1px solid #d7e0f2; border-radius:18px; padding:18px; box-shadow:0 22px 48px rgba(15,23,42,.09); margin-bottom:16px; }
      .panel h2 { margin:0 0 12px; font-size:clamp(1.2rem,2vw,1.6rem); letter-spacing:-.01em; }
      .grid { display:grid; gap:16px; grid-template-columns:1.15fr .95fr; align-items:start; }
      .reviews-list { display:grid; gap:0; }
      .review-card { border:1px solid #dbe5f7; border-radius:12px; padding:12px; margin-bottom:10px; background:#fcfdff; box-shadow:0 4px 16px rgba(15,23,42,.05); transition:border-color .2s ease, box-shadow .2s ease, transform .2s ease; }
      .review-card:hover { border-color:#bfd0ee; box-shadow:0 8px 24px rgba(15,23,42,.08); transform:translateY(-1px); }
      .review-card-top { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:8px; }
      .review-head { display:flex; align-items:center; gap:8px; font-weight:600; margin:0; white-space:nowrap; }
      .review-meta { margin:0; color:#334155; font-size:.92rem; text-align:right; }
      .review-text { margin:0; white-space:pre-wrap; }
      input, textarea { width:100%; box-sizing:border-box; border:1px solid #c4d0ea; border-radius:10px; padding:10px 12px; min-height:44px; font:inherit; }
      label.field { display:grid; gap:6px; font-weight:600; margin-bottom:10px; }
      .checkbox { display:flex; gap:10px; align-items:flex-start; margin:10px 0; font-size:.95rem; color:#334155; }
      .checkbox input { width:auto; min-height:auto; margin-top:3px; }
      .bulk-actions { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; padding:10px 12px; border:1px solid #cfdcf3; border-radius:12px; background:linear-gradient(180deg, #f8fbff, #f2f7ff); }
      .reasons-wrap { margin:10px 0 14px; padding:10px 12px; border:1px solid #d8e0ef; border-radius:12px; background:#f8fbff; }
      .reasons-wrap h3 { margin:0 0 8px; font-size:1rem; }
      .reasons-wrap .reasons-note {
        margin: 0 0 10px;
        font-size: .9rem;
        color: #475569;
      }
      .reasons-grid { display:grid; gap:8px; }
      .reasons-grid .checkbox { margin:0; }
      .notice-strong {
        margin: 10px 0 14px;
        padding: 12px 14px;
        border: 1px solid #f3d38a;
        border-radius: 12px;
        background: linear-gradient(180deg, #fff8e8, #fff3d6);
      }
      .notice-strong h3 {
        margin: 0 0 8px;
        color: #7a4b00;
        font-size: 1.02rem;
      }
      .notice-strong p {
        margin: 0 0 6px;
        color: #5c3b04;
        font-size: .95rem;
      }
      .notice-strong p:last-child { margin-bottom: 0; }
      .cost-grid {
        display: grid;
        gap: 8px;
      }
      .cost-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: .96rem;
      }
      .cost-row strong { color: #0f172a; }
      .cost-row.total {
        margin-top: 4px;
        padding-top: 8px;
        border-top: 1px solid #d7e0ef;
        font-size: 1.03rem;
      }
      .cost-formula {
        margin: 6px 0 0;
        font-size: .9rem;
        color: #475569;
      }
      .reviews-pager {
        display:flex;
        flex-wrap:wrap;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-top:6px;
        padding:10px 12px;
        border:1px solid #b8c8e8;
        border-radius:12px;
        background:linear-gradient(180deg, #eef4ff, #e6efff);
      }
      .pager-actions { display:flex; align-items:center; gap:8px; }
      .pager-btn {
        border:1px solid #c8d6f1;
        background:#fff;
        color:#0f172a;
        border-radius:8px;
        min-height:34px;
        min-width:90px;
        padding:0 10px;
        font-weight:600;
        cursor:pointer;
        box-shadow:none;
      }
      .pager-btn:disabled {
        opacity:.5;
        cursor:not-allowed;
      }
      .pager-meta {
        margin:0;
        font-size:.96rem;
        color:#1e293b;
        font-weight:700;
      }
      .address-row { display:grid; grid-template-columns:2fr 1fr; gap:8px; }
      .address-row-second { display:grid; grid-template-columns:1fr 2fr; gap:8px; }
      button { width:100%; border:0; border-radius:12px; min-height:46px; font-weight:700; background:#0f3aa9; color:#fff; cursor:pointer; box-shadow:0 10px 20px rgba(15,58,169,.18); }
      .small { font-size:.9rem; color:#64748b; }
      .status { min-height:20px; margin-top:8px; }
      @media (max-width:1024px){
        .grid{ grid-template-columns:1fr; }
        .panel { padding:16px; }
        .top { padding:20px 0 12px; }
        h1 { font-size:clamp(1.4rem,6vw,1.95rem); }
        .review-card-top { flex-direction:column; align-items:flex-start; }
        .review-meta { text-align:left; }
      }
      @media (max-width:640px){
        .container { width:min(1120px,96%); }
        .panel { padding:14px; border-radius:14px; }
        .bulk-actions { padding:8px 10px; }
        .review-card { padding:10px; border-radius:10px; }
        .reasons-wrap { padding:9px 10px; }
        .address-row, .address-row-second { grid-template-columns:1fr; }
      }
    </style>
  </head>
  <body>
    <!-- case-template-version: ${CASE_TEMPLATE_VERSION} -->
    <div class="container top">
      <h1>Искания за премахване за ${escapeHtml(company)}</h1>
      <p class="muted">Автоматично подготвен списък с потенциално оспорими отзиви (към: ${escapeHtml(
        new Date(scrapedAt).toLocaleString("bg-BG"),
      )}).</p>
      <p class="small">Казус ID: ${escapeHtml(slug)}${sourceUrl ? ` • Източник: <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">Google Maps профил</a>` : ""} • Филтър: до ${maxRating} звезди</p>
    </div>

    <div class="container grid">
      <section class="panel">
        <h2>Открити негативни отзиви</h2>
        <div class="bulk-actions">
          <label class="review-head">
            <input type="checkbox" id="select-all-reviews" />
            <span>Маркирай всички отзиви</span>
          </label>
          <span class="small">${reviews.length} отзива намерени</span>
        </div>
        <div class="reviews-list" id="reviews-list">
          ${reviewsMarkup || "<p>Не са открити подходящи отзиви.</p>"}
        </div>
        <div class="reviews-pager" id="reviews-pager" style="${reviews.length > 5 ? "" : "display:none;"}">
          <p class="pager-meta" id="pager-meta">Страница 1 от 1</p>
          <div class="pager-actions">
            <button type="button" class="pager-btn" id="pager-prev">Назад</button>
            <button type="button" class="pager-btn" id="pager-next">Напред</button>
          </div>
        </div>
      </section>

      <aside class="panel">
        <h2>Подаване на обвързваща поръчка</h2>
        <form action="${escapeHtml(formAction)}" method="POST">
          <input type="hidden" name="_next" value="${escapeHtml(thanksRedirectUrl)}" />
          <input type="hidden" name="_subject" value="Нова поръчка ${escapeHtml(company)} (${escapeHtml(
            slug,
          )})" />
          <input type="hidden" name="caseSlug" value="${escapeHtml(slug)}" />
          <input type="hidden" name="companyRef" value="${escapeHtml(company)}" />
          <input type="hidden" name="casePageUrl" id="case-page-url" value="${escapeHtml(canonicalCasePageUrl)}" />
          <input type="hidden" name="sourceMapsUrl" value="${escapeHtml(sourceUrl || "")}" />
          <input type="hidden" name="selectedReviewDetails" id="selected-review-details" />

          <label class="field">1) Име на законния представител
            <input type="text" name="ownerName" required placeholder="Име и фамилия" />
          </label>
          <label class="field">2) Компания (по регистрация)
            <input type="text" name="companyName" required value="${escapeHtml(company)}" placeholder="Официално име на фирмата" />
          </label>
          <p class="small" style="margin-top:-4px;margin-bottom:8px;">3) Въведете адрес за фактура и кореспонденция:</p>
          <div class="address-row">
            <label class="field">Улица
              <input type="text" name="street" required placeholder="z. B. Vitosha Blvd." />
            </label>
            <label class="field">Номер
              <input type="text" name="houseNumber" required placeholder="z. B. 12A" />
            </label>
          </div>
          <div class="address-row-second">
            <label class="field">Пощенски код
              <input type="text" name="postalCode" required placeholder="z. B. 1000" />
            </label>
            <label class="field">Град
              <input type="text" name="city" required placeholder="z. B. Sofia" />
            </label>
          </div>
          <label class="field">4) Имейл за обратна връзка и статус
            <input type="email" name="email" required placeholder="name@firma.bg" />
          </label>
          <div class="reasons-wrap">
            <h3>5) Основание за искането (важи за всички маркирани отзиви)</h3>
            <p class="reasons-note">За всеки маркиран отзив правим индивидуален анализ и избираме основанието с най-добър шанс за успех.</p>
            <div class="reasons-grid">
              <label class="checkbox">
                <input type="checkbox" name="reasons[]" value="Unwahre Tatsachenbehauptung" checked />
                <span>Невярно фактическо твърдение</span>
              </label>
              <label class="checkbox">
                <input type="checkbox" name="reasons[]" value="Kein Kundenkontakt" checked />
                <span>Лицето не е открито в клиентската база</span>
              </label>
              <label class="checkbox">
                <input type="checkbox" name="reasons[]" value="Обида / клевета" checked />
                <span>Обида / клевета</span>
              </label>
              <label class="checkbox">
                <input type="checkbox" name="reasons[]" value="Spam / Fake" checked />
                <span>Спам / фалшив отзив</span>
              </label>
              <label class="checkbox">
                <input type="checkbox" name="reasons[]" value="Datenschutz / persoenliche Daten" checked />
                <span>Нарушение на лични данни</span>
              </label>
            </div>
          </div>
          <div class="reasons-wrap">
            <h3>Ценово обобщение</h3>
            <div class="cost-grid">
              <div class="cost-row">
                <span>Цена за успешно премахнат отзив</span>
                <strong><span id="price-per-item">19</span> EUR</strong>
              </div>
              <div class="cost-row">
                <span>Избрани отзиви</span>
                <strong><span id="selected-count">0</span></strong>
              </div>
              <div class="cost-row total">
                <span>Обща сума (текущ избор)</span>
                <strong><span id="total-price">0</span> EUR</strong>
              </div>
            </div>
            <p class="cost-formula">Изчисление: <span id="cost-formula">19 EUR x 0 = 0 EUR</span></p>
          </div>
          <div class="notice-strong">
            <h3>Важно относно цена и фактуриране</h3>
            <p><strong>Таксата се начислява само за реално успешно премахнатите отзиви.</strong></p>
            <p>Фактурата се издава и изпраща след успешно приключване на услугата на посочения от Вас фирмен адрес.</p>
            <p>Срокът за плащане е <strong>14 дни</strong> от датата на фактурата.</p>
          </div>
          <label class="field">Бележки / доказателства (по желание)
            <textarea name="note" rows="4"></textarea>
          </label>
          <label class="checkbox">
            <input type="checkbox" name="consentAuthority" required />
            <span>Потвърждавам, че съм законно упълномощен да представлявам компанията. Наясно съм, че неверни данни могат да имат правни последици.</span>
          </label>
          <label class="checkbox">
            <input type="checkbox" name="consentCosts" required />
            <span>Възлагам маркираните искания за премахване. Таксата се дължи само при успешно премахване. Запознат съм с текущата сума от <strong><span id="confirm-total-price">0</span> EUR</strong>.</span>
          </label>
          <button type="submit">Подаване на обвързваща поръчка</button>
          <p class="small">След подаване на поръчката ще получите потвърждение по имейл.</p>
        </form>
        <p class="status"></p>
      </aside>
    </div>
    <script>
      const selectAll = document.getElementById("select-all-reviews");
      const reviewChecks = Array.from(document.querySelectorAll(".review-checkbox"));
      const pricePerItemEl = document.getElementById("price-per-item");
      const selectedCountEl = document.getElementById("selected-count");
      const totalPriceEl = document.getElementById("total-price");
      const confirmTotalPriceEl = document.getElementById("confirm-total-price");
      const costFormulaEl = document.getElementById("cost-formula");
      const selectedReviewDetailsEl = document.getElementById("selected-review-details");
      const casePageUrlEl = document.getElementById("case-page-url");
      const pager = document.getElementById("reviews-pager");
      const pagerMeta = document.getElementById("pager-meta");
      const pagerPrev = document.getElementById("pager-prev");
      const pagerNext = document.getElementById("pager-next");
      const storageKey = "case-selection:${escapeHtml(slug)}";
      const pricePerItem = Number(pricePerItemEl ? pricePerItemEl.textContent : "19") || 19;
      const REVIEWS_PER_PAGE = 5;
      let currentPage = 1;
      const totalPages = Math.max(1, Math.ceil(reviewChecks.length / REVIEWS_PER_PAGE));

      const renderPage = (pageNum) => {
        currentPage = Math.min(Math.max(1, pageNum), totalPages);
        const startIdx = (currentPage - 1) * REVIEWS_PER_PAGE + 1;
        const endIdx = Math.min(currentPage * REVIEWS_PER_PAGE, reviewChecks.length);
        reviewChecks.forEach((item, idx) => {
          const card = item.closest(".review-card");
          if (!card) return;
          const cardPage = Math.floor(idx / REVIEWS_PER_PAGE) + 1;
          card.style.display = cardPage === currentPage ? "" : "none";
        });
        if (pagerMeta) pagerMeta.textContent = "Страница " + currentPage + " от " + totalPages + "  |  Записи " + startIdx + "-" + endIdx + " от " + reviewChecks.length;
        if (pagerPrev) pagerPrev.disabled = currentPage <= 1;
        if (pagerNext) pagerNext.disabled = currentPage >= totalPages;
      };

      const updateTotals = () => {
        const count = reviewChecks.filter((item) => item.checked).length;
        const total = count * pricePerItem;
        if (selectedCountEl) selectedCountEl.textContent = String(count);
        if (totalPriceEl) totalPriceEl.textContent = String(total);
        if (confirmTotalPriceEl) confirmTotalPriceEl.textContent = String(total);
        if (costFormulaEl) costFormulaEl.textContent = pricePerItem + " EUR x " + count + " = " + total + " EUR";
      };

      const updateSelectedDetails = () => {
        if (!selectedReviewDetailsEl) return;
        const selected = reviewChecks
          .filter((item) => item.checked)
          .map((item) => item.getAttribute("data-summary") || item.value || "");
        selectedReviewDetailsEl.value = selected.join("\\n");
      };

      const persistSelection = () => {
        const selected = reviewChecks
          .map((item, idx) => ({ idx, checked: item.checked }))
          .filter((item) => item.checked)
          .map((item) => item.idx);
        localStorage.setItem(storageKey, JSON.stringify(selected));
      };

      const restoreSelection = () => {
        try {
          const raw = localStorage.getItem(storageKey);
          if (!raw) {
            reviewChecks.forEach((item) => {
              item.checked = true;
            });
            return;
          }
          const selectedIdx = JSON.parse(raw);
          if (!Array.isArray(selectedIdx)) return;
          reviewChecks.forEach((item, idx) => {
            item.checked = selectedIdx.includes(idx);
          });
        } catch {}
      };

      if (casePageUrlEl && !String(casePageUrlEl.value || "").trim()) {
        casePageUrlEl.value = window.location.href;
      }

      if (selectAll) {
        selectAll.addEventListener("change", () => {
          for (const checkbox of reviewChecks) {
            checkbox.checked = selectAll.checked;
          }
          updateTotals();
          updateSelectedDetails();
          persistSelection();
        });
      }
      for (const checkbox of reviewChecks) {
        checkbox.addEventListener("change", () => {
          if (!selectAll) return;
          const allSelected = reviewChecks.length > 0 && reviewChecks.every((item) => item.checked);
          selectAll.checked = allSelected;
          updateTotals();
          updateSelectedDetails();
          persistSelection();
        });
      }
      if (pagerPrev) {
        pagerPrev.addEventListener("click", () => {
          renderPage(currentPage - 1);
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }
      if (pagerNext) {
        pagerNext.addEventListener("click", () => {
          renderPage(currentPage + 1);
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }
      restoreSelection();
      const allSelected = reviewChecks.length > 0 && reviewChecks.every((item) => item.checked);
      if (selectAll) selectAll.checked = allSelected;
      updateSelectedDetails();
      updateTotals();
      if (pager) {
        if (totalPages <= 1) {
          pager.style.display = "none";
        } else {
          pager.style.display = "flex";
          renderPage(1);
        }
      } else {
        renderPage(1);
      }
    </script>
  </body>
</html>`;
}

async function upsertCasesRegistry(entry) {
  const file = path.resolve(process.cwd(), "cases", "index.json");
  await fs.mkdir(path.dirname(file), { recursive: true });
  let list = [];
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    list = Array.isArray(parsed) ? parsed : [];
  } catch {
    list = [];
  }
  const filtered = list.filter((item) => item.slug !== entry.slug);
  filtered.unshift(entry);
  await fs.writeFile(file, JSON.stringify(filtered, null, 2), "utf8");
}

async function readCasesRegistry() {
  const file = path.resolve(process.cwd(), "cases", "index.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeSourceUrl(value) {
  try {
    const u = new URL(String(value || "").trim());
    u.hash = "";
    // Keep query because Maps IDs can be encoded there, but normalize trailing slash.
    return u.toString().replace(/\/$/, "");
  } catch {
    return String(value || "").trim().replace(/\/$/, "");
  }
}

async function findExistingSlugBySourceUrl(sourceUrl) {
  const normalized = normalizeSourceUrl(sourceUrl);
  if (!normalized) return "";
  const registry = await readCasesRegistry();
  const hit = registry.find(
    (entry) => normalizeSourceUrl(entry?.sourceUrl || "") === normalized,
  );
  return hit?.slug ? String(hit.slug) : "";
}

export async function createCasePageFromPayload({
  scrapePayload,
  company,
  slug,
  baseUrl = "",
  formAction = DEFAULT_FORM_ACTION,
  maxRating = 2,
  outputRoot = process.cwd(),
  pathPrefix = "cases",
  source = "live-scrape",
}) {
  const safeCompany = String(company || "").trim();
  if (!safeCompany) {
    throw new Error("Missing company name for case page creation.");
  }
  const existingSlug = !slug
    ? await findExistingSlugBySourceUrl(scrapePayload?.sourceUrl || "")
    : "";
  const baseSlug = (slugify(safeCompany) || "unternehmen").slice(0, 68).replace(/-+$/g, "");
  const safeSlug = slug
    ? slugify(slug)
    : existingSlug || `${baseSlug}-${randomSuffix(8)}`;
  if (!safeSlug) {
    throw new Error("Could not derive slug for case page.");
  }

  const prefix = String(pathPrefix || "").replace(/^\/+|\/+$/g, "");
  const relativeDir = prefix ? path.join(prefix, safeSlug) : safeSlug;
  const caseDir = path.resolve(outputRoot, relativeDir);
  await fs.mkdir(caseDir, { recursive: true });

  const caseReviews = Array.isArray(scrapePayload?.reviews) ? scrapePayload.reviews : [];
  const publicPath = `/${relativeDir.replaceAll("\\", "/")}/`;
  const publicBase = resolvePublicBaseUrl(baseUrl);
  const publicUrl = `${publicBase}${publicPath}`;
  const thanksRedirectUrl = resolveThanksRedirectUrl(baseUrl);
  const pageHtml = renderCasePage({
    company: safeCompany,
    slug: safeSlug,
    sourceUrl: scrapePayload?.sourceUrl || "",
    formAction,
    thanksRedirectUrl,
    canonicalCasePageUrl: publicUrl,
    maxRating,
    reviews: caseReviews,
    scrapedAt: scrapePayload?.scrapedAt || new Date().toISOString(),
  });

  await fs.writeFile(path.join(caseDir, "index.html"), pageHtml, "utf8");
  await fs.writeFile(path.join(caseDir, "reviews.json"), JSON.stringify(scrapePayload, null, 2), "utf8");

  const registryEntry = {
    slug: safeSlug,
    company: safeCompany,
    createdAt: new Date().toISOString(),
    source,
    reviewsCount: caseReviews.length,
    localPath: path.join(relativeDir, "index.html"),
    sourceUrl: scrapePayload?.sourceUrl || "",
  };
  await upsertCasesRegistry(registryEntry);

  return {
    slug: safeSlug,
    reviewsCount: caseReviews.length,
    localPagePath: path.join(relativeDir, "index.html"),
    localReviewsPath: path.join(relativeDir, "reviews.json"),
    publicPath,
    publicUrl,
  };
}

async function run() {
  const url = getArg("url");
  const companyArg = getArg("company");
  const slugArg = getArg("slug");
  const fromJson = getArg("from-json");
  const baseUrl = getArg("base-url", DEFAULT_PUBLIC_BASE);
  const formAction = getArg("form-action", DEFAULT_FORM_ACTION);
  const maxRating = toNumber(getArg("max-rating", "2"), 2);
  const limit = toNumber(getArg("limit", "80"), 80);
  const trySortLowest = hasFlag("try-sort-lowest");

  if (!fromJson && !url) {
    console.error("Missing input. Use either --url=... or --from-json=...");
    process.exit(1);
  }
  if (!companyArg) {
    console.error("Missing --company argument.");
    process.exit(1);
  }

  const company = companyArg.trim();
  const slug = slugArg ? slugify(slugArg) : slugify(company);
  if (!slug) {
    console.error("Could not derive a valid slug.");
    process.exit(1);
  }

  let scrapePayload;
  let source;

  if (fromJson) {
    const loaded = await loadReviewsFromJson(fromJson, maxRating, limit);
    scrapePayload = loaded.payload;
    source = loaded.source;
  } else {
    scrapePayload = await scrapeBadReviews({
      url,
      maxRating,
      limit,
      trySortLowest,
      headless: false,
      outFile: path.join("cases", slug, "scrape-output.json"),
    });
    source = "live-scrape";
  }

  const created = await createCasePageFromPayload({
    scrapePayload: { ...scrapePayload, sourceUrl: scrapePayload.sourceUrl || url || "" },
    company,
    slug,
    baseUrl,
    formAction,
    maxRating,
    source,
    outputRoot: process.cwd(),
    pathPrefix: "",
  });

  console.log("Case page created successfully.");
  console.log(`- Local page: ${created.localPagePath}`);
  console.log(`- Reviews JSON: ${created.localReviewsPath}`);
  console.log(`- Public URL: ${created.publicUrl}`);
  console.log(
    "  Tip: override with --base-url=https://other.example (or env PUBLIC_SITE_URL).",
  );
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectExecution) {
  run().catch((error) => {
    console.error("case:create failed:", error.message);
    process.exit(1);
  });
}
