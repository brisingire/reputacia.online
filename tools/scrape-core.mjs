import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout in step "${label}" after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function forceBulgarianMapsUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || "").trim());
    parsed.searchParams.set("hl", "bg");
    parsed.searchParams.set("gl", "bg");
    return parsed.toString();
  } catch {
    return String(rawUrl || "").trim();
  }
}

async function launchBrowserWithFallback({ headless, onProgress }) {
  const commonArgs = [
    "--lang=bg-BG",
    "--disable-features=Translate,TranslateUI",
  ];

  const launchAttempts = [
    {
      label: "chromium.launch",
      timeoutMs: 30000,
      launchOptions: { headless, args: commonArgs },
    },
  ];

  // macOS fallback: use installed Google Chrome channel if bundled Chromium hangs.
  if (process.platform === "darwin") {
    launchAttempts.push({
      label: "chromium.launch(channel=chrome)",
      timeoutMs: 45000,
      launchOptions: {
        headless,
        channel: "chrome",
        args: commonArgs,
      },
    });
  }

  let lastError = null;
  for (const attempt of launchAttempts) {
    try {
      onProgress?.(`Browser-Start: ${attempt.label} ...`);
      return await withTimeout(
        chromium.launch(attempt.launchOptions),
        attempt.timeoutMs,
        attempt.label,
      );
    } catch (error) {
      lastError = error;
      onProgress?.(`Browser-Start fehlgeschlagen: ${attempt.label}`);
    }
  }

  throw lastError || new Error("Browser launch failed");
}

async function handleGoogleConsent(page) {
  const textCandidates = [
    /alle ablehnen/i,
    /ablehnen/i,
    /reject all/i,
    /i agree/i,
    /alle akzeptieren/i,
    /accept all/i,
    /отхвърляне на всички/i,
    /приемане на всички/i,
  ];

  // Try main page first.
  for (const regex of textCandidates) {
    const byRole = page.getByRole("button", { name: regex }).first();
    if (await byRole.count()) {
      await byRole.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1200);
      return true;
    }
  }

  // Try generic button selectors if role-based lookup fails.
  const generic = page
    .locator('button, [role="button"]')
    .filter({
      hasText:
        /alle ablehnen|alle akzeptieren|reject all|accept all|i agree|отхвърляне на всички|приемане на всички/i,
    })
    .first();
  if (await generic.count()) {
    await generic.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(2000);
    return true;
  }

  // Some consent pages may be rendered in iframes.
  for (const frame of page.frames()) {
    for (const regex of textCandidates) {
      const inFrame = frame.getByRole("button", { name: regex }).first();
      if (await inFrame.count()) {
        await inFrame.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(2000);
        return true;
      }
    }
  }

  return false;
}

