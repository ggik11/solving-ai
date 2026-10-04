/**
 * 아주 작은 HTML → 텍스트 변환기. DOM 파서 의존성을 새로 추가하지 않기 위해 정규식으로
 * 직접 구현했다(`parseCsv`가 외부 의존성 없이 직접 구현된 것과 같은 이유). 완전한 HTML 파싱을
 * 목표로 하지 않고, "날짜·근거 문장을 뽑아낼 수 있을 정도의 평문"이면 충분하다.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = parseInt(body.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (body.startsWith("#")) {
      const code = parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

/** `<script>`/`<style>`/주석을 제거하고, 블록 요소 경계는 개행으로, 나머지 태그는 공백으로 바꾼다. */
export function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  // 블록/줄바꿈 성격의 태그는 문장 경계를 보존하기 위해 개행으로 치환.
  text = text.replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)\s*>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  text = text.replace(/\r\n?/g, "\n");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n[ \t]*/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
