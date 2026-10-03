import { splitMessageSegments } from "@/lib/chat";

// 메시지 본문을 항상 일반 텍스트로 렌더링하고(dangerouslySetInnerHTML을 쓰지 않으므로 HTML은
// 실행되지 않음), http/https 링크만 클릭 가능한 <a>로 바꾼다.
export function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {splitMessageSegments(text).map((segment, i) =>
        segment.type === "link" ? (
          <a
            key={i}
            href={segment.value}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all"
          >
            {segment.value}
          </a>
        ) : (
          <span key={i} className="whitespace-pre-wrap break-words">
            {segment.value}
          </span>
        )
      )}
    </>
  );
}
