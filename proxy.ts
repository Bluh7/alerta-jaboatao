import { NextResponse, type NextRequest } from "next/server";
import { incidentViewerSession, readIncidentViewer } from "./src/server/incident-viewer";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  return readIncidentViewer(request) ? response : incidentViewerSession(request).setCookie(response);
}

export const config = { matcher: "/" };
