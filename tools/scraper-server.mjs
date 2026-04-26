import express from "express";
import { scrapeBadReviews } from "./scrape-core.mjs";

const app = express();
const PORT = Number(process.env.SCRAPER_PORT || 4180);
const jobs = new Map();

app.use(express.json());
app.use((req, _res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] ${req.method} ${req.url}`);
  next();
});

function inferCompanyFromMapsUrl(url) {
  try {
    const parsed = new URL(url);
    const placeMatch = parsed.pathname.match(/\/place\/([^/]+)/i);
    if (placeMatch && placeMatch[1]) {
      return decodeURIComponent(placeMatch[1]).replace(/\+/g, " ").trim();
    }
  } catch {
    return "";
  }
  return "";
}

async function loadCasePageModuleFresh() {
  // Load fresh module each run to avoid stale template cache.
  return import(`./create-case-page.mjs?ts=${Date.now()}`);
}

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toErrorPayload(error) {
  const message = String(error?.message || "Unbekannter Fehler");
  const stack = String(error?.stack || "");
  return { message, stack };
}

async function runScrapeJob(jobId, payload) {
  const job = jobs.get(jobId);
  if (!job) return;

  const pushLog = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    job.logs.push(line);
    if (job.logs.length > 200) {
      job.logs.shift();
    }
  };

  try {
    const {
      url,
      maxRating,
      limit,
      outFile,
      trySortLowest,
      headless,
      companyInput,
      baseUrl,
    } = payload;

    pushLog("Scrape gestartet.");
    pushLog(`URL: ${url}`);
    pushLog(`Modus: ${headless ? "headless" : "mit Browserfenster"}`);

    const scrapeArgs = {
      url,
      maxRating,
      limit,
      outFile,
      headless,
      trySortLowest,
      preferredLocale: payload.preferredLocale || "bg-BG",
      onProgress: (message) => pushLog(message),
    };

    let result;
    try {
      result = await scrapeBadReviews(scrapeArgs);
    } catch (error) {
      const shouldRetryHeadless =
        !headless &&
        /chromium\.launch|browser/i.test(String(error?.message || ""));

      if (!shouldRetryHeadless) {
        throw error;
      }

      pushLog("Browserfenster-Start fehlgeschlagen, fallback auf headless.");
      result = await scrapeBadReviews({
        ...scrapeArgs,
        headless: true,
        onProgress: (message) => pushLog(`retry-headless: ${message}`),
      });
      result.launchMode = "headless-fallback";
    }

    pushLog(`Scrape fertig. Gefundene negative Reviews: ${result.count}`);

    const company = companyInput || inferCompanyFromMapsUrl(url) || "unternehmen";
    const casePageModule = await loadCasePageModuleFresh();
    const createdPage = await casePageModule.createCasePageFromPayload({
      scrapePayload: result,
      company,
      slug: "",
      baseUrl,
      outputRoot: process.cwd(),
      pathPrefix: "",
      source: "live-scrape-gui",
      maxRating,
    });

    const responsePayload = {
      ...result,
      templateVersion: casePageModule.CASE_TEMPLATE_VERSION || "unknown",
      createdPage,
      customerPageUrl:
        createdPage.publicUrl || `http://localhost:5501${createdPage.publicPath}`,
    };

    job.status = "done";
    job.result = responsePayload;
    job.finishedAt = new Date().toISOString();
    pushLog(`Unternehmensseite erstellt: ${responsePayload.customerPageUrl}`);
  } catch (error) {
    job.status = "failed";
    job.error = toErrorPayload(error);
    job.finishedAt = new Date().toISOString();
    pushLog(`Fehler: ${job.error.message}`);
    if (job.error.stack) {
      pushLog(job.error.stack.split("\n")[0]);
    }
  }
}

