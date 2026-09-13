"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectHeader({
  project,
}: {
  project: { key: string; name: string; color: string };
}) {
  const pathname = usePathname();
  const base = `/p/${project.key}`;

  const tabs = [
    { label: "Board", href: base },
    { label: "Workflows", href: `${base}/workflows` },
    { label: "Settings", href: `${base}/settings` },
  ];

  return (
    <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <h1 className="text-sm font-semibold text-neutral-100">{project.name}</h1>
          <span className="text-xs text-neutral-500">{project.key}</span>
        </div>

        <nav className="flex items-center gap-1">
          {tabs.map((tab) => {
            const active =
              tab.href === base ? pathname === base : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-md px-2.5 py-1 text-xs transition ${
                  active
                    ? "bg-neutral-800 text-neutral-100"
                    : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
