import { defineConfig } from "cypress";
import { randomUUID } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { Incident } from "./src/lib/incidents";

const screenshotPrefix = "ui-pass--";
const localTimestamp = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Sao_Paulo",
});

function screenshotRun() {
  const [date, time] = localTimestamp.format(new Date()).split(" ");
  return join(date, `${time.replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`);
}

export default defineConfig({
  video: false,
  trashAssetsBeforeRuns: false,
  e2e: {
    baseUrl: "http://localhost:3417",
    testIsolation: true,
    supportFile: "cypress/support/e2e.ts",
    setupNodeEvents(on, config) {
      const authors = new Set<string>();
      const live = new Map<string, string>();
      const base = config.baseUrl;
      if (!base) throw new Error("A URL da aplicação E2E é obrigatória");
      if (!config.screenshotsFolder) throw new Error("A pasta de capturas E2E é obrigatória");

      const screenshots = resolve(config.projectRoot, config.screenshotsFolder);
      let run = screenshotRun();
      let specPath = "";
      on("before:browser:launch", (browser, launchOptions) => {
        if (browser.name === "electron" && browser.isHeadless) {
          launchOptions.preferences.height = 1000;
        }
        return launchOptions;
      });
      on("before:run", () => { run = screenshotRun(); });
      on("after:screenshot", async details => {
        if (!details.name?.startsWith(screenshotPrefix)) return {};
        const file = basename(details.path).slice(screenshotPrefix.length);
        const destination = join(screenshots, run, specPath, file);
        await mkdir(dirname(destination), { recursive: true });
        await rename(details.path, destination);
        return { path: destination };
      });

      on("task", {
        prepareScreenshotSpec(spec: string) {
          specPath = spec.replace(/^cypress[\\/]e2e[\\/]/, "");
          if (config.isInteractive) run = screenshotRun();
          return null;
        },
        rememberAuthor(cookie: string) {
          authors.add(cookie);
          return null;
        },
        rememberLive({ id, secret }: { id: string; secret: string }) {
          live.set(id, secret);
          return null;
        },
        async cleanState() {
          for (const [id, secret] of live) {
            const response = await fetch(`${base}/api/live-routes/${id}`, {
              method: "DELETE",
              headers: { "X-Live-Secret": secret },
            });
            if (!response.ok && response.status !== 404) throw new Error(`Falha ao limpar sessão ${id}`);
            live.delete(id);
          }
          for (const cookie of authors) {
            const headers = { Cookie: `alerta_viewer=${cookie}` };
            const response = await fetch(`${base}/api/incidents`, { headers });
            if (!response.ok) throw new Error("Falha ao listar ocorrências para limpeza");
            const incidents: Incident[] = await response.json();
            for (const incident of incidents.filter(item => item.isOwner)) {
              const deleted = await fetch(`${base}/api/incidents/${incident.id}`, { method: "DELETE", headers });
              if (!deleted.ok && deleted.status !== 404) throw new Error(`Falha ao limpar ocorrência ${incident.id}`);
            }
            authors.delete(cookie);
          }
          return null;
        },
        async waitServerTime({ until, url }: { until: number; url?: string }) {
          while (Date.now() < until) {
            if (url) {
              const response = await fetch(new URL(url, base));
              if (response.status === 404) return 404;
              if (!response.ok) throw new Error(`Consulta inesperada: ${response.status}`);
            }
            await new Promise(resolve => setTimeout(resolve, Math.min(500, until - Date.now())));
          }
          return null;
        },
        serverTime() {
          return Date.now();
        },
      });
      return config;
    },
  },
});
