const MAILPIT_URL = process.env.NEXT_PUBLIC_INBUCKET_URL ?? "http://127.0.0.1:54324";

interface MailpitMessageSummary {
  ID: string;
  To: { Address: string }[];
  Created: string;
}

async function findLatestMessageId(email: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`);
    const body = (await res.json()) as { messages: MailpitMessageSummary[] };
    const match = body.messages
      .filter((m) => m.To.some((to) => to.Address.toLowerCase() === email.toLowerCase()))
      .sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime())[0];
    if (match) return match.ID;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Mailpit에서 ${email}로 보낸 메일을 찾지 못했습니다.`);
}

/** Mailpit(로컬 메일 확인 도구)에서 특정 이메일로 보낸 가장 최근 매직링크 URL을 가져온다. */
export async function fetchLatestMagicLink(email: string): Promise<string> {
  const id = await findLatestMessageId(email);
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`);
  const body = (await res.json()) as { Text: string };
  const match = body.Text.match(/http:\/\/[^\s)]+\/auth\/confirm\?[^\s)]+/);
  if (!match) {
    throw new Error("메일 본문에서 /auth/confirm 링크를 찾지 못했습니다.");
  }
  return match[0];
}
