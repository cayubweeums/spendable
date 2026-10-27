import { savePayees } from "../../actions";
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
        {payees.map((payee) => (
          <fieldset className="account" key={payee.name}>
            <legend>{payee.name}</legend>
            <label>
              Name
              <input name={`name:${payee.name}`} defaultValue={payee.name} maxLength={180} required />
            </label>
            <label className="check">
              <input type="checkbox" name={`favorite:${payee.name}`} value="1" defaultChecked={payee.favorite} />
              Favorite
            </label>
            <label>
              Category
              <select name={`category:${payee.name}`} defaultValue={payee.category}>
                <option value=""></option>
                {categories.map((category) => (
                  <option key={category.name} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Merge into
              <select name={`merge:${payee.name}`} defaultValue="">
                <option value=""></option>
                {payees
                  .filter((other) => other.name !== payee.name)
                  .map((other) => (
                    <option key={other.name} value={other.name}>
                      {other.name}
                    </option>
                  ))}
              </select>
            </label>
          </fieldset>
        ))}
        <SubmitButton pending="Saving…">Save</SubmitButton>
      </form>
    </>
  );
}
