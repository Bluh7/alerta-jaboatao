import {
  Activity, BusFront, CarFront, CircleAlert, Flame, Landmark, Megaphone, Package,
  PawPrint, Pill, ShieldAlert, Siren, Swords, TriangleAlert, UserRoundX, UsersRound, Volume2, Wrench,
} from "lucide-react";
import { categories, type Category } from "../lib/incidents";

const appearance = {
  robbery: { Icon: ShieldAlert, background: "#ffe8e9" },
  incident: { Icon: CarFront, background: "#fff0d8" },
  police: { Icon: Siren, background: "#e5efff" },
  homicide: { Icon: TriangleAlert, background: "#f3e7ff" },
  disorder: { Icon: Activity, background: "#e8efe2" },
  noise: { Icon: Volume2, background: "#dff2f7" },
  fight: { Icon: Swords, background: "#f9e4f0" },
  mass_robbery: { Icon: UsersRound, background: "#f4e7e1" },
  protest: { Icon: Megaphone, background: "#ebe9ff" },
  dangerous_animals: { Icon: PawPrint, background: "#eef3d8" },
  vehicle_dismantling: { Icon: Wrench, background: "#e7ecf3" },
  drug_trafficking: { Icon: Package, background: "#eee5f8" },
  drug_use: { Icon: Pill, background: "#f0e9f5" },
  bus_fire: { Icon: Flame, background: "#ffead8" },
  bus_robbery: { Icon: BusFront, background: "#fbe4ea" },
  kidnapping: { Icon: UserRoundX, background: "#f9e4ef" },
  bank_explosion: { Icon: Landmark, background: "#f8e4e1" },
  other: { Icon: CircleAlert, background: "#dff4ef" },
};

export function IncidentIcon({ category, marker = false, size = 23 }: {
  category: Category;
  marker?: boolean;
  size?: number;
}) {
  const { Icon, background } = appearance[category];
  const { color } = categories[category];
  return <span className={marker ? "pin-glyph" : "category-glyph"}
    style={{ backgroundColor: marker ? color : background, color: marker ? "#fff" : color }}
    aria-hidden="true">
    <Icon size={size} strokeWidth={2.25} />
  </span>;
}

