"use client";

import { Suspense, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitPin() {
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Đăng nhập thất bại");
      setPin("");
      return;
    }

    router.replace(searchParams.get("next") || "/");
    router.refresh();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submitPin();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xs rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl"
      >
        <h1 className="mb-1 text-lg font-semibold text-neutral-100">
          Self Management
        </h1>
        <p className="mb-6 text-sm text-neutral-400">Nhập PIN để mở khóa</p>

        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!loading && pin.length > 0) submitPin();
            }
          }}
          placeholder="••••••"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-center text-lg tracking-widest text-neutral-100 outline-none focus:border-indigo-500"
        />

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading || pin.length === 0}
          className="mt-4 w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? "Đang mở..." : "Mở khóa"}
        </button>
      </form>
    </div>
  );
}
