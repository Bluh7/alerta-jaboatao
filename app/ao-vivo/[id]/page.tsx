import type { Metadata } from "next";
import { LiveRouteViewer } from "../../../src/components/live-route-viewer";

export const metadata: Metadata = {
  title: "Rota ao vivo · Alerta Jaboatão",
  robots: { index: false, follow: false },
  // Identify the site to the tile server while keeping the live session path private.
  referrer: "strict-origin",
};

export default async function LiveRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveRouteViewer id={id} />;
}
