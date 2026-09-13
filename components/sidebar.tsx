"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { PROJECT_COLORS } from "@/lib/constants";

type Project = {
  id: string;
  key: string;
  name: string;
  color: string;
};

export function Sidebar({ projects }: { projects: Project[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between px-4 py-4">
        <span className="text-sm font-semibold text-neutral-100">
          Self Management
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <div className="mb-1 flex items-center justify-between px-2 py-1">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Projects
          </span>
          <button
            onClick={() => setShowNew(true)}
            className="rounded text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 px-1.5 text-sm"
            title="Tạo project mới"
          >
            +
          </button>
        </div>

        <nav className="flex flex-col gap-0.5">
          {projects.map((project) => {
            const href = `/p/${project.key}`;
            const active = pathname === href;
            return (
              <Link
                key={project.id}
                href={href}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
                  active
                    ? "bg-neutral-800 text-neutral-100"
                    : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <span className="truncate">{project.name}</span>
              </Link>
            );
          })}
          {projects.length === 0 && (
            <p className="px-2 py-2 text-xs text-neutral-600">
              Chưa có project nào
            </p>
          )}
        </nav>
      </div>

      <div className="border-t border-neutral-800 p-3">
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.replace("/login");
            router.refresh();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 shrink-0"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Lock app
        </button>
      </div>

      {showNew && (
        <NewProjectDialog
          onClose={() => setShowNew(false)}
          onCreated={(project) => {
            setShowNew(false);
            router.push(`/p/${project.key}`);
            router.refresh();
          }}
        />
      )}
    </aside>
  );
}

function NewProjectDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (project: { key: string }) => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, key, color }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Không tạo được project");
      return;
    }

    onCreated(await res.json());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
      >
        <h2 className="mb-4 text-sm font-semibold text-neutral-100">
          Tạo project mới
        </h2>

        <label className="mb-1 block text-xs text-neutral-400">Tên project</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Vd: Cá nhân"
          className="mb-3 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
        />

        <label className="mb-1 block text-xs text-neutral-400">
          Mã (2-6 ký tự, dùng làm prefix mã task)
        </label>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          placeholder="Vd: PER"
          maxLength={6}
          className="mb-3 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm uppercase text-neutral-100 outline-none focus:border-indigo-500"
        />

        <label className="mb-1 block text-xs text-neutral-400">Màu</label>
        <div className="mb-4 flex gap-2">
          {PROJECT_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full ${
                color === c ? "ring-2 ring-offset-2 ring-offset-neutral-900 ring-neutral-200" : ""
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={loading || !name || !key}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "Đang tạo..." : "Tạo"}
          </button>
        </div>
      </form>
    </div>
  );
}
