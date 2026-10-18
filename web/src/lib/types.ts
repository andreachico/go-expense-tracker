// These mirror the JSON the Go API sends/accepts (see internal/expense/expense.go).
export interface Expense {
  id: number;
  amount: number;
  category: string;
  description: string;
  date: string;
}

// What the client sends to create an expense: everything except the server-
// assigned id.
export type NewExpense = Omit<Expense, "id">;
// The budget sheet stored as a flat map of "section:row" keys to planned
// entries, e.g. { "fix:miete": { category: "Miete", amount: 595 } }. Type,
// category and due carry each row's labels so user-added rows survive a
// round-trip. Mirrors the Go budget.Plan / budget.Entry types.
export interface BudgetEntry {
  type: string;
  category: string;
  amount: number;
  due?: string;
}

export type BudgetPlan = Record<string, BudgetEntry>;

// A logged-in account, as returned by the /auth endpoints. The password hash
// never leaves the server, so it isn't part of this shape.
export interface User {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

// A single source of money received in a month (salary, side-job, etc.), as
// returned by the /income endpoints. Month is a "YYYY-MM" key.
export interface Income {
  id: number;
  source: string;
  amount: number;
  month: string;
}

// What the client sends to create income: everything except the server-assigned
// id.
export type NewIncome = Omit<Income, "id">;

// Savings is a named entry scoped to a "YYYY-MM" month, mirroring the Go
// savings.Saving type.
export interface Saving {
  id: number;
  name: string;
  amount: number;
  month: string;
}
export type NewSaving = Omit<Saving, "id">;

// A recorded sale of a holding in a "YYYY-MM" month. Buys are planned in the
// budget sheet; sales are subtracted from an asset's running total. Mirrors the
// Go investment.Sale type.
export interface InvestmentSale {
  id: number;
  name: string;
  amount: number;
  month: string; // "YYYY-MM"
}
export type NewInvestmentSale = Omit<InvestmentSale, "id">;

export interface Debt {
  id: number;
  kind: "onetime" | "installment";
  name: string;
  totalAmount: number;
  monthlyRate: number;
  termMonths: number;
  startMonth: string; // "YYYY-MM"
  paidMonths: number;
}

// Creating an installment plan (Ratenzahlung): a total paid off over a term.
export interface NewInstallment {
  kind: "installment";
  name: string;
  totalAmount: number;
  monthlyRate: number;
  termMonths: number;
  startMonth: string;
}

// Creating a one-time debt: a single payment of the full amount, due in a month.
export interface NewOneTimeDebt {
  kind: "onetime";
  name: string;
  totalAmount: number;
  startMonth: string;
}

export type NewDebt = NewInstallment | NewOneTimeDebt;