"use client";

import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  h1: (props) => <h1 className="mb-3 mt-5 text-xl font-semibold text-neutral-100" {...props} />,
  h2: (props) => <h2 className="mb-2 mt-4 text-lg font-semibold text-neutral-100" {...props} />,
  h3: (props) => <h3 className="mb-2 mt-3 text-base font-semibold text-neutral-100" {...props} />,
  p: (props) => <p className="mb-3 leading-relaxed text-neutral-200" {...props} />,
  ul: (props) => <ul className="mb-3 list-disc space-y-1 pl-5 text-neutral-200" {...props} />,
  ol: (props) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-neutral-200" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  a: (props) => (
    <a className="text-indigo-400 hover:underline" target="_blank" rel="noreferrer" {...props} />
  ),
  strong: (props) => <strong className="font-semibold text-neutral-100" {...props} />,
  code: (props) => (
    <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[0.85em] text-indigo-300" {...props} />
  ),
  pre: (props) => (
    <pre className="mb-3 overflow-x-auto rounded-md bg-neutral-800 p-3 text-xs text-neutral-200" {...props} />
  ),
  blockquote: (props) => (
    <blockquote
      className="mb-3 border-l-2 border-neutral-700 pl-3 italic text-neutral-400"
      {...props}
    />
  ),
  hr: (props) => <hr className="my-4 border-neutral-800" {...props} />,
  table: (props) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: (props) => (
    <th className="border border-neutral-700 bg-neutral-800 px-2 py-1 text-left text-neutral-200" {...props} />
  ),
  td: (props) => <td className="border border-neutral-800 px-2 py-1 text-neutral-300" {...props} />,
};

export function MarkdownView({
  value,
  minHeight,
  emptyText = "Chưa có nội dung.",
}: {
  value: string;
  minHeight?: string;
  emptyText?: string;
}) {
  return (
    <div style={minHeight ? { minHeight } : undefined}>
      {value.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {value}
        </ReactMarkdown>
      ) : (
        <p className="text-sm text-neutral-600">{emptyText}</p>
      )}
    </div>
  );
}

export function MarkdownEditor({
  value,
  onChange,
  rows = 10,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [mode, setMode] = useState<"write" | "preview">("write");

  return (
    <div className="overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
      <div className="flex items-center gap-1 border-b border-neutral-700 px-1.5 py-1">
        <button
          type="button"
          onClick={() => setMode("write")}
          className={`rounded px-2 py-1 text-xs font-medium transition ${
            mode === "write" ? "bg-neutral-700 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Viết
        </button>
        <button
          type="button"
          onClick={() => setMode("preview")}
          className={`rounded px-2 py-1 text-xs font-medium transition ${
            mode === "preview" ? "bg-neutral-700 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Xem trước
        </button>
        <span className="ml-auto pr-1 text-[11px] text-neutral-600">Markdown</span>
      </div>

      {mode === "write" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full resize-y bg-transparent px-3 py-2.5 font-mono text-sm text-neutral-100 outline-none placeholder:text-neutral-600"
        />
      ) : (
        <div className="px-3 py-2.5" style={{ minHeight: `${rows * 1.6}em` }}>
          <MarkdownView value={value} />
        </div>
      )}
    </div>
  );
}
