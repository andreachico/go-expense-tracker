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
