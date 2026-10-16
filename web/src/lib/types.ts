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

// A logged-in account, as returned by the /auth endpoints. The password hash
// never leaves the server, so it isn't part of this shape.
export interface User {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

// Debts come in two kinds and mirror the Go debt.Debt type. A one-time debt is
// stored as a single-month plan; an installment plan pays a total off over a
// term. startMonth is a "YYYY-MM" key; paidMonths tracks progress.
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
