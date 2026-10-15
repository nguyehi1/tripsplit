import type { ComponentType, SVGProps } from "react";
import { GlobeIcon, HouseIcon, PlusIcon, TentIcon } from "@/components/icons";

export type TripTypeIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>;

// Icons are presentation, so they live here rather than in the catalog config. This is the one
// map shared by the New trip picker and the home template shelf. A catalog type added later
// without an icon here still gets a tile (generic plus sign).
const TRIP_TYPE_ICONS: Record<string, TripTypeIcon> = {
  camping: TentIcon,
  airbnb: HouseIcon,
  international: GlobeIcon,
};

export function iconForTripType(code: string): TripTypeIcon {
  return Object.hasOwn(TRIP_TYPE_ICONS, code) ? TRIP_TYPE_ICONS[code] : PlusIcon;
}
