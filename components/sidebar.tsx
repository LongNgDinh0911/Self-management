"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  PlusIcon,
  LockClosedIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";
import { PROJECT_COLORS } from "@/lib/constants";
import { Logo } from "@/components/logo";

type Project = {
  id: string;
  key: string;
  name: string;
  color: string;
  categoryId: string | null;
};

type Category = {
  id: string;
  name: string;
  color: string;
};

export function Sidebar({
  projects,
  categories,
}: {
  projects: Project[];
  categories: Category[];
}) {
  const router = useRouter();
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const uncategorized = projects.filter((p) => !p.categoryId);

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function moveProject(projectId: string, categoryId: string | null) {
    setOpenMenu(null);
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId }),
    });
    router.refresh();
  }

  async function deleteCategory(category: Category) {
    setOpenMenu(null);
    if (!window.confirm(`Xóa danh mục "${category.name}"? Project bên trong sẽ chuyển về "Chưa phân loại".`)) {
      return;
    }
    await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between px-4 py-4">
        <Logo size={24} />
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <div className="mb-1 flex items-center justify-between px-2 py-1">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Projects
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowNewCategory(true)}
              className="rounded text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 px-1.5 text-[11px]"
              title="Tạo danh mục mới"
            >
              Danh mục
            </button>
            <button
              onClick={() => setShowNewProject(true)}
              className="rounded text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 px-1.5 text-sm"
              title="Tạo project mới"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <nav className="flex flex-col gap-2">
          {categories.map((category) => {
            const categoryProjects = projects.filter((p) => p.categoryId === category.id);
            const isCollapsed = collapsed[category.id];
            return (
              <div key={category.id}>
                <div className="group flex items-center justify-between rounded-md px-2 py-1">
                  <button
                    onClick={() => toggleCollapsed(category.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRightIcon className="h-3 w-3 shrink-0 text-neutral-600" />
                    ) : (
                      <ChevronDownIcon className="h-3 w-3 shrink-0 text-neutral-600" />
                    )}
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="truncate text-xs font-medium text-neutral-300">
                      {category.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-neutral-600">
                      {categoryProjects.length}
                    </span>
                  </button>

                  <div className="relative">
                    <button
                      onClick={() =>
                        setOpenMenu(openMenu === `cat-${category.id}` ? null : `cat-${category.id}`)
                      }
                      className="shrink-0 rounded text-neutral-600 opacity-0 hover:bg-neutral-800 hover:text-neutral-200 group-hover:opacity-100"
                    >
                      <EllipsisHorizontalIcon className="h-4 w-4" />
                    </button>
                    {openMenu === `cat-${category.id}` && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
                        <div className="absolute right-0 top-6 z-50 w-36 rounded-md border border-neutral-800 bg-neutral-900 py-1 shadow-xl">
                          <button
                            onClick={() => {
                              setEditingCategory(category);
                              setOpenMenu(null);
                            }}
                            className="block w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800"
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => deleteCategory(category)}
                            className="block w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-neutral-800"
                          >
                            Xóa
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="ml-3 flex flex-col gap-0.5 border-l border-neutral-900 pl-2">
                    {categoryProjects.map((project) => (
                      <ProjectRow
                        key={project.id}
                        project={project}
                        categories={categories}
                        menuKey={`proj-${project.id}`}
                        openMenu={openMenu}
                        setOpenMenu={setOpenMenu}
                        onMove={moveProject}
                      />
                    ))}
                    {categoryProjects.length === 0 && (
                      <p className="px-2 py-1 text-[11px] text-neutral-700">Trống</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div>
            <div className="flex items-center gap-1.5 px-2 py-1">
              <FolderIcon className="h-3 w-3 shrink-0 text-neutral-700" />
              <span className="truncate text-xs font-medium text-neutral-500">
                Chưa phân loại
              </span>
              <span className="shrink-0 text-[10px] text-neutral-700">{uncategorized.length}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {uncategorized.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  categories={categories}
                  menuKey={`proj-${project.id}`}
                  openMenu={openMenu}
                  setOpenMenu={setOpenMenu}
                  onMove={moveProject}
                />
              ))}
              {uncategorized.length === 0 && (
                <p className="px-2 py-2 text-xs text-neutral-700">Không có project</p>
              )}
            </div>
          </div>

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
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
        >
          <LockClosedIcon className="h-3.5 w-3.5 shrink-0" />
          Lock app
        </button>
      </div>

      {showNewProject && (
        <NewProjectDialog
          onClose={() => setShowNewProject(false)}
          onCreated={(project) => {
            setShowNewProject(false);
            router.push(`/p/${project.key}`);
            router.refresh();
          }}
        />
      )}

      {showNewCategory && (
        <CategoryDialog
          onClose={() => setShowNewCategory(false)}
          onSaved={() => {
            setShowNewCategory(false);
            router.refresh();
          }}
        />
      )}

      {editingCategory && (
        <CategoryDialog
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
          onSaved={() => {
            setEditingCategory(null);
            router.refresh();
          }}
        />
      )}
    </aside>
  );
}

function ProjectRow({
  project,
  categories,
  menuKey,
  openMenu,
  setOpenMenu,
  onMove,
}: {
  project: Project;
  categories: Category[];
  menuKey: string;
  openMenu: string | null;
  setOpenMenu: (key: string | null) => void;
  onMove: (projectId: string, categoryId: string | null) => void;
}) {
  const pathname = usePathname();
  const href = `/p/${project.key}`;
  const active = pathname === href;
  const isOpen = openMenu === menuKey;

  return (
    <div className="group flex items-center gap-1">
      <Link
        href={href}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
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

      <div className="relative">
        <button
          onClick={() => setOpenMenu(isOpen ? null : menuKey)}
          className="shrink-0 rounded text-neutral-600 opacity-0 hover:bg-neutral-800 hover:text-neutral-200 group-hover:opacity-100"
          title="Chuyển danh mục"
        >
          <EllipsisHorizontalIcon className="h-4 w-4" />
        </button>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
            <div className="absolute right-0 top-6 z-50 w-40 rounded-md border border-neutral-800 bg-neutral-900 py-1 shadow-xl">
              <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-neutral-600">
                Chuyển vào...
              </p>
              <button
                onClick={() => onMove(project.id, null)}
                className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-800 ${
                  !project.categoryId ? "text-indigo-400" : "text-neutral-300"
                }`}
              >
                Chưa phân loại
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onMove(project.id, c.id)}
                  className={`flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs hover:bg-neutral-800 ${
                    project.categoryId === c.id ? "text-indigo-400" : "text-neutral-300"
                  }`}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CategoryDialog({
  category,
  onClose,
  onSaved,
}: {
  category?: Category;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? PROJECT_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch(
      category ? `/api/categories/${category.id}` : "/api/categories",
      {
        method: category ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      }
    );

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Không lưu được danh mục");
      return;
    }

    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
      >
        <h2 className="mb-4 text-sm font-semibold text-neutral-100">
          {category ? "Sửa danh mục" : "Tạo danh mục mới"}
        </h2>

        <label className="mb-1 block text-xs text-neutral-400">Tên danh mục</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Vd: Cá nhân"
          className="mb-3 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
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
            disabled={loading || !name.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "Đang lưu..." : category ? "Lưu" : "Tạo"}
          </button>
        </div>
      </form>
    </div>
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
