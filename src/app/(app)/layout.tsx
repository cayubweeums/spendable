import { redirect } from "next/navigation";
import { needsOnboarding } from "@/core/service";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (needsOnboarding()) redirect("/onboarding");
  return children;
}