app.get("/", (_req, res) => {
  res.send(`<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Google Bad Reviews Scraper GUI</title>
    <style>
      body { font-family: Inter, system-ui, sans-serif; margin: 0; background: #f6f8fc; color: #0f172a; }
      .wrap { max-width: 860px; margin: 40px auto; background: white; border: 1px solid #d8e0ef; border-radius: 14px; padding: 20px; }
      h1 { margin: 0 0 12px; font-size: 1.7rem; }
      p { color: #475569; }
      label { display: grid; gap: 6px; margin-top: 12px; font-weight: 600; }
      input { width: 100%; box-sizing: border-box; border: 1px solid #c4d0ea; border-radius: 10px; padding: 10px 12px; font: inherit; }
      .row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
      button { margin-top: 14px; background: #0f3aa9; color: white; border: 0; border-radius: 10px; padding: 11px 14px; font-weight: 700; cursor: pointer; }
      button:disabled { opacity: .55; cursor: wait; }
      pre { background: #0f172a; color: #e2e8f0; border-radius: 10px; padding: 12px; overflow: auto; max-height: 420px; }
      .status { min-height: 22px; margin-top: 10px; color: #334155; font-size: 0.95rem; }
      .result-link { margin-top: 10px; padding: 10px 12px; border: 1px solid #d8e0ef; border-radius: 10px; background: #f8fbff; }
      .result-link a { color: #0f3aa9; font-weight: 700; text-decoration: none; }
      .result-link .path { margin-top: 6px; color: #475569; font-size: .92rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      @media (max-width: 700px) { .row { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Google Bad Reviews Scraper</h1>
      <p>Link einfuegen, Start klicken und schlechte Bewertungen als JSON bekommen (Originalsprache wird bevorzugt).</p>
      <label>
        Google Maps URL
        <input id="url" type="url" placeholder="https://www.google.com/maps/place/..." />
      </label>
      <label>
        Unternehmensname (optional)
        <input id="company" type="text" placeholder="z. B. Istanbul Kebab Shop" />
      </label>
      <div class="row">
        <label>Max Sterne
          <input id="maxRating" type="number" min="1" max="5" step="0.5" value="2" />
        </label>
        <label>Limit
          <input id="limit" type="number" min="1" max="300" value="50" />
        </label>
        <label>Datei speichern als
          <input id="outFile" type="text" value="bad-reviews.json" />
        </label>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-weight:500;">
        <input id="trySortLowest" type="checkbox" style="width:auto;" />
        Optional: zuerst versuchen auf "Niedrigste Bewertung" zu sortieren (kann bei Google-UI fehlschlagen)
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-weight:500;">
        <input id="headless" type="checkbox" style="width:auto;" />
        Ohne Browserfenster laufen (stabiler, empfohlen)
      </label>
      <label>
        Basis-URL der Live-Seite (optional)
        <input id="baseUrl" type="text" placeholder="https://reviewloeschen.de" />
      </label>
      <button id="start">Start Scrape</button>
      <div id="status" class="status"></div>
      <div id="resultLink" class="result-link" style="display:none;">
        <div>Unternehmensseite erstellt:</div>
        <a id="resultLinkHref" href="#" target="_blank" rel="noopener"></a>
        <div id="resultPath" class="path"></div>
      </div>
      <pre id="output">Noch kein Ergebnis.</pre>
    </div>
    <script>
      const startBtn = document.getElementById("start");
      const statusEl = document.getElementById("status");
      const outputEl = document.getElementById("output");
      const resultLinkBox = document.getElementById("resultLink");
      const resultLinkHref = document.getElementById("resultLinkHref");
      const resultPath = document.getElementById("resultPath");
      let pollTimer = null;
      function stopPolling() {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }

      async function pollJob(jobId) {
        try {
          const response = await fetch("/api/scrape/status/" + encodeURIComponent(jobId));
          const state = await response.json();
          if (!response.ok) {
            throw new Error(state.error || "Status konnte nicht geladen werden");
          }

          outputEl.textContent = (state.logs || []).join("\\n") || "Bitte warten...";

          if (state.status === "running") {
            statusEl.textContent = "Scraper laeuft... " + (state.lastMessage || "Bitte warten...");
            return;
          }

          stopPolling();
          startBtn.disabled = false;

          if (state.status === "failed") {
            statusEl.textContent = "Fehler: " + (state.error?.message || "Unbekannter Fehler");
            if (state.error?.stack) {
              outputEl.textContent += "\\n\\n--- TECHNISCHER FEHLER ---\\n" + state.error.stack;
            }
            return;
          }

          const result = state.result || {};
          statusEl.textContent = "Fertig. Scrape + Unternehmensseite automatisch erstellt.";
          const pageUrl = result.customerPageUrl || "";
          const pagePath =
            (result.createdPage && result.createdPage.publicPath) ||
            (result.createdPage && result.createdPage.localPagePath) ||
            "";
          if (pageUrl || pagePath) {
            const href = pageUrl || pagePath;
            resultLinkHref.href = href;
            resultLinkHref.textContent = href;
            resultPath.textContent = pagePath ? ("Pfad: " + pagePath) : "";
            resultLinkBox.style.display = "block";
          }

          outputEl.textContent += "\\n\\n--- ERGEBNIS ---\\n" + JSON.stringify(result, null, 2);
        } catch (error) {
          stopPolling();
          startBtn.disabled = false;
          statusEl.textContent = "Fehler beim Status-Polling: " + error.message;
        }
      }

      startBtn.addEventListener("click", async () => {
        const url = document.getElementById("url").value.trim();
        const maxRating = Number(document.getElementById("maxRating").value || "2");
        const limit = Number(document.getElementById("limit").value || "50");
        const outFile = document.getElementById("outFile").value.trim() || "bad-reviews.json";
        const trySortLowest = document.getElementById("trySortLowest").checked;
        const headless = document.getElementById("headless").checked;
        const company = document.getElementById("company").value.trim();
        const baseUrl = document.getElementById("baseUrl").value.trim();
        if (!url) {
          statusEl.textContent = "Bitte zuerst eine URL eingeben.";
          return;
        }
        startBtn.disabled = true;
        statusEl.textContent = "Scrape wird gestartet...";
        outputEl.textContent = "Bitte warten...";
        resultLinkBox.style.display = "none";
        stopPolling();
        try {
          const response = await fetch("/api/scrape/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, maxRating, limit, outFile, trySortLowest, headless, company, baseUrl })
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || "Unbekannter Fehler");
          }

          const jobId = result.jobId;
          statusEl.textContent = "Job gestartet (ID: " + jobId + ").";
          outputEl.textContent = "Initialisiere Job...";
          await pollJob(jobId);
          pollTimer = setInterval(() => {
            pollJob(jobId);
          }, 1500);
        } catch (error) {
          stopPolling();
          statusEl.textContent = "Fehler: " + error.message;
          outputEl.textContent = "Fehler beim Starten des Scrape-Jobs.";
          startBtn.disabled = false;
        } finally {
        }
      });
    </script>
  </body>
</html>`);
});

