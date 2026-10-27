export const apiContract = {
  name: "spendable",
  version: 1,
  principle:
    "Account balances are copied from the bank on sync. Bills, categories, card rules, and the spendable figure are views. They never write account balances.",
  routes: [
    { method: "GET", path: "/api/v1", purpose: "List this contract." },
    { method: "GET", path: "/api/v1/snapshot", purpose: "The answer: bank figures, every subtraction, and what is left to spend." },
    { method: "GET", path: "/api/v1/accounts", purpose: "Accounts and the roles you assigned." },
    { method: "PATCH", path: "/api/v1/accounts/:id", purpose: "Set role, card due day, and payment rule. Does not change the balance." },
    { method: "GET", path: "/api/v1/bills", purpose: "Bills held back before payday." },
    { method: "POST", path: "/api/v1/bills", purpose: "Add a bill. Body: name, amountCents, dueDay." },
    { method: "DELETE", path: "/api/v1/bills/:id", purpose: "Remove a bill." },
    { method: "GET", path: "/api/v1/transactions", purpose: "Transactions copied from the bank. Optional ?since=YYYY-MM-DD." },
    { method: "PATCH", path: "/api/v1/transactions/:id", purpose: "Set or clear a category label. Does not change the balance." },
    { method: "GET", path: "/api/v1/settings", purpose: "Payday and buffer." },
    { method: "PATCH", path: "/api/v1/settings", purpose: "Update payday frequency, anchor date, and bufferCents." },
    { method: "GET", path: "/api/v1/connection", purpose: "Whether a bank is connected. Never returns the access URL." },
    { method: "POST", path: "/api/v1/connection", purpose: "Claim a SimpleFIN setup token. Body: setupToken." },
    { method: "DELETE", path: "/api/v1/connection", purpose: "Forget the saved access URL. Keeps the last copied balances." },
    { method: "POST", path: "/api/v1/sync", purpose: "Copy balances and transactions from SimpleFIN." },
  ],
} as const;
