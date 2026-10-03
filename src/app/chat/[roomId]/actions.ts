"use server";

import { createClient } from "@/lib/supabase/server";
import { friendlyError, parseDbError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/supabase/types";

const PAGE_SIZE = 30;

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendChatMessageAction(
  roomId: string,
  clientMessageId: string,
  body: string
): Promise<SendResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_chat_message", {
    p_chat_room_id: roomId,
    p_client_message_id: clientMessageId,
    p_body: body,
  });
  if (error || !data) {
    return { ok: false, error: friendlyError(error, "메시지 전송에 실패했습니다.") };
  }
  return { ok: true, id: data as string };
}

export type MarkReadResult = { ok: true } | { ok: false; code: string; error: string };

export async function markChatReadAction(
  roomId: string,
  lastReadMessageId: string | null
): Promise<MarkReadResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_chat_read", {
    p_chat_room_id: roomId,
    p_last_read_message_id: lastReadMessageId,
  });
  if (error) {
    const { code, message } = parseDbError(error, "읽음 처리에 실패했습니다.");
    return { ok: false, code, error: message };
  }
  return { ok: true };
}

export type LoadMessagesResult = { ok: true; messages: ChatMessage[] } | { ok: false; error: string };

export async function loadOlderMessagesAction(roomId: string, beforeIso: string): Promise<LoadMessagesResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, chat_room_id, sender_id, message_type, body, client_message_id, created_at")
    .eq("chat_room_id", roomId)
    .lt("created_at", beforeIso)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE)
    .returns<ChatMessage[]>();

  if (error) {
    return { ok: false, error: friendlyError(error, "이전 메시지를 불러오지 못했습니다.") };
  }
  return { ok: true, messages: data ? data.slice().reverse() : [] };
}

/**
 * Realtime 구독이 (재)연결되는 순간과 메시지가 그 사이에 전송되는 순간 사이에는 짧은 틈이 있을 수
 * 있다 — Broadcast는 과거 이벤트를 재생하지 않으므로, 구독이 SUBSCRIBED 상태가 될 때마다 마지막으로
 * 알고 있는 메시지 이후에 놓친 메시지가 있는지 이 함수로 따라잡는다.
 */
export async function loadNewerMessagesAction(roomId: string, afterIso: string | null): Promise<LoadMessagesResult> {
  const supabase = await createClient();
  let query = supabase
    .from("chat_messages")
    .select("id, chat_room_id, sender_id, message_type, body, client_message_id, created_at")
    .eq("chat_room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(PAGE_SIZE);

  if (afterIso) {
    query = query.gt("created_at", afterIso);
  }

  const { data, error } = await query.returns<ChatMessage[]>();
  if (error) {
    return { ok: false, error: friendlyError(error, "새 메시지를 불러오지 못했습니다.") };
  }
  return { ok: true, messages: data ?? [] };
}
