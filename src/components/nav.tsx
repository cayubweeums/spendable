"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const links = [
  ["/", "Now"],
  ["/charges", "Charges"],
  ["/accounts", "Accounts"],
  ["/categories", "Categories"],
  ["/payees", "Payees"],
  ["/rules", "Rules"],
  ["/bills", "Bills"],
  ["/reports", "Reports"],
  ["/bank", "Bank"],
] as const;

function pageLinks(path: string) {
  return links.map(([href, label]) => {
    const current = href === "/" ? path === "/" : path.startsWith(href);
    return (
      <Link key={href} href={href} aria-current={current ? "page" : undefined}>
        {label}
      </Link>
    );
  });
}

export function Nav() {
  const path = usePathname();
  const fold = useRef<HTMLDetailsElement>(null);
  const label = links.find(([href]) => (href === "/" ? path === "/" : path.startsWith(href)))?.[1] ?? "Pages";

  useEffect(() => {
    if (fold.current) fold.current.open = false;
  }, [path]);

  return (
    <>
      <details className="nav-fold" ref={fold}>
        <summary>{label}</summary>
        <nav aria-label="Sections">{pageLinks(path)}</nav>
      </details>
      <nav className="nav" aria-label="Sections">
        {pageLinks(path)}
      </nav>
    </>
  );
}