app.post("/api/scrape/start", async (req, res) => {
  try {
    const url = String(req.body?.url || "").trim();
    const maxRating = Number(req.body?.maxRating ?? 2);
    const limit = Number(req.body?.limit ?? 50);
    const outFile = String(req.body?.outFile || "bad-reviews.json");
    const trySortLowest = Boolean(req.body?.trySortLowest);
    const headless = Boolean(req.body?.headless);
    const companyInput = String(req.body?.company || "").trim();
    const baseUrl = String(req.body?.baseUrl || "").trim();

    if (!url) {
      return res.status(400).json({ error: "Missing url" });
    }

    const jobId = createJobId();
    const normalized = {
      url,
      maxRating: Number.isFinite(maxRating) ? maxRating : 2,
      limit: Number.isFinite(limit) ? limit : 50,
      outFile,
      trySortLowest,
      headless,
      preferredLocale: "bg-BG",
      companyInput,
      baseUrl,
    };

    jobs.set(jobId, {
      jobId,
      status: "running",
      createdAt: new Date().toISOString(),
      finishedAt: null,
      logs: [],
      result: null,
      error: null,
    });

    runScrapeJob(jobId, normalized).catch((error) => {
      const job = jobs.get(jobId);
      if (!job) return;
      job.status = "failed";
      job.error = toErrorPayload(error);
      job.finishedAt = new Date().toISOString();
      job.logs.push(`[${new Date().toISOString()}] Fataler Fehler im Job-Runner.`);
    });

    return res.json({ jobId, status: "running" });
  } catch (error) {
    console.error("[scrape] failed", error);
    return res.status(500).json({ error: error.message || "Scrape failed" });
  }
});

app.get("/api/scrape/status/:jobId", (req, res) => {
  const jobId = String(req.params?.jobId || "");
  const job = jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  return res.json({
    jobId: job.jobId,
    status: job.status,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    lastMessage: job.logs[job.logs.length - 1] || "",
    logs: job.logs,
    result: job.result,
    error: job.error,
  });
});

app.listen(PORT, () => {
  console.log(`Scraper GUI running on http://localhost:${PORT}`);
});