async function forceBulgarianUi(page) {
  // If Google redirects to a URL without explicit locale, force bg locale again.
  const current = page.url();
  try {
    const u = new URL(current);
    if (u.hostname.includes("google.") && !u.searchParams.get("hl")) {
      u.searchParams.set("hl", "bg");
      u.searchParams.set("gl", "bg");
      await page.goto(u.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
    }
  } catch {
    // ignore malformed URLs
  }
}

async function preferOriginalLanguage(page) {
  const originalButtons = [
    /original anzeigen/i,
    /show original/i,
    /показване на оригинала/i,
    /оригинал/i,
  ];

  for (const regex of originalButtons) {
    const buttons = page.getByRole("button", { name: regex });
    const count = await buttons.count().catch(() => 0);
    const max = Math.min(count, 40);
    for (let i = 0; i < max; i += 1) {
      await buttons.nth(i).click({ timeout: 1500 }).catch(() => {});
    }
  }
}

function parseStars(label = "") {
  const starMatch = label.match(/([0-5](?:[.,]\d)?)/);
  if (!starMatch) return null;
  return Number(starMatch[1].replace(",", "."));
}

async function openReviewsTab(page) {
  const reviewTab = page.getByRole("tab", { name: /rezension|review|отзив/i }).first();
  if (await reviewTab.count()) {
    await reviewTab.click({ timeout: 5000 }).catch(() => {});
    return;
  }

  const reviewButton = page
    .locator("button, a")
    .filter({ hasText: /rezension|review|отзив/i })
    .first();
  if (await reviewButton.count()) {
    await reviewButton.click({ timeout: 5000 }).catch(() => {});
  }
}

async function sortLowestRating(page) {
  const isLowestSelected = async () => {
    const sortText = await page
      .evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const candidate = buttons.find((btn) =>
          /relevanteste|neueste|höchste bewertung|niedrigste bewertung|most relevant|newest|highest rating|lowest rating|най-полезни|най-нови|най-висока оценка|най-ниска оценка/i.test(
            btn.textContent || "",
          ),
        );
        return (candidate?.textContent || "").trim();
      })
      .catch(() => "");
    return /niedrigste bewertung|lowest rating|най-ниска оценка/i.test(sortText);
  };

  let switched = await isLowestSelected();
  if (switched) {
    return true;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sortButtonCandidates = [
      page
        .getByRole("button", {
          name: /relevanteste|neueste|höchste bewertung|sort|most relevant|newest|highest rating|най-полезни|най-нови|най-висока оценка|сортиране/i,
        })
        .first(),
      page
        .locator("button")
        .filter({
          hasText:
            /relevanteste|neueste|höchste bewertung|sort|most relevant|newest|highest rating|най-полезни|най-нови|най-висока оценка|сортиране/i,
        })
        .first(),
    ];

    let opened = false;
    for (const button of sortButtonCandidates) {
      if (await button.count()) {
        await button.click({ timeout: 5000 }).catch(() => {});
        opened = true;
        break;
      }
    }
    if (!opened) {
      await page.waitForTimeout(700);
      continue;
    }

    await page.waitForTimeout(500);

    const lowestCandidates = [
      page.getByRole("menuitem", { name: /niedrigste bewertung|lowest rating|най-ниска оценка/i }).first(),
      page
        .locator('[role="option"], [role="menuitem"], div, span')
        .filter({ hasText: /niedrigste bewertung|lowest rating|най-ниска оценка/i })
        .first(),
    ];

    for (const option of lowestCandidates) {
      if (await option.count()) {
        await option.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(350);
        switched = await isLowestSelected();
        if (!switched) {
          // Fallback: hard DOM click on exact menu text
          switched = await page
            .evaluate(() => {
              const nodes = Array.from(
                document.querySelectorAll('[role="menuitem"], [role="option"], div, span'),
              );
              const target = nodes.find((node) =>
                /niedrigste bewertung|lowest rating|най-ниска оценка/i.test(
                  (node.textContent || "").trim(),
                ),
              );
              if (!target) return false;
              target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
              target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
              target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
              return true;
            })
            .catch(() => false);
          await page.waitForTimeout(450);
          switched = switched && (await isLowestSelected());
        }
        break;
      }
    }

    if (switched) {
      await page.waitForTimeout(1000);
      return true;
    }
  }

  return false;
}

async function maybeSortLowestRating(page) {
  try {
    return await sortLowestRating(page);
  } catch {
    return false;
  }
}

async function countLoadedReviewCards(page) {
  return page.evaluate(() => {
    return document.querySelectorAll(
      'div[data-review-id], div.jftiEf, div[aria-label*="Rezension"], div[aria-label*="review"], div[aria-label*="Отзив"], div[aria-label*="отзив"]',
    ).length;
  });
}

async function autoScrollReviews(page, rounds = 35) {
  let previousCount = await countLoadedReviewCards(page);
  let staleRounds = 0;

  await page.evaluate(() => {
    const feed =
      document.querySelector('div[role="feed"]') ||
      document.querySelector(".m6QErb.DxyBCb.kA9KIf.dS8AEf");
    if (feed instanceof HTMLElement) {
      feed.focus();
      feed.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    }
  });

  const MIN_ROUNDS_BEFORE_EARLY_STOP = 28;
  const STALE_ROUNDS_TO_STOP = 10;

  for (let i = 0; i < rounds; i += 1) {
    await page.evaluate((step) => {
      const feed =
        document.querySelector('div[role="feed"]') ||
        document.querySelector(".m6QErb.DxyBCb.kA9KIf.dS8AEf");
      if (feed) {
        const jump = 1600 + (step % 4) * 320;
        feed.scrollBy(0, jump);
        feed.dispatchEvent(new WheelEvent("wheel", { deltaY: jump, bubbles: true }));
      } else {
        window.scrollBy(0, 1200);
      }
    }, i);

    // Trigger additional lazy loading paths some Maps builds rely on.
    await page.keyboard.press("PageDown").catch(() => {});
    if (i % 6 === 0) {
      await page.keyboard.press("End").catch(() => {});
    }

    await page.waitForTimeout(1200);

    const currentCount = await countLoadedReviewCards(page);
    if (currentCount <= previousCount) {
      staleRounds += 1;
    } else {
      staleRounds = 0;
      previousCount = currentCount;
    }

    if (i >= MIN_ROUNDS_BEFORE_EARLY_STOP && staleRounds >= STALE_ROUNDS_TO_STOP) {
      break;
    }
  }
}

