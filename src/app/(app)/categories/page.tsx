import { deleteCategory, saveCategories } from "../../actions";
import { ReadFlash } from "@/components/read-flash";
import { SubmitButton } from "@/components/submit-button";
import { listCategories } from "@/core/service";

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const query = await searchParams;
  const categories = listCategories();
  return (
    <>
      <ReadFlash notice={query.notice} />
      <h1 className="question">Categories</h1>
      <form action={saveCategories}>
        <div className="ledger-scroll">
        <table className="ledger edit">
          <thead>
            <tr>
              <th className="tight"></th>
              <th>Name</th>
              <th>Group</th>
              <th>Note</th>
              <th className="tight">Hide</th>
              <th className="tight"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category, index) => (
              <tr key={category.name}>
                <td className="tight">
                  <input type="checkbox" name="pick" value={category.name} aria-label={`Select ${category.name}`} />
                </td>
                <td>
                  <input name={`name:${category.name}`} defaultValue={category.name} maxLength={40} aria-label={`${category.name} name`} required />
                </td>
                <td>
                  <input name={`group:${category.name}`} defaultValue={category.group} maxLength={40} aria-label={`${category.name} group`} />
                </td>
                <td>
                  <input name={`note:${category.name}`} defaultValue={category.note} maxLength={280} aria-label={`${category.name} note`} />
                </td>
                <td className="tight">
                  <input type="checkbox" name={`hide:${category.name}`} value="1" defaultChecked={category.hidden} aria-label={`Hide ${category.name}`} />
                </td>
                <td className="tight">
                  <button className="quiet" form={`drop-category-${index}`} type="submit">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td className="tight"></td>
              <td>
                <input name="add" maxLength={40} aria-label="New" placeholder="New" />
              </td>
              <td>
                <input name="add-group" maxLength={40} aria-label="Group" />
              </td>
              <td></td>
              <td className="tight"></td>
              <td className="tight"></td>
            </tr>
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
      {categories.map((category, index) => (
        <form id={`drop-category-${index}`} action={deleteCategory} key={category.name}>
          <input type="hidden" name="name" value={category.name} />
        </form>
      ))}
    </>
  );
}
