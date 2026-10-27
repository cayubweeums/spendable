import { deleteCategory, saveCategories } from "../../actions";
import { ReadFlash } from "@/components/read-flash";
import { SubmitButton } from "@/components/submit-button";
import { listCategories } from "@/core/service";
import type { Category } from "@/core/types";

function grouped(categories: Category[]): { name: string; items: Category[] }[] {
  const groups: { name: string; items: Category[] }[] = [];
  for (const category of categories) {
    const last = groups.at(-1);
    if (!last || last.name !== category.group) groups.push({ name: category.group, items: [category] });
    else last.items.push(category);
  }
  return groups;
}

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
      {grouped(categories).map((group) => (
        <section className="section stack" key={group.name || "none"}>
          {group.name ? <h2>{group.name}</h2> : null}
          {group.items.map((category) => (
            <fieldset className="account" key={category.name}>
              <legend>{category.name}</legend>
              <label>
                Name
                <input form="categories" name={`name:${category.name}`} defaultValue={category.name} maxLength={40} required />
              </label>
              <label>
                Group
                <input form="categories" name={`group:${category.name}`} defaultValue={category.group} maxLength={40} />
              </label>
              <label>
                Note
                <input form="categories" name={`note:${category.name}`} defaultValue={category.note} maxLength={280} />
              </label>
              <label className="check">
                <input form="categories" type="checkbox" name={`hide:${category.name}`} value="1" defaultChecked={category.hidden} />
                Hide
              </label>
              <label>
                Merge into
                <select form="categories" name={`merge:${category.name}`} defaultValue="">
                  <option value=""></option>
                  {categories
                    .filter((other) => other.name !== category.name)
                    .map((other) => (
                      <option key={other.name} value={other.name}>
                        {other.name}
                      </option>
                    ))}
                </select>
              </label>
              <form action={deleteCategory}>
                <button className="quiet" name="name" value={category.name} type="submit">
                  Delete
                </button>
              </form>
            </fieldset>
          ))}
        </section>
      ))}
      <form id="categories" className="section stack" action={saveCategories}>
        <label>
          New
          <input name="add" maxLength={40} />
        </label>
        <SubmitButton pending="Saving…">Save</SubmitButton>
      </form>
    </>
  );
}
