import { execSync } from "node:child_process";
import process from "node:process";

const PORT = Number(process.env.SCRAPER_PORT || 4180);

function run() {
  try {
    const output = execSync(`lsof -ti tcp:${PORT} -sTCP:LISTEN`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    if (!output) {
      console.log(`No scraper process is listening on port ${PORT}.`);
      return;
    }

    const pids = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGTERM");
        console.log(`Stopped process ${pid} on port ${PORT}.`);
      } catch {
        console.log(`Could not stop process ${pid}.`);
      }
    }
  } catch {
    console.log(`No scraper process is listening on port ${PORT}.`);
  }
}

run();
