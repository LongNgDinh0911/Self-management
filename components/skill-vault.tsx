"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { MarkdownEditor } from "@/components/markdown-editor";
import type { Skill } from "@/app/generated/prisma/client";

export function SkillVault({ initialSkills }: { initialSkills: Skill[] }) {
  const [skills, setSkills] = useState(initialSkills);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = skills.find((s) => s.id === selectedId) ?? null;

  function handleCreated(skill: Skill) {
    setSkills((prev) => [...prev, skill].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedId(skill.id);
    setCreating(false);
  }

  function handleUpdated(skill: Skill) {
    setSkills((prev) => prev.map((s) => (s.id === skill.id ? skill : s)));
  }

  function handleDeleted(id: string) {
    setSkills((prev) => prev.filter((s) => s.id !== id));
    setSelectedId(null);
  }

  return (
    <div className="flex gap-5">
      <div className="w-64 shrink-0">
        <button
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
          }}
          className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Skill mới
        </button>

        <div className="flex flex-col gap-1">
          {skills.map((skill) => (
            <button
              key={skill.id}
              onClick={() => {
                setSelectedId(skill.id);
                setCreating(false);
              }}
              className={`rounded-md px-2.5 py-2 text-left text-sm ${
                selectedId === skill.id
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
              }`}
            >
              <p className="truncate font-mono text-xs text-indigo-400">{skill.name}</p>
              {skill.description && (
                <p className="mt-0.5 truncate text-xs text-neutral-500">{skill.description}</p>
              )}
            </button>
          ))}
          {skills.length === 0 && !creating && (
            <p className="px-2.5 py-2 text-xs text-neutral-600">Chưa có skill nào.</p>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {creating ? (
          <NewSkillForm onCreated={handleCreated} onCancel={() => setCreating(false)} />
        ) : selected ? (
          <SkillEditor key={selected.id} skill={selected} onUpdated={handleUpdated} onDeleted={handleDeleted} />
        ) : (
          <p className="text-sm text-neutral-600">Chọn 1 skill để xem/sửa, hoặc tạo skill mới.</p>
        )}
      </div>
    </div>
  );
}

function NewSkillForm({
  onCreated,
  onCancel,
}: {
  onCreated: (skill: Skill) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, content }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Không tạo được skill");
      return;
    }
    onCreated(await res.json());
  }

  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold text-neutral-100">Skill mới</h2>

      <label className="mb-1 block text-xs text-neutral-400">
        Tên (slug, chỉ chữ thường/số/gạch ngang — dùng làm thư mục .claude/skills/&lt;tên&gt;/)
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value.toLowerCase())}
        placeholder="vd: clone-jira-ticket"
        className="mb-3 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 font-mono text-sm text-neutral-100 outline-none focus:border-indigo-500"
      />

      <label className="mb-1 block text-xs text-neutral-400">Mô tả ngắn</label>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="1 câu mô tả skill này làm gì"
        className="mb-3 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
      />

      <label className="mb-1 block text-xs text-neutral-400">Nội dung (SKILL.md)</label>
      <MarkdownEditor value={content} onChange={setContent} rows={16} placeholder="Hướng dẫn chi tiết cho skill này..." />

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={handleCreate}
          disabled={saving || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Đang tạo..." : "Tạo skill"}
        </button>
        <button onClick={onCancel} className="text-sm text-neutral-500 hover:text-neutral-300">
          Hủy
        </button>
      </div>
    </div>
  );
}

function SkillEditor({
  skill,
  onUpdated,
  onDeleted,
}: {
  skill: Skill;
  onUpdated: (skill: Skill) => void;
  onDeleted: (id: string) => void;
}) {
  const [description, setDescription] = useState(skill.description);
  const [content, setContent] = useState(skill.content);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/skills/${skill.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, content }),
    });
    setSaving(false);
    if (res.ok) {
      onUpdated(await res.json());
      setSaved(true);
    }
  }

  async function handleDelete() {
    if (!confirm(`Xóa skill "${skill.name}"? Các project/step đang dùng sẽ mất tham chiếu này.`)) return;
    const res = await fetch(`/api/skills/${skill.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(skill.id);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-mono text-sm font-semibold text-indigo-400">{skill.name}</h2>
        <button onClick={handleDelete} className="text-sm text-red-400 hover:text-red-300">
          Xóa skill
        </button>
      </div>

      <label className="mb-1 block text-xs text-neutral-400">Mô tả ngắn</label>
      <input
        value={description}
        onChange={(e) => {
          setDescription(e.target.value);
          setSaved(false);
        }}
        className="mb-3 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500"
      />

      <label className="mb-1 block text-xs text-neutral-400">Nội dung (SKILL.md)</label>
      <MarkdownEditor
        value={content}
        onChange={(v) => {
          setContent(v);
          setSaved(false);
        }}
        rows={18}
      />

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Đang lưu..." : "Lưu"}
        </button>
        {saved && <span className="text-xs text-emerald-400">Đã lưu</span>}
      </div>
    </div>
  );
}
