import type { Location } from "./territory";

export const categories = {
  robbery: { label: "Assalto", color: "#bd343c" },
  incident: { label: "Incidente", color: "#925000" },
  police: { label: "Presença policial", color: "#2258b5" },
  homicide: { label: "Homicídio", color: "#7940a5" },
  disorder: { label: "Desordem", color: "#426347" },
  noise: { label: "Barulho", color: "#027388" },
  fight: { label: "Briga", color: "#a83b76" },
  mass_robbery: { label: "Arrastão", color: "#74372a" },
  protest: { label: "Protesto", color: "#4d46a3" },
  dangerous_animals: { label: "Animais perigosos", color: "#536620" },
  vehicle_dismantling: { label: "Desmanche", color: "#49586e" },
  drug_trafficking: { label: "Tráfico de drogas", color: "#633d8a" },
  drug_use: { label: "Consumo de drogas", color: "#6e5381" },
  bus_fire: { label: "Incêndio em ônibus", color: "#a1420b" },
  bus_robbery: { label: "Assalto a ônibus", color: "#a32c42" },
  kidnapping: { label: "Sequestro", color: "#8b2857" },
  bank_explosion: { label: "Explosão em banco", color: "#882c23" },
  other: { label: "Outro crime", color: "#14746a" },
} as const;

export type Category = keyof typeof categories;
export const categoryKeys = Object.keys(categories) as Category[];
export type NewIncident = Location & { category: Category; description: string };
export type Incident = NewIncident & {
  id: string;
  createdAt: string;
  locationLabel?: string;
  isOwner?: boolean;
  likeCount?: number;
  likedByMe?: boolean;
  messageCount?: number;
};
export type IncidentMessage = { id: string; author: string; isMine: boolean; text: string; createdAt: string };
export type IncidentThread = { incident: Incident; messages: IncidentMessage[] };
export type IncidentChange =
  | { action: "like"; value: boolean }
  | { action: "ignore"; value: boolean }
  | { action: "edit"; category: Category; description: string }
  | { action: "message"; text: string }
  | { action: "delete" };

export const incidentDay = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Recife", dateStyle: "full" });
