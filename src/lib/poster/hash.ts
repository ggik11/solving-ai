/** 포스터 이미지의 SHA-256 해시(가이드 3.5·5.4) — 이미지 자체는 저장하지 않고 해시만 남긴다. */
export async function hashBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashFile(file: File): Promise<string> {
  return hashBytes(await file.arrayBuffer());
}
