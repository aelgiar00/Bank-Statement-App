import type { BankDefinition, BankId } from "./types";

export const BANKS: BankDefinition[] = [
  {
    id: "riyad",
    nameEn: "Riyad Bank",
    nameAr: "بنك الرياض",
    city: "Riyadh",
    established: "1957",
    accentHex: "#230771",
    accent: {
      ink: [0.137, 0.031, 0.443],
      header: [0.137, 0.031, 0.443],
      wash: [0.957, 0.953, 0.973],
      grid: [0.827, 0.843, 0.843],
    },
  },
  {
    id: "alinma",
    nameEn: "Alinma Bank",
    nameAr: "مصرف الإنماء",
    city: "Riyadh",
    established: "2006",
    accentHex: "#0C2639",
    accent: {
      ink: [0.05, 0.15, 0.25],
      header: [0.05, 0.15, 0.25],
      wash: [0.906, 0.898, 0.969],
      grid: [0.78, 0.8, 0.84],
    },
  },
  {
    id: "alrajhi",
    nameEn: "Al Rajhi Bank",
    nameAr: "مصرف الراجحي",
    city: "Riyadh",
    established: "1957",
    accentHex: "#141AD9",
    accent: {
      ink: [0.08, 0.1, 0.85],
      header: [0.08, 0.1, 0.85],
      wash: [0.95, 0.95, 0.95],
      grid: [1, 1, 1],
    },
  },
  {
    id: "albilad",
    nameEn: "Bank Albilad",
    nameAr: "بنك البلاد",
    city: "Riyadh",
    established: "2004",
    accentHex: "#1A1A1A",
    accent: {
      ink: [0.08, 0.08, 0.08],
      header: [0.12, 0.12, 0.12],
      wash: [0.98, 0.98, 0.98],
      grid: [0.1, 0.1, 0.1],
    },
  },
  {
    id: "snb",
    nameEn: "Saudi National Bank",
    nameAr: "البنك الأهلي السعودي",
    city: "Jeddah",
    established: "1953",
    accentHex: "#0B6B3A",
    accent: {
      ink: [0.043, 0.42, 0.227],
      header: [0.043, 0.42, 0.227],
      wash: [0.94, 0.97, 0.95],
      grid: [0.78, 0.86, 0.8],
    },
  },
];

export const BANK_BY_ID: Record<BankId, BankDefinition> = Object.fromEntries(
  BANKS.map((b) => [b.id, b]),
) as Record<BankId, BankDefinition>;

export function getBank(id: string): BankDefinition {
  const found = BANKS.find((b) => b.id === id);
  if (!found) throw new Error(`Unknown bank template: ${id}`);
  return found;
}