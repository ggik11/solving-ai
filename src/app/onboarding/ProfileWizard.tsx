"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile, type ProfileFormInput, type ReferenceData, type CurrentProfileData } from "./actions";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const ACADEMIC_STATUS_OPTIONS: { value: ProfileFormInput["academicStatus"]; label: string }[] = [
  { value: "enrolled", label: "재학" },
  { value: "leave_of_absence", label: "휴학" },
  { value: "graduated_pending", label: "졸업유예" },
  { value: "other", label: "기타" },
];
const LOCATION_OPTIONS: { value: NonNullable<ProfileFormInput["preferredLocationType"]>; label: string }[] = [
  { value: "online", label: "온라인" },
  { value: "offline", label: "오프라인" },
  { value: "hybrid", label: "혼합" },
];
const VISIBILITY_OPTIONS: { value: ProfileFormInput["profileVisibility"]; label: string; hint: string }[] = [
  { value: "public", label: "전체 공개", hint: "로그인하지 않은 방문자에게도 보여요" },
  { value: "members_only", label: "회원에게만 공개", hint: "로그인한 사용자에게만 보여요 (기본값)" },
  { value: "private", label: "비공개", hint: "나만 볼 수 있어요" },
];

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function MultiSelect({
  options,
  selected,
  onChange,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  if (options.length === 0) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">선택할 항목이 없어요.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isSelected = selected.includes(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(toggle(selected, opt.id))}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              isSelected
                ? "border-[var(--color-brand-600)] bg-[var(--color-brand-600)] text-white"
                : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--foreground)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  mode: "onboarding" | "edit";
  reference: ReferenceData;
  initial: CurrentProfileData;
}

