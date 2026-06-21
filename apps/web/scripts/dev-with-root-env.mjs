import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(appDirectory, "../..");
const rootEnvPath = resolve(repositoryRoot, ".env");

if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

const nextBin = resolve(repositoryRoot, "node_modules/next/dist/bin/next");
const port = process.env.PORT ?? "3000";
const nextProcess = spawn(
  process.execPath,
  [nextBin, "dev", "--webpack", "--hostname", "0.0.0.0", "--port", port],
  {
    cwd: appDirectory,
    env: process.env,
    stdio: "inherit",
  },
);

nextProcess.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
