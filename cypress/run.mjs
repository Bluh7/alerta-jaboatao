import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { startProviders } from "./providers.mjs";

const port = 3417;
const baseUrl = `http://localhost:${port}`;
const nextCli = resolve("node_modules/next/dist/bin/next");
const cypressCli = resolve("node_modules/cypress/bin/cypress");
const open = process.argv[2] === "open";
const args = process.argv.slice(open ? 3 : 2);
const children = new Set();
let providers;

function child(script, args, env = process.env) {
  const processChild = spawn(process.execPath, [script, ...args], { env, stdio: "inherit" });
  children.add(processChild);
  processChild.once("exit", () => children.delete(processChild));
  return processChild;
}

function stop() {
  for (const processChild of children) processChild.kill();
  providers?.close();
}

async function waitForApp(server) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && server.exitCode === null) {
    try {
      const response = await fetch(`${baseUrl}/api/incidents`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // The listener may not be ready yet.
    }
    await delay(250);
  }
  throw new Error(`O servidor E2E não iniciou em ${baseUrl}`);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stop();
    process.exitCode = 1;
  });
}

try {
  const [build] = await once(child(nextCli, ["build"]), "exit");
  if (build !== 0) throw new Error("O build E2E falhou");
  providers = await startProviders();
  const provider = `http://127.0.0.1:${providers.address().port}`;
  const server = child(nextCli, ["start", "--hostname", "localhost", "--port", String(port)], {
    ...process.env,
    PHOTON_URL: provider,
    OSRM_URL: `${provider}/car`,
    OSRM_FOOT_URL: `${provider}/foot`,
    OSRM_BIKE_URL: `${provider}/bike`,
  });
  await waitForApp(server);
  const mode = open ? ["open", "--e2e", "--browser", "electron"] : ["run", "--browser", "electron"];
  const [code] = await once(child(cypressCli, [...mode, ...args]), "exit");
  process.exitCode = code ?? 1;
} finally {
  stop();
}
