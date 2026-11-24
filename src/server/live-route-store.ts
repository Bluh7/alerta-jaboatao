import { randomUUID } from "node:crypto";
import type { Location } from "../lib/territory";

const lifetime = 45_000;
type Session = { secret: string; route: string; position: Location; expires: number };
const shared = globalThis as typeof globalThis & { alertaLiveRoutes?: Map<string, Session> };
const sessions = shared.alertaLiveRoutes ??= new Map();

export function startLiveRoute(route: string, position: Location) {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expires <= now) sessions.delete(id);
  }
  const id = randomUUID();
  const secret = randomUUID();
  sessions.set(id, { secret, route, position, expires: now + lifetime });
  return { id, secret };
}

export function getLiveRoute(id: string) {
  const session = sessions.get(id);
  if (session && session.expires > Date.now()) return session;
  sessions.delete(id);
}

export function updateLiveRoute(id: string, secret: string | null, position: Location) {
  const session = getLiveRoute(id);
  if (!session || session.secret !== secret) return false;
  session.position = position;
  session.expires = Date.now() + lifetime;
  return true;
}

export function endLiveRoute(id: string, secret: string | null) {
  const session = getLiveRoute(id);
  if (!session || session.secret !== secret) return false;
  return sessions.delete(id);
}
