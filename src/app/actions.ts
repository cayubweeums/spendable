"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSession, requirePage, writeSession } from "./auth";
import { publicErrorMessage } from "@/core/errors";
import {
  completeOnboarding,
  connect,
  connectionStatus,
  createBill,
  disconnect,
  dollarsToCents,
  establishPassword,
  listAccounts,
  needsOnboarding,
  passwordIsSet,
  removeBill,
  restoreDemo,
  saveTransactionDetails,
  signIn,
  sync,
  updateAccount,
  updateSettings,
} from "@/core/service";

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
    });
  }
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function openApp(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const first = !passwordIsSet();
  try {
    const token = first ? establishPassword(password, String(formData.get("confirm") ?? "")) : signIn(password);
    await writeSession(token);
  } catch (error) {
    await bail(first ? "/onboarding?step=user" : "/login", error);
  }
  refresh();
  redirect(needsOnboarding() ? "/onboarding?step=bank" : "/");
}

export async function signOut() {
  await clearSession();
  refresh();
  redirect("/login");
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

export async function saveTransaction(formData: FormData) {
  await requirePage();
  try {
    const categoryRaw = String(formData.get("category") ?? "");
    saveTransactionDetails({
      id: String(formData.get("id") ?? ""),
      category: categoryRaw.trim() === "" ? null : categoryRaw,
      contains: String(formData.get("contains") ?? ""),
      remember: formData.get("remember") === "1",
      billable: formData.get("billable") === "1",
      recurring: formData.get("recurring") === "1",
    });
  } catch (error) {
    await bail("/", error);
  }
  refresh();
  redirect("/?notice=saved");
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

export async function saveSettings(formData: FormData) {
  await requirePage();
  try {
    const bufferRaw = String(formData.get("buffer") ?? "").trim();
    updateSettings({
      paydayFrequency: String(formData.get("frequency") ?? ""),
      paydayAnchor: String(formData.get("anchor") ?? ""),
      bufferCents: bufferRaw === "" ? 0 : Math.max(0, dollarsToCents(bufferRaw, "Buffer")),
    });
  } catch (error) {
    await bail("/", error);
  }
  refresh();
  redirect("/?notice=saved");
}
