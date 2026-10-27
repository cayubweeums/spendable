import { deleteRule, saveRules } from "../../actions";
import { ReadFlash } from "@/components/read-flash";
import { SubmitButton } from "@/components/submit-button";
import { learnRules, listMatchRules } from "@/core/service";
import { RULE_ACTIONS, RULE_FIELDS, RULE_OPS, RULE_SOURCES, RULE_STAGES, ruleSource, type MatchRule } from "@/core/rules";

function Choice({
  name,
  value,
  options,
  label,
}: {
  name: string;
  value: string;
  options: readonly (readonly [string, string])[];
  label: string;
}) {
  return (
    <select name={name} defaultValue={value} aria-label={label}>
      {options.map(([id, text]) => (
        <option key={id} value={id}>
          {text}
        </option>
      ))}
    </select>
  );
}

function ruleRow(rule: MatchRule | null, index: number) {
  const prefix = rule ? "" : "add-";
  const label = rule ? `Rule ${index + 1}` : "New";
  const from = rule ? ruleSource(rule.actionValue) : "";
  return (
    <>
      <td className="tight">
        {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
        <input name={`${prefix}ord`} type="number" defaultValue={rule ? rule.ord : index + 1} aria-label={`${label} order`} />
      </td>
      <td>
        <Choice name={`${prefix}stage`} value={rule?.stage ?? "after"} options={RULE_STAGES} label={`${label} when`} />
      </td>
      <td>
        <Choice name={`${prefix}field`} value={rule?.field ?? "imported_payee"} options={RULE_FIELDS} label={`${label} if`} />
      </td>
      <td>
        <Choice name={`${prefix}op`} value={rule?.op ?? "contains"} options={RULE_OPS} label={`${label} op`} />
      </td>
      <td>
        <input name={`${prefix}value`} defaultValue={rule?.value ?? ""} maxLength={180} aria-label={`${label} value`} placeholder={rule ? undefined : "New"} />
      </td>
      <td>
        <Choice name={`${prefix}action`} value={rule?.action ?? "category"} options={RULE_ACTIONS} label={`${label} set`} />
      </td>
      <td>
        <select name={`${prefix}from`} defaultValue={from} aria-label={`${label} from`}>
          <option value="">—</option>
          {RULE_SOURCES.map(([id, text]) => (
            <option key={id} value={id}>
              {text}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input name={`${prefix}to`} defaultValue={from ? "" : (rule?.actionValue ?? "")} maxLength={280} aria-label={`${label} to`} />
      </td>
    </>
  );
}

export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const query = await searchParams;
  const rules = listMatchRules();
  const learn = learnRules();
  return (
    <>
      <ReadFlash notice={query.notice} />
      <h1 className="question">Rules</h1>
      <form action={saveRules}>
        <div className="ledger-scroll">
          <table className="ledger edit wide">
            <thead>
              <tr>
                <th className="tight">Order</th>
                <th>When</th>
                <th>If</th>
                <th>Op</th>
                <th>Value</th>
                <th>Set</th>
                <th>From</th>
                <th>To</th>
                <th className="tight"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, index) => (
                <tr key={rule.id}>
                  {ruleRow(rule, index)}
                  <td className="tight">
                    <button className="quiet" form={`drop-rule-${index}`} type="submit">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                {ruleRow(null, rules.length)}
                <td className="tight"></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="row">
          <label className="check">
            <input type="checkbox" name="learn" value="1" defaultChecked={learn} />
            Learn
          </label>
          <SubmitButton pending="Saving…">Save</SubmitButton>
        </div>
      </form>
      {rules.map((rule, index) => (
        <form id={`drop-rule-${index}`} action={deleteRule} key={rule.id}>
          <input type="hidden" name="id" value={rule.id} />
        </form>
      ))}
    </>
  );
}
