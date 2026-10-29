import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryMenu, categoryMenuCursor } from "../src/components/charge-category";
import { menuRows } from "../src/components/menu-select";

const categories = [
  { name: "Bills", group: "Home" },
  { name: "Groceries", group: "Food" },
];

test("a typed name that is not a category is the enter target", () => {
  const items = categoryMenu(categories, "Bill", true);
  assert.equal(items[categoryMenuCursor(items, "Bill")]?.kind, "create");
  assert.equal(items[categoryMenuCursor(items, "Bill")]?.name, "Bill");
  const known = categoryMenu(categories, "bills", true);
  assert.equal(known.some((item) => item.kind === "create"), false);
  assert.equal(known[categoryMenuCursor(known, "bills")]?.name, "Bills");
  const choices = categories.map((category) => ({ value: category.name, label: category.name }));
  assert.equal(menuRows(choices, "Bill", true)[0]?.label, "Create Bill");
  assert.equal(menuRows(choices, "Bill", true)[0]?.value, "Bill");
  assert.equal(menuRows(choices, "bills", true).some((row) => row.label.startsWith("Create")), false);
  assert.equal(menuRows(choices, "bills", true)[0]?.value, "Bills");
});
