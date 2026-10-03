"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const INBUCKET_URL = process.env.NEXT_PUBLIC_INBUCKET_URL;

export function LoginForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialError === "invalid_link" ? "링크가 유효하지 않거나 만료되었습니다. 다시 요청해 주세요." : null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
        <p className="font-medium">{email}로 로그인 링크를 보냈어요.</p>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          메일의 링크를 누르면 로그인됩니다. 비밀번호는 쓰지 않아요.
        </p>
        {INBUCKET_URL && (
          <a
            href={INBUCKET_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-2 rounded-md border border-[var(--color-brand-300)] px-4 py-2 text-sm font-medium text-[var(--color-brand-700)]"
          >
            로컬 메일함(Mailpit) 열기
          </a>
        )}
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="text-sm text-[var(--color-muted-foreground)] underline"
        >
          다른 이메일로 다시 보내기
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        학교 이메일
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        placeholder="name@smu.ac.kr"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:outline focus:outline-2 focus:outline-[var(--color-brand-500)]"
      />
      {errorMessage && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {errorMessage}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {status === "sending" ? "보내는 중..." : "매직링크 보내기"}
      </button>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        비밀번호가 없는 이메일 매직링크/OTP 로그인입니다. 학교 이메일 소유 확인과 재학 여부 확인은
        별개이며, 소속은 온보딩에서 자기기입으로 입력합니다.
      </p>
    </form>
  );
}
