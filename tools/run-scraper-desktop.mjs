import { spawn } from "node:child_process";
import process from "node:process";
import net from "node:net";

const PORT = Number(process.env.SCRAPER_PORT || 4180);
const URL = `http://localhost:${PORT}`;

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function openInBrowser(url) {
  const platform = process.platform;

  if (platform === "darwin") {
    return spawn("open", [url], { stdio: "ignore", detached: true });
  }

  if (platform === "win32") {
    return spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true });
  }

  return spawn("xdg-open", [url], { stdio: "ignore", detached: true });
}

async function run() {
  const portFree = await isPortFree(PORT);
  if (!portFree) {
    console.log(
      `Port ${PORT} is already in use. Stop old scraper first with: npm run scrape:stop`,
    );
    console.log(`Then restart with: npm run scrape:desktop`);
    process.exit(1);
  }

  const server = spawn("node", ["./tools/scraper-server.mjs"], {
    stdio: "inherit",
    env: { ...process.env, SCRAPER_PORT: String(PORT) },
  });

  setTimeout(() => {
    try {
      const opener = openInBrowser(URL);
      opener.unref();
      console.log(`Opened GUI in browser: ${URL}`);
    } catch {
      console.log(`Could not open browser automatically. Open manually: ${URL}`);
    }
  }, 800);

  server.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

run();
