import { deleteRule, savePayeeRules, saveRules } from "../../actions";
import { MenuSelect } from "@/components/menu-select";
import { ReadFlash } from "@/components/read-flash";
import { SubmitButton } from "@/components/submit-button";
import { learnRules, listCategories, listMatchRules, listPayees } from "@/core/service";
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
  return <MenuSelect name={name} defaultValue={value} label={label} options={options} />;
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
        <MenuSelect
          name={`${prefix}from`}
          defaultValue={from}
          label={`${label} from`}
          options={[["", "—"], ...RULE_SOURCES]}
        />
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
  const categories = listCategories();
  const openPayees = listPayees().filter(
    (payee) =>
      !rules.some(
        (rule) =>
          rule.action === "category" &&
          rule.op === "is" &&
          rule.field === "payee" &&
          rule.value.toLowerCase() === payee.name.toLowerCase(),
      ),
  );
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
      {openPayees.length > 0 ? (
        <form action={savePayeeRules} className="section">
          <h2 className="kicker">Payees</h2>
          <div className="ledger-scroll">
            <table className="ledger edit">
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {openPayees.map((payee) => (
                  <tr key={payee.name}>
                    <td>{payee.name}</td>
                    <td>
                      <MenuSelect
                        name={`category:${payee.name}`}
                        defaultValue={payee.category}
                        label={`${payee.name} category`}
                        creatable
                        options={[["", ""], ...categories.map((category) => [category.name, category.name] as const)]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SubmitButton pending="Saving…">Save</SubmitButton>
        </form>
      ) : null}
    </>
  );
}
