import { randomUUID } from "node:crypto";

const cookieName = "alerta_viewer";
const viewerPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function readIncidentViewer(request: Request) {
  const cookie = request.headers.get("cookie")?.split(";").find(part => part.trimStart().startsWith(cookieName + "="));
  const value = cookie?.trim().slice(cookieName.length + 1);
  return value && viewerPattern.test(value) ? value : undefined;
}

export function incidentViewerSession(request: Request) {
  const current = readIncidentViewer(request);
  const viewer = current ?? randomUUID();
  return { viewer, setCookie(response: Response) {
    response.headers.set("Cache-Control", "private, no-store");
    if (!current) {
      const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
      response.headers.append("Set-Cookie", `${cookieName}=${viewer}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`);
    }
    return response;
  } };
}
