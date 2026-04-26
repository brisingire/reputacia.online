import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

function getArg(name, fallback = "") {
  const key = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(key));
  return hit ? hit.slice(key.length) : fallback;
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

async function runShellCommand(line, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(line, {
      cwd,
      stdio: "inherit",
      shell: true,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Deploy command failed with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

async function run() {
  const cwd = process.cwd();
  const baseUrl =
    getArg("base-url") ||
    process.env.BASE_URL ||
    "https://reputacia.online";
  const deployCmd = getArg("deploy-cmd") || process.env.DEPLOY_CMD || "";

  console.log("Step 1/2: Refreshing all generated case pages...");
  await runCommand(
    process.execPath,
    [path.join("tools", "refresh-all-cases.mjs"), `--base-url=${baseUrl}`],
    cwd,
  );

  if (!deployCmd) {
    console.log("\nStep 2/2 skipped: no deploy command configured.");
    console.log("Set DEPLOY_CMD or pass --deploy-cmd='your deploy command'.");
    console.log("Examples:");
    console.log(
      "  DEPLOY_CMD=\"rsync -avz --delete ./ user@server:/var/www/reviewloeschen.de\" npm run deploy:all -- --base-url=https://reviewloeschen.de",
    );
    console.log(
      "  npm run deploy:all -- --base-url=https://reviewloeschen.de --deploy-cmd=\"vercel --prod\"",
    );
    return;
  }

  console.log("\nStep 2/2: Running deploy command...");
  await runShellCommand(deployCmd, cwd);
  console.log("\nDeploy complete.");
}

run().catch((error) => {
  console.error("deploy:all failed:", error.message);
  process.exit(1);
});
