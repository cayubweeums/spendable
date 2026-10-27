"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/", "Now"],
  ["/accounts", "Accounts"],
  ["/bills", "Bills"],
  ["/bank", "Bank"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Sections">
      {links.map(([href, label]) => {
        const current = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={current ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
