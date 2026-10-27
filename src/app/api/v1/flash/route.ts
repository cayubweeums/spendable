import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE() {
  const jar = await cookies();
  jar.delete("spendable_flash");
  return new Response(null, { status: 204 });
}
