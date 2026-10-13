"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerClassifierModelAction } from "@/lib/modelLab/actions";
import { labelsMatchClassSet, type ClassifierClassSet } from "@/lib/modelLab/classSets";

export interface ExistingClassifierRegistration {
  modelVersion: string;
  classSetId: string;
  classSetCode: string;
  registeredByNickname: string | null;
  registeredAt: string;
}

/**
 * 모델 등록 섹션(가이드 3.6 보완) — public/models/poster-classifier/의 metadata.json을 읽어
 * 보여주고, labels가 선택한 클래스 구성과 정확히 일치할 때만 등록 버튼을 활성화한다. 모델 파일이
 * 없으면 "모델 미설치"만 보여준다. 등록은 register_classifier_model() DB 함수가 다시 한 번
 * labels 일치를 검증하므로, 여기 버튼 비활성화는 UX 보조일 뿐 실제 가드는 서버 쪽에 있다.
 */
export function ModelRegistrationSection({
  metadata,
  classSets,
  existingRegistration,
}: {
  metadata: { labels: string[]; modelVersion: string } | null;
  classSets: ClassifierClassSet[];
  /** 지금 설치된 모델 버전(metadata.modelVersion)에 대한 기존 등록 기록 — 없으면 null. */
  existingRegistration: ExistingClassifierRegistration | null;
}) {
  const router = useRouter();
  const defaultClassSetId = classSets.find((s) => s.isActive)?.id ?? classSets[0]?.id ?? "";
  const [classSetId, setClassSetId] = useState(defaultClassSetId);
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const selectedClassSet = classSets.find((s) => s.id === classSetId) ?? null;
  const matches = useMemo(
    () => (metadata && selectedClassSet ? labelsMatchClassSet(metadata.labels, selectedClassSet.classIds) : false),
    [metadata, selectedClassSet]
  );

  function handleRegister() {
    if (!metadata || !selectedClassSet) return;
    setNotice(null);
    startTransition(async () => {
      const result = await registerClassifierModelAction({
        modelVersion: metadata.modelVersion,
        classSetId: selectedClassSet.id,
        labels: metadata.labels,
      });
      if (!result.ok) {
        setNotice(result.error);
        return;
      }
      setNotice("등록되었어요.");
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">모델 등록</h2>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        public/models/poster-classifier/의 metadata.json을 읽어 모델 버전과 labels를 보여줘요. labels가 선택한 클래스
        구성과 정확히 일치할 때만 등록할 수 있어요.
      </p>

      {!metadata ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          모델 미설치 — public/models/poster-classifier/에 model.json·metadata.json·weights.bin을 넣어주세요.
        </p>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-[var(--color-muted-foreground)]">모델 버전</dt>
            <dd>{metadata.modelVersion}</dd>
            <dt className="text-[var(--color-muted-foreground)]">labels</dt>
            <dd>{metadata.labels.length > 0 ? metadata.labels.join(", ") : "(없음)"}</dd>
          </dl>

          <label className="flex flex-col gap-1 text-sm font-medium">
            클래스 구성 선택
            <select
              value={classSetId}
              onChange={(e) => setClassSetId(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm font-normal"
            >
              {classSets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code}){s.isActive ? " · 활성" : ""}
                </option>
              ))}
            </select>
          </label>

          {selectedClassSet && !matches && (
            <p className="text-xs text-[var(--color-danger)]">
              labels가 이 클래스 구성과 일치하지 않아요. 구성 class_id: {selectedClassSet.classIds.join(", ")}
            </p>
          )}

          {existingRegistration && existingRegistration.modelVersion === metadata.modelVersion && (
            <p className="text-xs text-[var(--color-muted-foreground)]">
              이미 등록됨 — {existingRegistration.classSetCode} 구성,{" "}
              {new Date(existingRegistration.registeredAt).toLocaleString("ko-KR")}
              {existingRegistration.registeredByNickname ? ` · ${existingRegistration.registeredByNickname}` : ""}
            </p>
          )}

          <button
            type="button"
            disabled={!matches || isPending}
            onClick={handleRegister}
            className="self-start rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {isPending ? "등록 중..." : existingRegistration?.modelVersion === metadata.modelVersion ? "다시 등록" : "등록"}
          </button>

          {notice && <p className="text-xs text-[var(--color-muted-foreground)]">{notice}</p>}
        </div>
      )}
    </section>
  );
}
