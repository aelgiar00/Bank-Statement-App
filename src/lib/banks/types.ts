export type BankId =
  | "riyad"
  | "alinma"
  | "alrajhi"
  | "albilad"
  | "snb";

export type Transaction = {
  date: string;
  details: string;
  debit: string;
  credit: string;
  balance: string;
  type: string;
  checkNo: string;
  ref: string;
};

export type StatementMeta = {
  customer: string;
  accountName: string;
  accountNumber: string;
  iban: string;
  fromDate: string;
  toDate: string;
  openingBalance: string;
  closingBalance: string;
  accountBalance: string;
  reportDate: string;
  currency: string;
  shortName: string;
};

export type Statement = {
  meta: StatementMeta;
  rows: Transaction[];
  sourceName: string;
};

export type BankAccent = {
  /** Deep ink used for titles and rules */
  ink: [number, number, number];
  /** Header fill */
  header: [number, number, number];
  /** Alternating / cell wash */
  wash: [number, number, number];
  /** Hairline / grid */
  grid: [number, number, number];
};

export type BankDefinition = {
  id: BankId;
  nameEn: string;
  nameAr: string;
  city: string;
  established: string;
  accentHex: string;
  accent: BankAccent;
};

export const emptyMeta = (): StatementMeta => ({
  customer: "",
  accountName: "",
  accountNumber: "",
  iban: "",
  fromDate: "",
  toDate: "",
  openingBalance: "",
  closingBalance: "",
  accountBalance: "",
  reportDate: "",
  currency: "SAR",
  shortName: "",
});