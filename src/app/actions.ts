"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { publicErrorMessage } from "@/core/errors";
import {
  connect,
  createBill,
  disconnect,
  dollarsToCents,
  listAccounts,
  removeBill,
  restoreDemo,
  sync,
  updateAccount,
  updateSettings,
} from "@/core/service";

function bail(path: string, error: unknown): never {
  redirect(`${path}?error=${encodeURIComponent(publicErrorMessage(error))}`);
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function connectBank(formData: FormData) {
  try {
    await connect(String(formData.get("token") ?? ""));
  } catch (error) {
    bail("/bank", error);
  }
  refresh();
  redirect("/?notice=connected");
}

export async function syncBank() {
  try {
    await sync();
  } catch (error) {
    bail("/", error);
  }
  refresh();
  redirect("/?notice=synced");
}

export async function disconnectBank() {
  disconnect();
  refresh();
  redirect("/bank?notice=disconnected");
}

export async function loadSample() {
  restoreDemo();
  refresh();
  redirect("/?notice=sample");
}

export async function saveAccounts(formData: FormData) {
  try {
    for (const account of listAccounts()) {
      const role = formData.get(`role:${account.id}`);
      if (typeof role !== "string") continue;
      const dueRaw = formData.get(`due:${account.id}`);
      const pay = formData.get(`pay:${account.id}`);
      const minimumRaw = formData.get(`minimum:${account.id}`);
      updateAccount(account.id, {
        role,
        dueDay: typeof dueRaw === "string" && dueRaw !== "" ? Number(dueRaw) : account.role === "credit" ? null : undefined,
        payMode: typeof pay === "string" ? pay : undefined,
        minimumCents:
          typeof minimumRaw === "string" && minimumRaw.trim() !== ""
            ? Math.max(0, dollarsToCents(minimumRaw, "Minimum payment"))
            : undefined,
      });
    }
  } catch (error) {
    bail("/accounts", error);
  }
  refresh();
  redirect("/accounts?notice=saved");
}

export async function addBill(formData: FormData) {
  try {
    createBill({
      name: String(formData.get("name") ?? ""),
      amountCents: dollarsToCents(String(formData.get("amount") ?? ""), "Amount"),
      dueDay: Number(formData.get("dueDay")),
    });
  } catch (error) {
    bail("/bills", error);
  }
  refresh();
  redirect("/bills?notice=saved");
}

export async function deleteBill(formData: FormData) {
  try {
    removeBill(String(formData.get("id") ?? ""));
  } catch (error) {
    bail("/bills", error);
  }
  refresh();
  redirect("/bills?notice=saved");
}

export async function saveSettings(formData: FormData) {
  try {
    const bufferRaw = String(formData.get("buffer") ?? "").trim();
    updateSettings({
      paydayFrequency: String(formData.get("frequency") ?? ""),
      paydayAnchor: String(formData.get("anchor") ?? ""),
      bufferCents: bufferRaw === "" ? 0 : Math.max(0, dollarsToCents(bufferRaw, "Buffer")),
    });
  } catch (error) {
    bail("/", error);
  }
  refresh();
  redirect("/?notice=saved");
}
