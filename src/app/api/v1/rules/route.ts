import { guard, readJson } from "@/core/http";
import { SpendableError } from "@/core/errors";
import { addMatchRule as serviceAddRule, learnRules, listMatchRules, saveRules, setLearnRules, type RuleInput } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return guard(request, () => ({ rules: listMatchRules(), learn: learnRules() }));
}

export function PUT(request: Request) {
  return guard(request, async () => {
    const body = await readJson(request);
    if (!Array.isArray(body.rules)) throw new SpendableError("Not a choice.", "bad_rule");
    const rules: RuleInput[] = body.rules.map((rule) => {
      if (!rule || typeof rule !== "object") throw new SpendableError("Not a choice.", "bad_rule");
      const row = rule as Record<string, unknown>;
      return {
        id: typeof row.id === "string" ? row.id : "",
        ord: typeof row.ord === "number" ? row.ord : 0,
        stage: typeof row.stage === "string" ? row.stage : "",
        field: typeof row.field === "string" ? row.field : "",
        op: typeof row.op === "string" ? row.op : "",
        value: typeof row.value === "string" ? row.value : "",
        action: typeof row.action === "string" ? row.action : "",
        actionValue: typeof row.actionValue === "string" ? row.actionValue : "",
      };
    });
    if (typeof body.learn === "boolean") setLearnRules(body.learn);
    return { rules: saveRules(rules), learn: learnRules() };
  });
}

export function POST(request: Request) {
  return guard(request, async () => {
    const body = await readJson(request);
    if (!body || typeof body !== "object") throw new SpendableError("Not a choice.", "bad_rule");
    if (!body.stage || !body.field || !body.op || !body.value || !body.action) {
      throw new SpendableError("Rule needs stage, field, op, value, and action.", "bad_rule");
    }
    const rule: RuleInput = {
      id: typeof body.id === "string" ? body.id : "",
      ord: typeof body.ord === "number" && Number.isInteger(body.ord) ? body.ord : undefined,
      stage: body.stage as RuleInput["stage"],
      field: body.field as RuleInput["field"],
      op: body.op as RuleInput["op"],
      value: String(body.value),
      action: body.action as RuleInput["action"],
      actionValue: typeof body.actionValue === "string" ? body.actionValue : "",
    };
    const result = serviceAddRule(rule);
    return { rule: result, rules: listMatchRules() };
  });
}
