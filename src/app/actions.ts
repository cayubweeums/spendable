"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSession, requirePage, writeSession } from "./auth";
import { SpendableError, publicErrorMessage } from "@/core/errors";
import {
  completeOnboarding,
  connect,
  connectionStatus,
  copyCharges,
  createBill,
  createCategory,
  createProjection,
  addUser as createUser,
  changePassword as replacePassword,
  disconnect,
  decodeFilter,
  dollarsToCents,
  editCharges,
  encodeFilter,
  establishPassword,
  issueAccessToken,
  revokeAccessToken,
  importCharges,
  importYnab,
  listAccounts,
  listCategories,
  listPayees,
  mergeCategory,
  mergeCharges,
  mergePayee,
  mustChangePassword,
  needsOnboarding,
  normalizeFilter,
  passwordIsSet,
  removeBill,
  removeCategory,
  removeProjection,
  removeNamedFilter,
  removeMatchRule,
  rulePayee,
  registerUser,
  restoreBackup,
  resetSync,
  restoreDemo,
  saveDisplay,
  saveNamedFilter,
  saveRules as writeRules,
  setAmountsHidden,
  setLearnRules,
  saveSyncSchedule,
  saveTransactionDetails,
  undoEdit,
  signIn,
  sync,
  updateAccount,
  updateCategory,
  updatePayee,
  updateSettings,
} from "@/core/service";
import { ruleSource } from "@/core/rules";
import { ynabName } from "@/core/ynab";
import { MAX_BACKUP_BYTES } from "@/core/zip";
import type { ChargeFilter } from "@/core/service";

async function bail(path: string, error: unknown): Promise<never> {
  const jar = await cookies();
  jar.set("spendable_flash", JSON.stringify({ error: publicErrorMessage(error).slice(0, 280) }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 120,
  });
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.delete("error");
  const query = params.toString();
  redirect(query ? `${pathname}?${query}` : pathname);
}

function applyAccountForm(formData: FormData) {
  for (const account of listAccounts()) {
    const kind = formData.get(`kind:${account.id}`);
    if (typeof kind !== "string") continue;
    const dueRaw = formData.get(`due:${account.id}`);
    const pay = formData.get(`pay:${account.id}`);
    const minimumRaw = formData.get(`minimum:${account.id}`);
    const credit = kind === "credit";
    updateAccount(account.id, {
      kind,
      tracked: formData.get(`track:${account.id}`) === "1",
      dueDay: credit ? (typeof dueRaw === "string" && dueRaw !== "" ? Number(dueRaw) : null) : undefined,
      payMode: credit && typeof pay === "string" ? pay : undefined,
      minimumCents:
        credit && typeof minimumRaw === "string" && minimumRaw.trim() !== ""
          ? Math.max(0, dollarsToCents(minimumRaw, "Minimum payment"))
          : undefined,
      label: typeof formData.get(`label:${account.id}`) === "string" ? String(formData.get(`label:${account.id}`)) : undefined,
      note: typeof formData.get(`note:${account.id}`) === "string" ? String(formData.get(`note:${account.id}`)) : undefined,
    });
  }
}

function refresh() {
  revalidatePath("/", "layout");
}

function stackFromForm(formData: FormData): ChargeFilter[] {
  return formData.getAll("c").flatMap((item) => {
    const filter = decodeFilter(String(item));
    return filter ? [filter] : [];
  });
}

