import { guard, readJson } from "@/core/http";
import { SpendableError } from "@/core/errors";
import { listMatchRules, saveRules, type RuleInput } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return guard(request, () => ({ rules: listMatchRules() }));
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
    return { rules: saveRules(rules) };
  });
}
