import { redirect } from "next/navigation";
import { requirePage } from "../auth";
import { needsOnboarding } from "@/core/service";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requirePage();
  if (needsOnboarding()) redirect("/onboarding");
  return children;
}