function filterHref(name: string, stack: ChargeFilter[]): string {
  const params = new URLSearchParams();
  if (name.trim()) params.set("name", name.trim());
  for (const filter of stack) params.append("c", encodeFilter(filter));
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export async function openApp(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const first = !passwordIsSet();
  try {
    const token = first
      ? establishPassword(password, String(formData.get("confirm") ?? ""), String(formData.get("name") ?? ""))
      : signIn(password, String(formData.get("name") ?? ""));
    await writeSession(token);
  } catch (error) {
    await bail(first ? "/onboarding?step=user" : "/login", error);
  }
  refresh();
  if (mustChangePassword()) redirect("/password");
  redirect(needsOnboarding() ? "/onboarding?step=bank" : "/");
}

export async function signUp(formData: FormData) {
  try {
    const token = registerUser(String(formData.get("name") ?? ""), String(formData.get("password") ?? ""));
    await writeSession(token);
  } catch (error) {
    await bail("/login", error);
  }
  refresh();
  redirect("/password");
}

export async function changePassword(formData: FormData) {
  await requirePage();
  try {
    replacePassword(String(formData.get("password") ?? ""), String(formData.get("confirm") ?? ""));
  } catch (error) {
    await bail("/password", error);
  }
  refresh();
  redirect(needsOnboarding() ? "/onboarding?step=bank" : "/");
}

export async function issueToken(_state: { name: string; token: string } | null, formData: FormData) {
  await requirePage();
  try {
    const issued = issueAccessToken(String(formData.get("name") ?? ""));
    refresh();
    return issued;
  } catch (error) {
    return await bail("/bank", error);
  }
}

export async function revokeToken(formData: FormData) {
  await requirePage();
  try {
    revokeAccessToken(String(formData.get("name") ?? ""));
  } catch (error) {
    await bail("/bank", error);
  }
  refresh();
  redirect("/bank");
}

export async function addUser(formData: FormData) {
  await requirePage();
  try {
    createUser(String(formData.get("name") ?? ""), String(formData.get("password") ?? ""));
  } catch (error) {
    await bail("/bank", error);
  }
  refresh();
  redirect("/bank");
}

export async function signOut() {
  await clearSession();
  refresh();
  redirect("/login");
}

export async function importBackup(formData: FormData) {
  await requirePage();
  const file = formData.get("backup");
  try {
    if (!(file instanceof File) || file.size === 0) throw new SpendableError("Choose a zip file.", "bad_backup");
    restoreBackup(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    await bail("/bank", error);
  }
  await clearSession();
  refresh();
  redirect(passwordIsSet() ? "/login" : "/onboarding");
}

export async function importFile(formData: FormData) {
  await requirePage();
  const file = formData.get("file");
  try {
    if (!(file instanceof File) || file.size === 0) throw new SpendableError("Choose a file.", "bad_import");
    if (ynabName(file.name)) {
      if (file.size > MAX_BACKUP_BYTES) throw new SpendableError("That file is too big.", "bad_import");
      importYnab(Buffer.from(await file.arrayBuffer()), file.name);
    } else if (file.size > 2_000_000) throw new SpendableError("That file is too big.", "bad_import");
    else importCharges({
      accountId: String(formData.get("account") ?? ""),
      text: await file.text(),
      name: file.name,
      date: String(formData.get("date") ?? ""),
      sign: String(formData.get("sign") ?? ""),
      dateColumn: String(formData.get("dateColumn") ?? ""),
      amountColumn: String(formData.get("amountColumn") ?? ""),
      payeeColumn: String(formData.get("payeeColumn") ?? ""),
    });
  } catch (error) {
    await bail("/bank", error);
  }
  refresh();
  redirect("/?notice=imported");
}

export async function connectBank(formData: FormData) {
  await requirePage();
  try {
    await connect(String(formData.get("token") ?? ""));
  } catch (error) {
    await bail("/bank", error);
  }
  refresh();
  redirect("/?notice=connected");
}

export async function saveSync(formData: FormData) {
  await requirePage();
  const every = formData.get("every");
  const at = formData.get("at");
  try {
    saveSyncSchedule({
      on: formData.get("on") === "1",
      ...(every == null ? {} : { everyHours: Number(every) }),
      ...(at == null ? {} : { at: String(at) }),
    });
  } catch (error) {
    await bail("/bank", error);
  }
  refresh();
  redirect("/bank");
}

export async function hideAmounts(formData: FormData) {
  await requirePage();
  setAmountsHidden(formData.get("hide") === "1");
  const next = String(formData.get("next") ?? "/");
  refresh();
  redirect(next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/");
}

export async function syncBank() {
  await requirePage();
  try {
    await sync();
  } catch (error) {
    await bail("/", error);
  }
  refresh();
  redirect("/?notice=synced");
}

export async function resetBank() {
  await requirePage();
  try {
    await resetSync();
  } catch (error) {
    await bail("/bank", error);
  }
  refresh();
  redirect("/?notice=synced");
}

export async function disconnectBank() {
  await requirePage();
  disconnect();
  refresh();
  redirect("/bank?notice=disconnected");
}

export async function loadSample() {
  await requirePage();
  restoreDemo();
  refresh();
  redirect("/?notice=sample");
}

export async function connectFromOnboarding(formData: FormData) {
  await requirePage();
  let connected = false;
  try {
    await connect(String(formData.get("token") ?? ""));
    connected = true;
  } catch (error) {
    if (!connected) connected = connectionStatus().connected;
    await bail(connected ? "/onboarding?step=accounts" : "/onboarding?step=bank", error);
  }
  refresh();
  redirect("/onboarding?step=accounts");
}

export async function syncFromOnboarding() {
  await requirePage();
  try {
    await sync();
  } catch (error) {
    await bail("/onboarding?step=accounts", error);
  }
  refresh();
  redirect("/onboarding?step=accounts");
}

export async function finishOnboarding(formData: FormData) {
  await requirePage();
  try {
    applyAccountForm(formData);
    completeOnboarding();
  } catch (error) {
    await bail("/onboarding?step=accounts", error);
  }
  refresh();
  redirect("/?notice=connected");
}

export async function saveAccounts(formData: FormData) {
  await requirePage();
  try {
    applyAccountForm(formData);
  } catch (error) {
    await bail("/accounts", error);
  }
  refresh();
  redirect("/accounts?notice=saved");
}

export async function saveCategories(formData: FormData) {
  await requirePage();
  try {
    if (formData.get("intent") === "merge") {
      const picked = formData.getAll("pick").map(String).filter(Boolean);
      const [into, ...rest] = picked;
      if (!into || rest.length === 0) throw new SpendableError("Pick another category.", "bad_category");
      for (const name of rest) mergeCategory(name, into);
    } else {
      const add = String(formData.get("add") ?? "").trim();
      if (add) {
        createCategory(add);
        updateCategory(add, { group: String(formData.get("add-group") ?? "") });
      }
      for (const category of listCategories()) {
        if (formData.get(`name:${category.name}`) == null) continue;
        updateCategory(category.name, {
          name: String(formData.get(`name:${category.name}`) ?? ""),
          group: String(formData.get(`group:${category.name}`) ?? ""),
          note: String(formData.get(`note:${category.name}`) ?? ""),
          hidden: formData.get(`hide:${category.name}`) === "1",
        });
      }
    }
  } catch (error) {
    await bail("/categories", error);
  }
  refresh();
  redirect("/categories");
}

export async function deleteCategory(formData: FormData) {
  await requirePage();
  try {
    removeCategory(String(formData.get("name") ?? ""));
  } catch (error) {
    await bail("/categories", error);
  }
  refresh();
  redirect("/categories");
}

export async function savePayees(formData: FormData) {
  await requirePage();
  try {
    if (formData.get("intent") === "merge") {
      const picked = formData.getAll("pick").map(String).filter(Boolean);
      const [into, ...rest] = picked;
      if (!into || rest.length === 0) throw new SpendableError("Pick another payee.", "bad_payee");
      for (const name of rest) mergePayee(name, into);
    } else {
      for (const payee of listPayees()) {
        if (formData.get(`name:${payee.name}`) == null) continue;
        updatePayee(payee.name, {
          name: String(formData.get(`name:${payee.name}`) ?? ""),
          favorite: formData.get(`favorite:${payee.name}`) === "1",
          category: String(formData.get(`category:${payee.name}`) ?? ""),
        });
      }
    }
  } catch (error) {
    await bail("/payees", error);
  }
  refresh();
  redirect("/payees");
}

export async function batchCharges(formData: FormData) {
  await requirePage();
  const name = String(formData.get("name") ?? "");
  const stack = stackFromForm(formData);
  const ids = formData.getAll("id").map(String);
  try {
    if (formData.get("intent") === "copy") copyCharges(ids);
    else if (formData.get("intent") === "merge") mergeCharges(ids);
    else editCharges(ids, String(formData.get("category") ?? ""));
  } catch (error) {
    await bail(filterHref(name, stack), error);
  }
  refresh();
  redirect(filterHref(name, stack));
}

export async function saveTransaction(formData: FormData) {
  await requirePage();
  try {
    const categoryRaw = String(formData.get("category") ?? "");
    const wantsSplit = categoryRaw === "__split";
    const amounts = formData.getAll("split-amount").map(String);
    const categories = formData.getAll("split-category").map(String);
    saveTransactionDetails({
      id: String(formData.get("id") ?? ""),
      category: wantsSplit ? "__split" : categoryRaw.trim() === "" ? null : categoryRaw,
      contains: String(formData.get("contains") ?? ""),
      remember: formData.get("remember") === "1",
      billable: formData.get("billable") === "1",
      recurring: formData.get("recurring") === "1",
      note: String(formData.get("note") ?? ""),
      tags: String(formData.get("tags") ?? ""),
      splits: wantsSplit ? amounts.map((amount, index) => ({ amount, category: categories[index] ?? "" })) : [],
    });
  } catch (error) {
    await bail("/", error);
  }
  refresh();
  redirect("/?notice=saved");
}

export async function addFilter(formData: FormData) {
  await requirePage();
  const current = stackFromForm(formData);
  const name = String(formData.get("name") ?? "");
  let stack = current;
  try {
    if (current.length >= 8) throw new SpendableError("Eight conditions.", "bad_filter");
    stack = [
      ...current,
      normalizeFilter({
        field: String(formData.get("field") ?? ""),
        op: String(formData.get("op") ?? ""),
        value: String(formData.get("value") ?? ""),
      }),
    ];
  } catch (error) {
    await bail(filterHref(name, current), error);
  }
  redirect(filterHref(name, stack));
}

export async function dropFilter(formData: FormData) {
  await requirePage();
  const current = stackFromForm(formData);
  const name = String(formData.get("name") ?? "");
  const index = Number(formData.get("index"));
  redirect(filterHref(name, current.filter((_, item) => item !== index)));
}

export async function keepFilter(formData: FormData) {
  await requirePage();
  const stack = stackFromForm(formData);
  const name = String(formData.get("name") ?? "");
  let saved = "";
  try {
    saved = saveNamedFilter(name, stack);
  } catch (error) {
    await bail(filterHref(name, stack), error);
  }
  refresh();
  redirect(filterHref(saved, []));
}

export async function forgetFilter(formData: FormData) {
  await requirePage();
  try {
    removeNamedFilter(String(formData.get("name") ?? ""));
  } catch (error) {
    await bail("/", error);
  }
  refresh();
  redirect("/");
}

export async function undoTransaction() {
  await requirePage();
  try {
    undoEdit();
  } catch (error) {
    await bail("/", error);
  }
  refresh();
  redirect("/?notice=undone");
}

export async function addBill(formData: FormData) {
  await requirePage();
  try {
    createBill({
      name: String(formData.get("name") ?? ""),
      amountCents: dollarsToCents(String(formData.get("amount") ?? ""), "Amount"),
      dueDay: Number(formData.get("dueDay")),
    });
  } catch (error) {
    await bail("/bills", error);
  }
  refresh();
  redirect("/bills?notice=saved");
}

export async function deleteBill(formData: FormData) {
  await requirePage();
  try {
    removeBill(String(formData.get("id") ?? ""));
  } catch (error) {
    await bail("/bills", error);
  }
  refresh();
  redirect("/bills?notice=saved");
}

export async function addPlan(formData: FormData) {
  await requirePage();
  try {
    createProjection({
      name: String(formData.get("name") ?? ""),
      amountCents: dollarsToCents(String(formData.get("amount") ?? ""), "Amount"),
      dueDay: Number(formData.get("dueDay")),
      kind: String(formData.get("kind") ?? ""),
      matchText: String(formData.get("match") ?? ""),
    });
  } catch (error) {
    await bail("/bills", error);
  }
  refresh();
  redirect("/bills?notice=saved");
}

export async function removePlan(formData: FormData) {
  await requirePage();
  try {
    removeProjection(String(formData.get("id") ?? ""));
  } catch (error) {
    await bail("/bills", error);
  }
  refresh();
  redirect("/bills?notice=saved");
}

function ruleToValue(action: string, from: string, to: string): string {
  const token = `{{${from}}}`;
  if (
    ruleSource(token) &&
    (action === "notes" || action === "date" || action === "amount" || action === "payee" || action === "cleared")
  ) {
    return token;
  }
  return to;
}

export async function saveRules(formData: FormData) {
  await requirePage();
  try {
    const ids = formData.getAll("id").map(String);
    const rules = ids.flatMap((id, index) => {
      const value = String(formData.getAll("value")[index] ?? "");
      const action = String(formData.getAll("action")[index] ?? "");
      const actionValue = ruleToValue(action, String(formData.getAll("from")[index] ?? ""), String(formData.getAll("to")[index] ?? ""));
      if (!value.trim() || !actionValue.trim()) return [];
      return [
        {
          id,
          ord: Number(formData.getAll("ord")[index]),
          stage: String(formData.getAll("stage")[index] ?? ""),
          field: String(formData.getAll("field")[index] ?? ""),
          op: String(formData.getAll("op")[index] ?? ""),
          value,
          action,
          actionValue,
        },
      ];
    });
    const addValue = String(formData.get("add-value") ?? "");
    const addAction = String(formData.get("add-action") ?? "");
    const addTo = ruleToValue(addAction, String(formData.get("add-from") ?? ""), String(formData.get("add-to") ?? ""));
    if (addValue.trim() && addTo.trim()) {
      rules.push({
        id: "",
        ord: Number(formData.get("add-ord")),
        stage: String(formData.get("add-stage") ?? ""),
        field: String(formData.get("add-field") ?? ""),
        op: String(formData.get("add-op") ?? ""),
        value: addValue,
        action: addAction,
        actionValue: addTo,
      });
    }
    writeRules(rules);
    setLearnRules(formData.get("learn") === "1");
  } catch (error) {
    await bail("/rules", error);
  }
  refresh();
  redirect("/rules");
}

export async function savePayeeRules(formData: FormData) {
  await requirePage();
  try {
    for (const payee of listPayees()) {
      const category = String(formData.get(`category:${payee.name}`) ?? "").trim();
      if (!category) continue;
      rulePayee(payee.name, category);
    }
  } catch (error) {
    await bail("/rules", error);
  }
  refresh();
  redirect("/rules");
}

export async function deleteRule(formData: FormData) {
  await requirePage();
  try {
    removeMatchRule(String(formData.get("id") ?? ""));
  } catch (error) {
    await bail("/rules", error);
  }
  refresh();
  redirect("/rules");
}

export async function saveSettings(formData: FormData) {
  await requirePage();
  try {
    saveDisplay({
      date: String(formData.get("date") ?? "mdy"),
      number: String(formData.get("number") ?? "us"),
      weekStart: String(formData.get("week") ?? "0"),
      hideCents: formData.get("cents") !== "1",
    });
    const bufferRaw = String(formData.get("buffer") ?? "").trim();
    updateSettings({
      paydayFrequency: String(formData.get("frequency") ?? ""),
      paydayAnchor: String(formData.get("anchor") ?? ""),
      paydayDays: String(formData.get("days") ?? ""),
      bufferCents: bufferRaw === "" ? 0 : Math.max(0, dollarsToCents(bufferRaw, "Buffer")),
    });
  } catch (error) {
    await bail("/", error);
  }
  refresh();
  redirect("/?notice=saved");
}
