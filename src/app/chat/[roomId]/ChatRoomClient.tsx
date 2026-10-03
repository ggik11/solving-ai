"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LinkifiedText } from "@/components/LinkifiedText";
import type { ChatMessage } from "@/lib/supabase/types";
import { loadNewerMessagesAction, loadOlderMessagesAction, markChatReadAction, sendChatMessageAction } from "./actions";

type MessageStatus = "sending" | "sent" | "failed";

interface DisplayMessage extends ChatMessage {
  status?: MessageStatus;
}

// supabase/migrations/20261003161000의 chat_messages_broadcast 트리거가 보내는 모양
// (realtime.broadcast_changes가 NEW 행을 jsonb로 그대로 직렬화한다).
interface ChatBroadcastPayload {
  record: ChatMessage;
  operation: string;
}

const HEARTBEAT_INTERVAL_MS = 15_000;

function newClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ChatRoomClient({
  roomId,
  currentUserId,
  initialMessages,
  initialHasMoreOlder,
}: {
  roomId: string;
  currentUserId: string;
  initialMessages: ChatMessage[];
  initialHasMoreOlder: boolean;
}) {
  const [messages, setMessages] = useState<DisplayMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(initialHasMoreOlder);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const latestMessageIdRef = useRef<string | null>(initialMessages.at(-1)?.id ?? null);
  const latestCreatedAtRef = useRef<string | null>(initialMessages.at(-1)?.created_at ?? null);
  const subscribedRef = useRef(true);

  function mergeMessages(prev: DisplayMessage[], incoming: ChatMessage[]): DisplayMessage[] {
    let next = prev;
    for (const row of incoming) {
      const matchIndex = next.findIndex(
        (m) => row.client_message_id && m.client_message_id === row.client_message_id && m.sender_id === row.sender_id
      );
      if (matchIndex >= 0) {
        next = next.slice();
        next[matchIndex] = { ...row, status: "sent" };
        continue;
      }
      if (next.some((m) => m.id === row.id)) continue;
      next = [...next, { ...row, status: "sent" }];
    }
    if (incoming.length > 0) {
      const last = incoming[incoming.length - 1];
      latestMessageIdRef.current = last.id;
      latestCreatedAtRef.current = last.created_at;
    }
    return next;
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const handleReadResult = useCallback((result: { ok: true } | { ok: false; code: string; error: string }) => {
    if (!result.ok && result.code === "NOT_A_MEMBER") {
      subscribedRef.current = false;
      setForbidden(true);
    }
  }, []);

  const heartbeat = useCallback(() => {
    if (!subscribedRef.current || document.visibilityState !== "visible") return;
    void markChatReadAction(roomId, latestMessageIdRef.current).then(handleReadResult);
  }, [roomId, handleReadResult]);

  useEffect(() => {
    // 초기 진입 + 주기적 하트비트: "현재 보고 있음" 신호로도 쓰여 새 메시지 알림 생성을 막는다.
    heartbeat();
    const interval = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") heartbeat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [heartbeat]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat_room:${roomId}`, { config: { private: true } })
      .on<ChatBroadcastPayload>(
        "broadcast",
        { event: "new_message" },
        ({ payload }) => {
          if (!subscribedRef.current) return;
          const row = payload.record;
          setMessages((prev) => mergeMessages(prev, [row]));

          if (document.visibilityState === "visible") {
            void markChatReadAction(roomId, row.id).then(handleReadResult);
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Broadcast는 과거 이벤트를 재생하지 않는다 — 구독이 (재)연결되는 틈에 놓친 메시지가
          // 있을 수 있으니 마지막으로 알고 있는 메시지 이후를 한 번 따라잡는다.
          void loadNewerMessagesAction(roomId, latestCreatedAtRef.current).then((result) => {
            if (result.ok && result.messages.length > 0) {
              setMessages((prev) => mergeMessages(prev, result.messages));
            }
          });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, handleReadResult]);

  async function handleSend() {
    const body = input.trim();
    if (!body || isSending) return;

    const clientMessageId = newClientMessageId();
    const optimistic: DisplayMessage = {
      id: `temp:${clientMessageId}`,
      chat_room_id: roomId,
      sender_id: currentUserId,
      message_type: "text",
      body,
      client_message_id: clientMessageId,
      created_at: new Date().toISOString(),
      status: "sending",
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    await submitMessage(clientMessageId, body);
  }

  async function submitMessage(clientMessageId: string, body: string) {
    setIsSending(true);
    const result = await sendChatMessageAction(roomId, clientMessageId, body);
    setIsSending(false);

    setMessages((prev) => {
      const index = prev.findIndex((m) => m.client_message_id === clientMessageId);
      if (index < 0) return prev;
      const copy = prev.slice();
      if (result.ok) {
        latestMessageIdRef.current = result.id;
        latestCreatedAtRef.current = copy[index].created_at;
        copy[index] = { ...copy[index], id: result.id, status: "sent" };
      } else {
        copy[index] = { ...copy[index], status: "failed" };
      }
      return copy;
    });
  }

  async function handleRetry(message: DisplayMessage) {
    if (!message.client_message_id || isSending) return;
    setMessages((prev) =>
      prev.map((m) => (m.client_message_id === message.client_message_id ? { ...m, status: "sending" } : m))
    );
    await submitMessage(message.client_message_id, message.body);
  }

  async function handleLoadOlder() {
    const oldest = messages[0];
    if (!oldest || isLoadingOlder) return;
    setIsLoadingOlder(true);
    const result = await loadOlderMessagesAction(roomId, oldest.created_at);
    setIsLoadingOlder(false);
    if (result.ok) {
      setHasMoreOlder(result.messages.length > 0 && result.messages.length === 30);
      if (result.messages.length > 0) {
        setMessages((prev) => [...result.messages, ...prev]);
      } else {
        setHasMoreOlder(false);
      }
    }
  }

  if (forbidden) {
    return (
      <p role="alert" className="rounded-md bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
        이 채팅방에 더 이상 접근할 수 없어요. 파티에서 탈퇴했거나 제외되었을 수 있어요.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {hasMoreOlder && (
        <button
          type="button"
          onClick={handleLoadOlder}
          disabled={isLoadingOlder}
          className="self-center rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium disabled:opacity-60"
        >
          {isLoadingOlder ? "불러오는 중..." : "이전 메시지 더 보기"}
        </button>
      )}

      <ul className="flex flex-col gap-2">
        {messages.map((m) => (
          <li key={m.id}>
            <MessageBubble message={m} isMine={m.sender_id === currentUserId} onRetry={handleRetry} />
          </li>
        ))}
        <div ref={bottomRef} />
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="sticky bottom-16 flex items-end gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="메시지를 입력하세요"
          aria-label="메시지 입력"
          className="flex-1 resize-none rounded-md border border-[var(--color-border)] bg-[var(--background)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={isSending || input.trim().length === 0}
          className="shrink-0 rounded-md bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          전송
        </button>
      </form>
    </div>
  );
}

function MessageBubble({
  message,
  isMine,
  onRetry,
}: {
  message: DisplayMessage;
  isMine: boolean;
  onRetry: (message: DisplayMessage) => void;
}) {
  if (message.message_type === "system") {
    return (
      <p className="my-1 text-center text-xs text-[var(--color-muted-foreground)]">{message.body}</p>
    );
  }

  return (
    <div className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          isMine ? "bg-[var(--color-brand-600)] text-white" : "bg-[var(--color-surface)] border border-[var(--color-border)]"
        }`}
      >
        <LinkifiedText text={message.body} />
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--color-muted-foreground)]">
        {message.status === "sending" && <span>전송 중...</span>}
        {message.status === "failed" && (
          <>
            <span className="text-[var(--color-danger)]">전송 실패</span>
            <button type="button" onClick={() => onRetry(message)} className="underline">
              재시도
            </button>
          </>
        )}
      </div>
    </div>
  );
}
