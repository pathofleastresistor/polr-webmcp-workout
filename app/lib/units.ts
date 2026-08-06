import type { UnitSystem } from "~/db/schema";

const KG_PER_LB = 0.45359237;

/**
 * Loads are stored and exchanged in kilograms everywhere — database, API and
 * WebMCP tool arguments alike. Conversion happens only at the moment of
 * display, so there is exactly one unit in the system and no chance of an agent
 * and the UI disagreeing about what "185" means.
 */
export function fromKg(kg: number, units: UnitSystem): number {
  return units === "metric" ? kg : kg / KG_PER_LB;
}

export function toKg(value: number, units: UnitSystem): number {
  return units === "metric" ? value : value * KG_PER_LB;
}

export function unitLabel(units: UnitSystem): string {
  return units === "metric" ? "kg" : "lb";
}

/** Formats a stored kilogram value for display in the person's units. */
export function formatWeight(kg: number | null, units: UnitSystem): string {
  if (kg === null) return "—";
  const value = fromKg(kg, units);
  const rounded = Math.round(value * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} ${unitLabel(units)}`;
}

/** Volume figures get thousands separators and no decimals; they are large. */
export function formatVolume(kg: number, units: UnitSystem): string {
  const value = Math.round(fromKg(kg, units));
  return `${value.toLocaleString()} ${unitLabel(units)}`;
}

export function formatRelativeDays(days: number | null): string {
  if (days === null) return "never";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
