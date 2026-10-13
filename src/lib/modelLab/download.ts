/** 브라우저에서 파일을 내려받게 하는 작은 헬퍼(가이드 6.1/6.3) — 서버로 보내지 않는다. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain"): void {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

/** 파일 이름에서 확장자를 뗀다 — 변환된 이미지 이름에 "_pad-square-v1" 접미사를 붙일 때 쓴다. */
export function stripExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx <= 0 ? fileName : fileName.slice(0, idx);
}

/** 경로에서 파일 이름만 뗀다 — manifest의 image_path와 실제 업로드한 파일 이름을 매칭할 때 쓴다. */
export function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx === -1 ? path : path.slice(idx + 1);
}
