import { decimalToCents } from "./money";

export type CategoryRule = {
  contains: string;
  category: string;
  tag?: string;
};

export function normalizeContains(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 80).toLowerCase();
}

export function matchingRule(description: string, rules: CategoryRule[]): CategoryRule | null {
  const hay = description.toLowerCase();
  let best: CategoryRule | null = null;
  for (const rule of rules) {
    const needle = rule.contains.trim().toLowerCase();
    if (needle.length < 2 || !hay.includes(needle)) continue;
    if (!best || needle.length > best.contains.length) best = rule;
  }
  return best;
}

export function categoryFor(description: string, rules: CategoryRule[]): string | null {
  return matchingRule(description, rules)?.category ?? null;
}

// shortcut: one condition and one action. Combining conditions waits.
export const RULE_STAGES = [
  ["before", "Before"],
  ["after", "After"],
] as const;

export const RULE_FIELDS = [
  ["imported_payee", "Imported payee"],
  ["payee", "Payee"],
  ["account", "Account"],
  ["category", "Category"],
  ["date", "Date"],
  ["notes", "Notes"],
  ["amount", "Amount"],
  ["tag", "Tag"],
] as const;

export const RULE_OPS = [
  ["contains", "contains"],
  ["is", "is"],
  ["before", "before"],
  ["after", "after"],
  ["under", "under"],
  ["over", "over"],
] as const;

export const RULE_ACTIONS = [
  ["category", "Category"],
  ["payee", "Payee"],
  ["notes", "Notes"],
  ["tag", "Tag"],
  ["date", "Date"],
  ["amount", "Amount"],
  ["cleared", "Cleared"],
] as const;

// shortcut: one field copied. A formula or mixed text waits.
export const RULE_SOURCES = [
  ["imported_payee", "Imported payee"],
  ["payee", "Payee"],
  ["account", "Account"],
  ["category", "Category"],
  ["date", "Date"],
  ["notes", "Notes"],
  ["amount", "Amount"],
  ["tag", "Tag"],
  ["cleared", "Cleared"],
] as const;

export const RULE_FIELD_OPS = {
  imported_payee: ["contains", "is"],
  payee: ["contains", "is"],
  account: ["contains", "is"],
  category: ["contains", "is"],
  notes: ["contains", "is"],
  tag: ["contains", "is"],
  date: ["is", "before", "after"],
  amount: ["is", "under", "over"],
} as const;

export type RuleStage = (typeof RULE_STAGES)[number][0];
export type RuleField = keyof typeof RULE_FIELD_OPS;
export type RuleOp = (typeof RULE_OPS)[number][0];
export type RuleAction = (typeof RULE_ACTIONS)[number][0];
export type RuleSource = (typeof RULE_SOURCES)[number][0];

export type MatchRule = {
  id: string;
  ord: number;
  stage: RuleStage;
  field: RuleField;
  op: RuleOp;
  value: string;
  action: RuleAction;
  actionValue: string;
};

export type RuleFact = {
  importedPayee: string;
  payee: string;
  account: string;
  category: string;
  date: string;
  notes: string;
  amountCents: number;
  tags: string[];
  cleared: boolean;
};

const SOURCE_VALUE = /^\{\{(imported_payee|payee|account|category|date|notes|amount|tag|cleared)\}\}$/;

export function ruleSource(actionValue: string): RuleSource | "" {
  const match = SOURCE_VALUE.exec(actionValue.trim());
  return (match?.[1] as RuleSource | undefined) ?? "";
}

export function fillRuleValue(actionValue: string, fact: RuleFact): string {
  const source = ruleSource(actionValue);
  if (source === "imported_payee") return fact.importedPayee;
  if (source === "payee") return fact.payee;
  if (source === "account") return fact.account;
  if (source === "category") return fact.category;
  if (source === "date") return fact.date;
  if (source === "notes") return fact.notes;
  if (source === "amount") return (fact.amountCents / 100).toFixed(2);
  if (source === "tag") return fact.tags[0] ?? "";
  if (source === "cleared") return fact.cleared ? "1" : "0";
  return actionValue;
}

export function clearedFlag(value: string): boolean | null {
  const text = value.trim().toLowerCase();
  if (text === "1" || text === "true" || text === "yes" || text === "cleared") return true;
  if (text === "0" || text === "false" || text === "no" || text === "uncleared") return false;
  return null;
}

export function isRuleField(value: string): value is RuleField {
  return Object.prototype.hasOwnProperty.call(RULE_FIELD_OPS, value);
}

function textMatch(op: RuleOp, haystack: string, needle: string): boolean {
  const hay = haystack.toLowerCase();
  const pin = needle.trim().toLowerCase();
  if (!pin) return false;
  if (op === "is") return hay === pin;
  if (op === "contains") return pin.length >= 2 && hay.includes(pin);
  return false;
}

export function ruleMatches(rule: Pick<MatchRule, "field" | "op" | "value">, fact: RuleFact): boolean {
  if (rule.field === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fact.date) || !/^\d{4}-\d{2}-\d{2}$/.test(rule.value)) return false;
    if (rule.op === "is") return fact.date === rule.value;
    if (rule.op === "before") return fact.date < rule.value;
    if (rule.op === "after") return fact.date > rule.value;
    return false;
  }
  if (rule.field === "amount") {
    let cents: number;
    try {
      cents = decimalToCents(rule.value);
    } catch {
      return false;
    }
    const amount = Math.abs(fact.amountCents);
    const target = Math.abs(cents);
    if (rule.op === "is") return amount === target;
    if (rule.op === "under") return amount < target;
    if (rule.op === "over") return amount > target;
    return false;
  }
  if (rule.field === "tag") return fact.tags.some((tag) => textMatch(rule.op, tag, rule.value));
  const hay =
    rule.field === "imported_payee"
      ? fact.importedPayee
      : rule.field === "payee"
        ? fact.payee
        : rule.field === "account"
          ? fact.account
          : rule.field === "category"
            ? fact.category
            : fact.notes;
  return textMatch(rule.op, hay, rule.value);
}
