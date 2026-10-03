"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface AvailabilityInput {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface ProfileFormInput {
  nickname: string;
  campus: "서울" | "천안";
  majorIds: string[];
  grade: number | null;
  academicStatus: "enrolled" | "leave_of_absence" | "graduated_pending" | "other";
  interestIds: string[];
  preferredActivityTypeIds: string[];
  skillIds: string[];
  preferredLocationType: "online" | "offline" | "hybrid" | null;
  preferredRegion: string | null;
  weeklyAvailableHours: number | null;
  availability: AvailabilityInput[];
  bio: string | null;
  portfolioUrl: string | null;
  experience: string | null;
  profileVisibility: "public" | "members_only" | "private";
  matchingOptIn: boolean;
  notificationsEnabled: boolean;
  completeOnboarding: boolean;
}

export type SaveProfileResult = { ok: true } | { ok: false; error: string };

export async function saveProfile(input: ProfileFormInput): Promise<SaveProfileResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, error: "로그인이 필요합니다." };
  }
  const profileId = userData.user.id;

  const nickname = input.nickname.trim();
  if (nickname.length < 2 || nickname.length > 20) {
    return { ok: false, error: "닉네임은 2~20자로 입력해 주세요." };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      nickname,
      campus: input.campus,
      grade: input.grade,
      academic_status: input.academicStatus,
      preferred_location_type: input.preferredLocationType,
      preferred_region: input.preferredRegion,
      weekly_available_hours: input.weeklyAvailableHours,
      bio: input.bio,
      portfolio_url: input.portfolioUrl,
      experience: input.experience,
      profile_visibility: input.profileVisibility,
      matching_opt_in: input.matchingOptIn,
      notifications_enabled: input.notificationsEnabled,
      ...(input.completeOnboarding ? { onboarding_completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", profileId);

  if (profileError) {
    if (profileError.code === "23505") {
      return { ok: false, error: "이미 사용 중인 닉네임입니다." };
    }
    return { ok: false, error: `프로필 저장에 실패했습니다: ${profileError.message}` };
  }

  // 다중 선택 항목들은 "전체 삭제 후 다시 삽입" 방식으로 멱등하게 반영한다 (온보딩 재방문/수정 모두 동일 경로).
  await supabase.from("profile_majors").delete().eq("profile_id", profileId);
  if (input.majorIds.length > 0) {
    await supabase
      .from("profile_majors")
      .insert(input.majorIds.map((major_id) => ({ profile_id: profileId, major_id })));
  }

  await supabase.from("profile_interests").delete().eq("profile_id", profileId);
  if (input.interestIds.length > 0) {
    await supabase
      .from("profile_interests")
      .insert(input.interestIds.map((interest_id) => ({ profile_id: profileId, interest_id })));
  }

  await supabase.from("profile_preferred_activity_types").delete().eq("profile_id", profileId);
  if (input.preferredActivityTypeIds.length > 0) {
    await supabase
      .from("profile_preferred_activity_types")
      .insert(input.preferredActivityTypeIds.map((activity_type_id) => ({ profile_id: profileId, activity_type_id })));
  }

  await supabase.from("profile_skills").delete().eq("profile_id", profileId);
  if (input.skillIds.length > 0) {
    await supabase
      .from("profile_skills")
      .insert(input.skillIds.map((skill_id) => ({ profile_id: profileId, skill_id })));
  }

  await supabase.from("availability_slots").delete().eq("profile_id", profileId);
  if (input.availability.length > 0) {
    await supabase.from("availability_slots").insert(
      input.availability.map((slot) => ({
        profile_id: profileId,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
      }))
    );
  }

  revalidatePath("/");
  revalidatePath("/me");
  revalidatePath("/onboarding");

  return { ok: true };
}

export interface ReferenceData {
  majors: { id: string; college: string; department: string; name: string }[];
  interests: { id: string; name: string }[];
  activityTypes: { id: string; name: string }[];
  skills: { id: string; name: string }[];
}

export async function loadReferenceData(): Promise<ReferenceData> {
  const supabase = await createClient();
  const [majors, interests, activityTypes, skills] = await Promise.all([
    supabase.from("majors").select("id, college, department, name").order("college"),
    supabase.from("interests").select("id, name").order("name"),
    supabase.from("activity_types").select("id, name").order("name"),
    supabase.from("skills").select("id, name").order("name"),
  ]);

  return {
    majors: majors.data ?? [],
    interests: interests.data ?? [],
    activityTypes: activityTypes.data ?? [],
    skills: skills.data ?? [],
  };
}

export interface CurrentProfileData {
  nickname: string;
  campus: "서울" | "천안";
  grade: number | null;
  academicStatus: string;
  preferredLocationType: string | null;
  preferredRegion: string | null;
  weeklyAvailableHours: number | null;
  bio: string | null;
  portfolioUrl: string | null;
  experience: string | null;
  profileVisibility: string;
  matchingOptIn: boolean;
  notificationsEnabled: boolean;
  majorIds: string[];
  interestIds: string[];
  preferredActivityTypeIds: string[];
  skillIds: string[];
  availability: AvailabilityInput[];
}

export async function loadCurrentProfileData(): Promise<CurrentProfileData | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const profileId = userData.user.id;

  const [profileRes, majorsRes, interestsRes, typesRes, skillsRes, availabilityRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", profileId).single(),
    supabase.from("profile_majors").select("major_id").eq("profile_id", profileId),
    supabase.from("profile_interests").select("interest_id").eq("profile_id", profileId),
    supabase.from("profile_preferred_activity_types").select("activity_type_id").eq("profile_id", profileId),
    supabase.from("profile_skills").select("skill_id").eq("profile_id", profileId),
    supabase.from("availability_slots").select("day_of_week, start_time, end_time").eq("profile_id", profileId),
  ]);

  const profile = profileRes.data;
  if (!profile) return null;

  return {
    nickname: profile.nickname,
    campus: profile.campus,
    grade: profile.grade,
    academicStatus: profile.academic_status,
    preferredLocationType: profile.preferred_location_type,
    preferredRegion: profile.preferred_region,
    weeklyAvailableHours: profile.weekly_available_hours,
    bio: profile.bio,
    portfolioUrl: profile.portfolio_url,
    experience: profile.experience,
    profileVisibility: profile.profile_visibility,
    matchingOptIn: profile.matching_opt_in,
    notificationsEnabled: profile.notifications_enabled,
    majorIds: (majorsRes.data ?? []).map((r) => r.major_id),
    interestIds: (interestsRes.data ?? []).map((r) => r.interest_id),
    preferredActivityTypeIds: (typesRes.data ?? []).map((r) => r.activity_type_id),
    skillIds: (skillsRes.data ?? []).map((r) => r.skill_id),
    availability: (availabilityRes.data ?? []).map((r) => ({
      day_of_week: r.day_of_week,
      start_time: r.start_time,
      end_time: r.end_time,
    })),
  };
}