export function ProfileWizard({ mode, reference, initial }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nickname, setNickname] = useState(initial.nickname);
  const [campus, setCampus] = useState<ProfileFormInput["campus"]>(initial.campus);
  const [majorIds, setMajorIds] = useState<string[]>(initial.majorIds);
  const [grade, setGrade] = useState<number | null>(initial.grade);
  const [academicStatus, setAcademicStatus] = useState<ProfileFormInput["academicStatus"]>(
    (initial.academicStatus as ProfileFormInput["academicStatus"]) ?? "enrolled"
  );
  const [interestIds, setInterestIds] = useState<string[]>(initial.interestIds);
  const [preferredActivityTypeIds, setPreferredActivityTypeIds] = useState<string[]>(
    initial.preferredActivityTypeIds
  );
  const [skillIds, setSkillIds] = useState<string[]>(initial.skillIds);
  const [preferredLocationType, setPreferredLocationType] = useState<ProfileFormInput["preferredLocationType"]>(
    (initial.preferredLocationType as ProfileFormInput["preferredLocationType"]) ?? null
  );
  const [preferredRegion, setPreferredRegion] = useState(initial.preferredRegion ?? "");
  const [weeklyAvailableHours, setWeeklyAvailableHours] = useState<string>(
    initial.weeklyAvailableHours != null ? String(initial.weeklyAvailableHours) : ""
  );
  const [availability, setAvailability] = useState(
    initial.availability.length > 0 ? initial.availability : []
  );
  const [bio, setBio] = useState(initial.bio ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState(initial.portfolioUrl ?? "");
  const [experience, setExperience] = useState(initial.experience ?? "");
  const [profileVisibility, setProfileVisibility] = useState<ProfileFormInput["profileVisibility"]>(
    (initial.profileVisibility as ProfileFormInput["profileVisibility"]) ?? "members_only"
  );
  const [matchingOptIn, setMatchingOptIn] = useState(initial.matchingOptIn);
  const [notificationsEnabled, setNotificationsEnabled] = useState(initial.notificationsEnabled);

  function addAvailabilitySlot() {
    setAvailability((prev) => [...prev, { day_of_week: 1, start_time: "09:00", end_time: "12:00" }]);
  }
  function updateAvailabilitySlot(index: number, patch: Partial<(typeof availability)[number]>) {
    setAvailability((prev) => prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  }
  function removeAvailabilitySlot(index: number) {
    setAvailability((prev) => prev.filter((_, i) => i !== index));
  }

  function buildInput(completeOnboarding: boolean): ProfileFormInput {
    return {
      nickname,
      campus,
      majorIds,
      grade,
      academicStatus,
      interestIds,
      preferredActivityTypeIds,
      skillIds,
      preferredLocationType,
      preferredRegion: preferredRegion.trim() || null,
      weeklyAvailableHours: weeklyAvailableHours.trim() ? Number(weeklyAvailableHours) : null,
      availability,
      bio: bio.trim() || null,
      portfolioUrl: portfolioUrl.trim() || null,
      experience: experience.trim() || null,
      profileVisibility,
      matchingOptIn,
      notificationsEnabled,
      completeOnboarding,
    };
  }

  async function handleSave(completeOnboarding: boolean) {
    setError(null);
    if (nickname.trim().length < 2) {
      setError("닉네임을 2자 이상 입력해 주세요.");
      setStep(0);
      return;
    }
    setSubmitting(true);
    const result = await saveProfile(buildInput(completeOnboarding));
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(mode === "onboarding" ? "/" : "/me");
    router.refresh();
  }

  const steps = [
    {
      title: "닉네임",
      content: (
        <div className="flex flex-col gap-2">
          <label htmlFor="nickname" className="text-sm font-medium">
            닉네임 (2~20자, 실명 대신 사용돼요)
          </label>
          <input
            id="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            maxLength={20}
          />
        </div>
      ),
      required: true,
    },
    {
      title: "소속",
      content: (
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1 text-sm font-medium">캠퍼스</p>
            <div className="flex gap-2">
              {(["서울", "천안"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={campus === c}
                  onClick={() => setCampus(c)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    campus === c
                      ? "border-[var(--color-brand-600)] bg-[var(--color-brand-600)] text-white"
                      : "border-[var(--color-border)]"
                  }`}
                >
                  {c}캠퍼스
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">학년 / 상태 (선택)</p>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={grade === g}
                  onClick={() => setGrade(grade === g ? null : g)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    grade === g ? "border-[var(--color-brand-600)] bg-[var(--color-brand-600)] text-white" : "border-[var(--color-border)]"
                  }`}
                >
                  {g}학년
                </button>
              ))}
              {ACADEMIC_STATUS_OPTIONS.filter((o) => o.value !== "enrolled").map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={academicStatus === o.value}
                  onClick={() => setAcademicStatus(academicStatus === o.value ? "enrolled" : o.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    academicStatus === o.value
                      ? "border-[var(--color-brand-600)] bg-[var(--color-brand-600)] text-white"
                      : "border-[var(--color-border)]"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">전공 (선택, 복수 가능 · 목록에 없으면 비워두세요)</p>
            <MultiSelect
              options={reference.majors.map((m) => ({ id: m.id, label: `${m.name} (${m.department})` }))}
              selected={majorIds}
              onChange={setMajorIds}
            />
          </div>
        </div>
      ),
      required: false,
    },
    {
      title: "관심분야",
      content: (
        <MultiSelect
          options={reference.interests.map((i) => ({ id: i.id, label: i.name }))}
          selected={interestIds}
          onChange={setInterestIds}
        />
      ),
      required: false,
    },
    {
      title: "희망 활동",
      content: (
        <MultiSelect
          options={reference.activityTypes.map((t) => ({ id: t.id, label: t.name }))}
          selected={preferredActivityTypeIds}
          onChange={setPreferredActivityTypeIds}
        />
      ),
      required: false,
    },
    {
      title: "할 수 있는 역할",
      content: (
        <MultiSelect
          options={reference.skills.map((s) => ({ id: s.id, label: s.name }))}
          selected={skillIds}
          onChange={setSkillIds}
        />
      ),
      required: false,
    },
    {
      title: "참여 조건",
      content: (
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1 text-sm font-medium">선호하는 진행 방식</p>
            <div className="flex gap-2">
              {LOCATION_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={preferredLocationType === o.value}
                  onClick={() => setPreferredLocationType(preferredLocationType === o.value ? null : o.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    preferredLocationType === o.value
                      ? "border-[var(--color-brand-600)] bg-[var(--color-brand-600)] text-white"
                      : "border-[var(--color-border)]"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="region" className="text-sm font-medium">
              선호 지역 (선택)
            </label>
            <input
              id="region"
              value={preferredRegion}
              onChange={(e) => setPreferredRegion(e.target.value)}
              placeholder="예: 서울"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="hours" className="text-sm font-medium">
              주당 투입 가능 시간 (선택, 시간 단위)
            </label>
            <input
              id="hours"
              type="number"
              min={0}
              value={weeklyAvailableHours}
              onChange={(e) => setWeeklyAvailableHours(e.target.value)}
              className="w-28 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            />
          </div>
        </div>
      ),
      required: false,
    },
    {
      title: "가능한 시간",
      content: (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Asia/Seoul(KST) 기준 요일·시간 구간이에요. 전체 시간표를 공개할 필요는 없어요.
          </p>
          {availability.map((slot, index) => (
            <div key={index} className="flex items-center gap-2">
              <select
                value={slot.day_of_week}
                onChange={(e) => updateAvailabilitySlot(index, { day_of_week: Number(e.target.value) })}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
              >
                {DAY_LABELS.map((label, dayIndex) => (
                  <option key={dayIndex} value={dayIndex}>
                    {label}요일
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={slot.start_time}
                onChange={(e) => updateAvailabilitySlot(index, { start_time: e.target.value })}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
              />
              <span className="text-sm">~</span>
              <input
                type="time"
                value={slot.end_time}
                onChange={(e) => updateAvailabilitySlot(index, { end_time: e.target.value })}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => removeAvailabilitySlot(index)}
                aria-label="이 시간대 삭제"
                className="text-sm text-[var(--color-danger)]"
              >
                삭제
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addAvailabilitySlot}
            className="self-start rounded-md border border-[var(--color-brand-300)] px-3 py-1.5 text-sm text-[var(--color-brand-700)]"
          >
            + 시간대 추가
          </button>
        </div>
      ),
      required: false,
    },
    {
      title: "선택 정보",
      content: (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="bio" className="text-sm font-medium">
              자기소개
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="portfolio" className="text-sm font-medium">
              포트폴리오 URL
            </label>
            <input
              id="portfolio"
              type="url"
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
              placeholder="https://"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="experience" className="text-sm font-medium">
              활동 경험
            </label>
            <textarea
              id="experience"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              rows={3}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            />
          </div>
        </div>
      ),
      required: false,
    },
    {
      title: "공개 설정",
      content: (
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1 text-sm font-medium">프로필 공개 범위</p>
            <div className="flex flex-col gap-2">
              {VISIBILITY_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="visibility"
                    checked={profileVisibility === o.value}
                    onChange={() => setProfileVisibility(o.value)}
                  />
                  <span>
                    {o.label} <span className="text-[var(--color-muted-foreground)]">— {o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={matchingOptIn} onChange={(e) => setMatchingOptIn(e.target.checked)} />
            빠른 매칭 대상에 포함되기
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
            />
            앱 내 알림 받기
          </label>
        </div>
      ),
      required: false,
    },
  ];

  if (mode === "edit") {
    return (
      <div className="flex flex-col gap-8">
        {steps.map((s) => (
          <section key={s.title}>
            <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted-foreground)]">{s.title}</h2>
            {s.content}
          </section>
        ))}
        {error && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={submitting}
          onClick={() => handleSave(false)}
          className="rounded-md bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {submitting ? "저장 중..." : "저장"}
        </button>
      </div>
    );
  }

  const current = steps[step];
  const isLastStep = step === steps.length - 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1" role="progressbar" aria-valuenow={step + 1} aria-valuemax={steps.length}>
        {steps.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-[var(--color-brand-600)]" : "bg-[var(--color-border)]"}`}
          />
        ))}
      </div>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        {step + 1} / {steps.length}
      </p>
      <h2 className="text-lg font-semibold">{current.title}</h2>
      {current.content}

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm disabled:opacity-40"
        >
          이전
        </button>
        <div className="flex gap-2">
          {!current.required && !isLastStep && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
              className="rounded-md px-4 py-2 text-sm text-[var(--color-muted-foreground)] underline"
            >
              건너뛰기
            </button>
          )}
          {isLastStep ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSave(true)}
              className="rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {submitting ? "저장 중..." : "완료"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (current.required && nickname.trim().length < 2) {
                  setError("닉네임을 2자 이상 입력해 주세요.");
                  return;
                }
                setError(null);
                setStep((s) => Math.min(steps.length - 1, s + 1));
              }}
              className="rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white"
            >
              다음
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