async function extractReviews(page) {
  return page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll(
        'div[data-review-id], div.jftiEf, div[aria-label*="Rezension"], div[aria-label*="review"], div[aria-label*="Отзив"], div[aria-label*="отзив"]',
      ),
    );

    return cards.map((card, idx) => {
      const author =
        card.querySelector(".d4r55")?.textContent?.trim() ||
        card.querySelector('[class*="author"]')?.textContent?.trim() ||
        "Unbekannt";

      const ratingLabel =
        card.querySelector('span[aria-label*="Stern"]')?.getAttribute("aria-label") ||
        card.querySelector('span[aria-label*="star"]')?.getAttribute("aria-label") ||
        card.querySelector('span[aria-label*="звезд"]')?.getAttribute("aria-label") ||
        "";

      const text =
        card.querySelector(".wiI7pd")?.textContent?.trim() ||
        card.querySelector('[class*="review-full-text"]')?.textContent?.trim() ||
        card.querySelector('[class*="MyEned"]')?.textContent?.trim() ||
        "";

      const when =
        card.querySelector(".rsqaWe")?.textContent?.trim() ||
        card.querySelector('[class*="publish"]')?.textContent?.trim() ||
        "";

      return {
        id: card.getAttribute("data-review-id") || `card_${idx}`,
        author,
        ratingLabel,
        text,
        when,
      };
    });
  });
}

export async function scrapeBadReviews({
  url,
  maxRating = 2,
  limit = 50,
  headless = false,
  outFile,
  trySortLowest = false,
  onProgress = null,
  preferredLocale = "bg-BG",
}) {
  let browser;
  let context;
  let page;

  try {
    const normalizedUrl = forceBulgarianMapsUrl(url);
    onProgress?.("Browser wird gestartet ...");
    browser = await launchBrowserWithFallback({ headless, onProgress });
    context = await withTimeout(
      browser.newContext({
        locale: preferredLocale,
        timezoneId: "Europe/Sofia",
        viewport: { width: 1440, height: 1000 },
        extraHTTPHeaders: {
          "Accept-Language": preferredLocale,
        },
      }),
      15000,
      "browser.newContext",
    );
    page = await withTimeout(context.newPage(), 10000, "context.newPage");

    onProgress?.("Google Maps Seite wird geladen (Sprache: Bulgarisch) ...");
    await withTimeout(
      page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 60000 }),
      70000,
      "page.goto",
    );
    await withTimeout(forceBulgarianUi(page), 15000, "forceBulgarianUi");
    await page.waitForTimeout(2000);
    await handleGoogleConsent(page);
    await withTimeout(forceBulgarianUi(page), 15000, "forceBulgarianUi.postConsent");
    await page.waitForTimeout(800);

    onProgress?.("Rezensions-Tab wird geoeffnet ...");
    await withTimeout(openReviewsTab(page), 15000, "openReviewsTab");
    await page.waitForTimeout(1800);
    const didSortLowest = trySortLowest ? await maybeSortLowestRating(page) : false;
    await page.waitForTimeout(1500);
    onProgress?.("Bewertungen werden geladen und gescrollt ...");
    await withTimeout(autoScrollReviews(page, 180), 240000, "autoScrollReviews");
    onProgress?.("Originalsprache wird bevorzugt ...");
    await withTimeout(preferOriginalLanguage(page), 30000, "preferOriginalLanguage");

    onProgress?.("Bewertungen werden extrahiert ...");
    const raw = await withTimeout(extractReviews(page), 30000, "extractReviews");
    const normalized = raw
      .map((item) => {
        const rating = parseStars(item.ratingLabel);
        return {
          author: item.author,
          rating,
          when: item.when,
          text: item.text || "",
        };
      })
      .filter((item) => item.text)
      .filter((item) => item.rating !== null && item.rating <= maxRating);

    const deduped = [];
    const seen = new Set();
    for (const review of normalized) {
      const key = `${review.author}|${review.rating}|${review.text}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(review);
      }
      if (deduped.length >= limit) break;
    }

    const payload = {
      sourceUrl: normalizedUrl,
      scrapedAt: new Date().toISOString(),
      maxRating,
      mode: "scan-all-reviews",
      totalLoadedCards: raw.length,
      sortAttemptedLowest: didSortLowest,
      count: deduped.length,
      reviews: deduped,
    };

    if (outFile) {
      const outPath = path.resolve(process.cwd(), outFile);
      await fs.writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
      payload.savedTo = outPath;
    }

    onProgress?.("Scrape abgeschlossen.");
    return payload;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
