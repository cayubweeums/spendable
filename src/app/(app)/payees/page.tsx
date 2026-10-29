import { savePayees } from "../../actions";
import { MenuSelect } from "@/components/menu-select";
import { ReadFlash } from "@/components/read-flash";
import { SubmitButton } from "@/components/submit-button";
import { listCategories, listPayees } from "@/core/service";

export default async function PayeesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const query = await searchParams;
  const payees = listPayees();
  const categories = listCategories();
  return (
    <>
      <ReadFlash notice={query.notice} />
      <h1 className="question">Payees</h1>
      <form action={savePayees}>
        <div className="ledger-scroll">
        <table className="ledger edit">
          <thead>
            <tr>
              <th className="tight"></th>
              <th>Name</th>
              <th className="tight">Favorite</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>
            {payees.map((payee) => (
              <tr key={payee.name}>
                <td className="tight">
                  <input type="checkbox" name="pick" value={payee.name} aria-label={`Select ${payee.name}`} />
                </td>
                <td>
                  <input name={`name:${payee.name}`} defaultValue={payee.name} maxLength={180} aria-label={`${payee.name} name`} required />
                </td>
                <td className="tight">
                  <input type="checkbox" name={`favorite:${payee.name}`} value="1" defaultChecked={payee.favorite} aria-label={`Favorite ${payee.name}`} />
                </td>
                <td>
                  <select name={`category:${payee.name}`} defaultValue={payee.category} aria-label={`${payee.name} category`}>
                    <option value=""></option>
                    {categories.map((category) => (
                      <option key={category.name} value={category.name}>
                    creatable
                        {category.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="row">
          <button className="quiet" name="intent" value="merge" type="submit">
            Merge
          </button>
          <SubmitButton pending="Saving…">Save</SubmitButton>
        </div>
      </form>
    </>
  );
}
