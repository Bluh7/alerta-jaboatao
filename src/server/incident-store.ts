import { createHash, randomUUID } from "node:crypto";
import { categories, type Incident, type IncidentChange, type IncidentMessage, type IncidentThread, type NewIncident } from "../lib/incidents";
import { isInJaboatao } from "../lib/territory";

type StoredMessage = Omit<IncidentMessage, "isMine" | "author"> & { viewer: string };
type StoredIncident = {
  incident: Incident;
  owner?: string;
  likes: Set<string>;
  ignoredBy: Set<string>;
  messages: StoredMessage[];
};
type ChangeResult = IncidentThread | "missing" | "forbidden" | null;

export interface IncidentStore {
  list(viewer?: string): Promise<Incident[]>;
  create(incident: NewIncident, owner?: string): Promise<Incident>;
  thread(id: string, viewer: string): Promise<IncidentThread | null>;
  change(id: string, viewer: string, update: IncidentChange): Promise<ChangeResult>;
}

function record(incident: Incident, owner?: string): StoredIncident {
  return { incident, owner, likes: new Set(), ignoredBy: new Set(), messages: [] };
}

function publicIncident(entry: StoredIncident, viewer?: string): Incident {
  return {
    ...entry.incident,
    isOwner: Boolean(viewer && entry.owner === viewer),
    likedByMe: Boolean(viewer && entry.likes.has(viewer)),
    likeCount: entry.likes.size,
    messageCount: entry.messages.length,
  };
}

function publicThread(entry: StoredIncident, viewer: string): IncidentThread {
  return {
    incident: publicIncident(entry, viewer),
    messages: entry.messages.map(({ viewer: sender, ...message }) => ({
      ...message,
      author: "Pessoa " + createHash("sha256").update(sender + entry.incident.id).digest("hex").slice(0, 4).toUpperCase(),
      isMine: viewer === sender,
    })),
  };
}

export function createMemoryIncidentStore(seed?: Promise<Incident[]>): IncidentStore {
  const records = new Map<string, StoredIncident>();
  const ready = seed?.then(incidents => {
    for (const incident of incidents.toReversed()) records.set(incident.id, record(incident));
  });

  return {
    async list(viewer) {
      await ready;
      return [...records.values()].reverse().filter(entry => !viewer || !entry.ignoredBy.has(viewer))
        .map(entry => publicIncident(entry, viewer));
    },
    async create(input, owner) {
      await ready;
      const incident = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
      const entry = record(incident, owner);
      records.set(incident.id, entry);
      return publicIncident(entry, owner);
    },
    async thread(id, viewer) {
      await ready;
      const entry = records.get(id);
      return entry && !entry.ignoredBy.has(viewer) ? publicThread(entry, viewer) : null;
    },
    async change(id, viewer, update) {
      await ready;
      const entry = records.get(id);
      if (!entry || (entry.ignoredBy.has(viewer) && update.action !== "ignore")) return "missing";
      const owns = entry.owner === viewer;
      if ((update.action === "edit" || update.action === "delete") && !owns) return "forbidden";
      if (update.action === "ignore" && owns) return "forbidden";
      switch (update.action) {
        case "delete":
          records.delete(id);
          return null;
        case "edit":
          entry.incident = { ...entry.incident, category: update.category, description: update.description };
          break;
        case "ignore":
          if (update.value) entry.ignoredBy.add(viewer);
          else entry.ignoredBy.delete(viewer);
          break;
        case "like":
          if (update.value) entry.likes.add(viewer);
          else entry.likes.delete(viewer);
          break;
        case "message":
          entry.messages.push({ id: randomUUID(), viewer, text: update.text, createdAt: new Date().toISOString() });
          break;
      }
      return publicThread(entry, viewer);
    },
  };
}

function incidentFields(value: unknown): Pick<NewIncident, "category" | "description"> | null {
  if (!value || typeof value !== "object") return null;
  const { category, description = "" } = value as Record<string, unknown>;
  if (typeof category !== "string" || !Object.hasOwn(categories, category) ||
      typeof description !== "string" || description.length > 280) return null;
  return { category: category as NewIncident["category"], description: description.trim() };
}

export function parseIncident(value: unknown): NewIncident | null {
  const fields = incidentFields(value);
  if (!fields) return null;
  const { lat, lng } = value as Record<string, unknown>;
  if (typeof lat !== "number" || typeof lng !== "number" || !isInJaboatao({ lat, lng })) return null;
  return { lat, lng, ...fields };
}

export function parseIncidentChange(value: unknown): IncidentChange | null {
  if (!value || typeof value !== "object") return null;
  const update = value as Record<string, unknown>;
  switch (update.action) {
    case "like":
    case "ignore":
      return typeof update.value === "boolean" ? { action: update.action, value: update.value } : null;
    case "message": {
      const text = typeof update.text === "string" ? update.text.trim() : "";
      return text && text.length <= 500 ? { action: "message", text } : null;
    }
    default:
      return null;
  }
}

export function parseIncidentReplacement(value: unknown): IncidentChange | null {
  if (!value || typeof value !== "object" || !Object.hasOwn(value, "description")) return null;
  const fields = incidentFields(value);
  return fields ? { action: "edit", ...fields } : null;
}

const shared = globalThis as typeof globalThis & { alertaIncidentStore?: IncidentStore };
const previous = shared.alertaIncidentStore;
export const incidentStore = shared.alertaIncidentStore = previous?.thread ? previous : createMemoryIncidentStore(previous?.list());
