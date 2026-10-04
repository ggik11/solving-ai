// 2-B 범위에서 화면이 실제로 쓰는 테이블만 최소한으로 타입화한다.
// 전체 데이터베이스 타입 생성(`supabase gen types`)은 스키마가 안정화된 뒤 별도로 도입한다.

export type AccountStatus = "active" | "withdrawn" | "suspended";
export type ProfileVisibility = "public" | "members_only" | "private";
export type ActivityStatus = "draft" | "published" | "closed" | "archived";
export type ParticipationMode = "solo" | "team" | "both";
export type LocationType = "online" | "offline" | "hybrid";

export interface Profile {
  id: string;
  nickname: string;
  university: string;
  campus: string;
  email_verified: boolean;
  affiliation_self_declared: boolean;
  campus_verified: boolean;
  grade: number | null;
  bio: string | null;
  portfolio_url: string | null;
  profile_visibility: ProfileVisibility;
  account_status: AccountStatus;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Major {
  id: string;
  college: string;
  department: string;
  name: string;
  is_demo: boolean;
}

export interface Interest {
  id: string;
  name: string;
}

export interface Skill {
  id: string;
  name: string;
}

export interface ActivityType {
  id: string;
  name: string;
  is_demo: boolean;
}

export interface AvailabilitySlot {
  id: string;
  profile_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
}

export interface Activity {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  org_name: string | null;
  source_url: string | null;
  location_type: LocationType;
  region: string | null;
  activity_type_id: string | null;
  eligibility: string | null;
  participation_mode: ParticipationMode;
  team_min_size: number | null;
  team_max_size: number | null;
  benefit: string | null;
  apply_start_at: string | null;
  apply_end_at: string | null;
  activity_start_at: string | null;
  activity_end_at: string | null;
  status: ActivityStatus;
  is_demo: boolean;
  created_by: string | null;
  last_verified_at: string | null;
  source_url_resolved: string | null;
  apply_end_at_evidence: string | null;
  needs_verification: boolean;
  verification_note: string | null;
  last_verification_attempt_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityWithType extends Activity {
  activity_types: Pick<ActivityType, "id" | "name"> | null;
}

export const APPLY_PHASES = ["upcoming", "open", "closing_soon", "closed"] as const;
export type ApplyPhase = (typeof APPLY_PHASES)[number];

export type ChatMessageType = "text" | "system";

export interface ChatMessage {
  id: string;
  chat_room_id: string;
  sender_id: string | null;
  message_type: ChatMessageType;
  body: string;
  client_message_id: string | null;
  created_at: string;
}

export interface ChatRoomSummary {
  chat_room_id: string;
  party_id: string;
  party_title: string | null;
  activity_title: string;
  last_message_body: string | null;
  last_message_at: string | null;
  last_message_sender_nickname: string | null;
  unread_count: number;
}

export interface MatchTemplateRole {
  role_name: string;
  capacity: number;
}

export interface MatchTemplate {
  id: string;
  activity_id: string;
  name: string;
  is_active: boolean;
}

export type MatchingQueueStatus = "waiting" | "proposed" | "matched" | "cancelled";
export type MatchProposalStatus = "proposed" | "matched" | "expired" | "cancelled";
export type MatchProposalResponse = "pending" | "accepted" | "declined";

export interface NotificationRow {
  id: string;
  type: string;
  target_type: string | null;
  target_id: string | null;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}
