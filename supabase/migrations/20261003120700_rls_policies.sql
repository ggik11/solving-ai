-- RLS를 모든 사용자 데이터 테이블(+참조/설정 테이블)에 적용한다.
-- 정책이 없는 테이블은 RLS가 켜지면 authenticated/anon 모두 기본 거부된다. service_role은 RLS를 우회한다.

alter table public.profiles enable row level security;
alter table public.affiliation_verifications enable row level security;
alter table public.majors enable row level security;
alter table public.profile_majors enable row level security;
alter table public.interests enable row level security;
alter table public.profile_interests enable row level security;
alter table public.skills enable row level security;
alter table public.profile_skills enable row level security;
alter table public.availability_slots enable row level security;
alter table public.activities enable row level security;
alter table public.activity_tags enable row level security;
alter table public.bookmarks enable row level security;
alter table public.parties enable row level security;
alter table public.party_role_slots enable row level security;
alter table public.party_members enable row level security;
alter table public.party_applications enable row level security;
alter table public.matching_queue enable row level security;
alter table public.match_proposals enable row level security;
alter table public.match_proposal_members enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_read_states enable row level security;
alter table public.notifications enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;
alter table public.user_roles enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or profile_visibility <> 'private' or public.is_admin());

create policy profiles_insert on public.profiles for insert
  with check (id = auth.uid());

create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- affiliation_verifications (본인 또는 운영자만)
-- ---------------------------------------------------------------------------
create policy affiliation_verifications_select on public.affiliation_verifications for select
  using (profile_id = auth.uid() or public.is_admin());

create policy affiliation_verifications_insert on public.affiliation_verifications for insert
  with check (profile_id = auth.uid());

create policy affiliation_verifications_update on public.affiliation_verifications for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 참조 테이블: majors / interests / skills — 공개 읽기, 운영자만 쓰기
-- ---------------------------------------------------------------------------
create policy majors_select on public.majors for select using (true);
create policy majors_write_insert on public.majors for insert with check (public.is_admin());
create policy majors_write_update on public.majors for update using (public.is_admin()) with check (public.is_admin());
create policy majors_write_delete on public.majors for delete using (public.is_admin());

create policy interests_select on public.interests for select using (true);
create policy interests_write_insert on public.interests for insert with check (public.is_admin());
create policy interests_write_update on public.interests for update using (public.is_admin()) with check (public.is_admin());
create policy interests_write_delete on public.interests for delete using (public.is_admin());

create policy skills_select on public.skills for select using (true);
create policy skills_write_insert on public.skills for insert with check (public.is_admin());
create policy skills_write_update on public.skills for update using (public.is_admin()) with check (public.is_admin());
create policy skills_write_delete on public.skills for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- profile_majors / profile_interests / profile_skills / availability_slots
-- MVP 범위: 본인 또는 운영자만 (다른 사용자에게 공개하는 범위는 후속 설계)
-- ---------------------------------------------------------------------------
create policy profile_majors_select on public.profile_majors for select
  using (profile_id = auth.uid() or public.is_admin());
create policy profile_majors_insert on public.profile_majors for insert
  with check (profile_id = auth.uid());
create policy profile_majors_delete on public.profile_majors for delete
  using (profile_id = auth.uid());

create policy profile_interests_select on public.profile_interests for select
  using (profile_id = auth.uid() or public.is_admin());
create policy profile_interests_insert on public.profile_interests for insert
  with check (profile_id = auth.uid());
create policy profile_interests_delete on public.profile_interests for delete
  using (profile_id = auth.uid());

create policy profile_skills_select on public.profile_skills for select
  using (profile_id = auth.uid() or public.is_admin());
create policy profile_skills_insert on public.profile_skills for insert
  with check (profile_id = auth.uid());
create policy profile_skills_delete on public.profile_skills for delete
  using (profile_id = auth.uid());

create policy availability_slots_select on public.availability_slots for select
  using (profile_id = auth.uid() or public.is_admin());
create policy availability_slots_insert on public.availability_slots for insert
  with check (profile_id = auth.uid());
create policy availability_slots_update on public.availability_slots for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
create policy availability_slots_delete on public.availability_slots for delete
  using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- activities / activity_tags — 공개(published)는 비회원도 조회, CRUD는 운영자만
-- ---------------------------------------------------------------------------
create policy activities_select on public.activities for select
  using (status = 'published' or created_by = auth.uid() or public.is_admin());

create policy activities_write_insert on public.activities for insert
  with check (public.is_admin());
create policy activities_write_update on public.activities for update
  using (public.is_admin())
  with check (public.is_admin());
create policy activities_write_delete on public.activities for delete
  using (public.is_admin());

create policy activity_tags_select on public.activity_tags for select
  using (
    exists (
      select 1 from public.activities a
      where a.id = activity_tags.activity_id
        and (a.status = 'published' or a.created_by = auth.uid() or public.is_admin())
    )
  );
create policy activity_tags_write_insert on public.activity_tags for insert with check (public.is_admin());
create policy activity_tags_write_update on public.activity_tags for update using (public.is_admin()) with check (public.is_admin());
create policy activity_tags_write_delete on public.activity_tags for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- bookmarks — 본인만
-- ---------------------------------------------------------------------------
create policy bookmarks_select on public.bookmarks for select using (profile_id = auth.uid());
create policy bookmarks_insert on public.bookmarks for insert with check (profile_id = auth.uid());
create policy bookmarks_delete on public.bookmarks for delete using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- parties / party_role_slots / party_members / party_applications
-- ---------------------------------------------------------------------------
create policy parties_select on public.parties for select
  using (auth.uid() is not null or public.is_admin());

create policy parties_insert on public.parties for insert
  with check ((source = 'manual' and leader_id = auth.uid()) or public.is_admin());

create policy parties_update on public.parties for update
  using (leader_id = auth.uid() or public.is_admin())
  with check (leader_id = auth.uid() or public.is_admin());

create policy party_role_slots_select on public.party_role_slots for select
  using (auth.uid() is not null or public.is_admin());

create policy party_role_slots_insert on public.party_role_slots for insert
  with check (
    exists (select 1 from public.parties p where p.id = party_id and p.leader_id = auth.uid())
    or public.is_admin()
  );
create policy party_role_slots_update on public.party_role_slots for update
  using (
    exists (select 1 from public.parties p where p.id = party_id and p.leader_id = auth.uid())
    or public.is_admin()
  )
  with check (
    exists (select 1 from public.parties p where p.id = party_id and p.leader_id = auth.uid())
    or public.is_admin()
  );
create policy party_role_slots_delete on public.party_role_slots for delete
  using (
    exists (select 1 from public.parties p where p.id = party_id and p.leader_id = auth.uid())
    or public.is_admin()
  );

-- 주의: 같은 테이블(party_members)을 정책 내에서 다시 조회하면 "infinite recursion detected
-- in policy" (42P17) 오류가 난다. 같은 파티의 다른 멤버가 서로의 멤버십 행을 보는 기능은
-- (예: 채팅 참가자 목록) 2단계 범위를 벗어나는 별도 뷰/함수로 구현하고, 여기서는 자기 자신/
-- 파티장/운영자만 허용한다.
create policy party_members_select on public.party_members for select
  using (
    profile_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.parties p where p.id = party_id and p.leader_id = auth.uid())
  );

create policy party_members_insert on public.party_members for insert
  with check (
    exists (select 1 from public.parties p where p.id = party_id and p.leader_id = auth.uid())
    or public.is_admin()
  );

create policy party_members_update on public.party_members for update
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.parties p where p.id = party_id and p.leader_id = auth.uid())
    or public.is_admin()
  )
  with check (
    profile_id = auth.uid()
    or exists (select 1 from public.parties p where p.id = party_id and p.leader_id = auth.uid())
    or public.is_admin()
  );

create policy party_applications_select on public.party_applications for select
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.parties p where p.id = party_id and p.leader_id = auth.uid())
    or public.is_admin()
  );

create policy party_applications_insert on public.party_applications for insert
  with check (profile_id = auth.uid());

create policy party_applications_update on public.party_applications for update
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.parties p where p.id = party_id and p.leader_id = auth.uid())
    or public.is_admin()
  )
  with check (
    profile_id = auth.uid()
    or exists (select 1 from public.parties p where p.id = party_id and p.leader_id = auth.uid())
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- matching_queue / match_proposals / match_proposal_members
-- 제안 생성·확정은 4단계 스케줄 워커(service_role)가 처리 — 클라이언트 쓰기 정책은 최소한으로 둔다.
-- ---------------------------------------------------------------------------
create policy matching_queue_select on public.matching_queue for select
  using (profile_id = auth.uid() or public.is_admin());
create policy matching_queue_insert on public.matching_queue for insert
  with check (profile_id = auth.uid());
create policy matching_queue_update on public.matching_queue for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

create policy match_proposals_select on public.match_proposals for select
  using (
    exists (
      select 1 from public.match_proposal_members mpm
      where mpm.proposal_id = match_proposals.id and mpm.profile_id = auth.uid()
    )
    or public.is_admin()
  );
create policy match_proposals_write_insert on public.match_proposals for insert with check (public.is_admin());
create policy match_proposals_write_update on public.match_proposals for update using (public.is_admin()) with check (public.is_admin());

create policy match_proposal_members_select on public.match_proposal_members for select
  using (profile_id = auth.uid() or public.is_admin());
create policy match_proposal_members_update on public.match_proposal_members for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
create policy match_proposal_members_write_insert on public.match_proposal_members for insert with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- chat_rooms / chat_messages / chat_read_states
-- 채팅 접근은 confirmed 여부와 무관하게 "해당 파티의 활성 멤버인가"로만 판정한다
-- (architecture.md 4장 설계 수정 #1, 핵심 불변식 5).
-- chat_messages는 운영자도 블랭킷 열람 정책을 두지 않는다 — 신고 처리는 별도 감사된 서버 경로로 처리.
-- ---------------------------------------------------------------------------
create policy chat_rooms_select on public.chat_rooms for select
  using (
    exists (
      select 1 from public.party_members pm
      where pm.party_id = chat_rooms.party_id and pm.profile_id = auth.uid() and pm.status = 'active'
    )
    or public.is_admin()
  );

create policy chat_messages_select on public.chat_messages for select
  using (
    exists (
      select 1 from public.chat_rooms cr
      join public.party_members pm on pm.party_id = cr.party_id
      where cr.id = chat_messages.chat_room_id
        and pm.profile_id = auth.uid()
        and pm.status = 'active'
    )
  );

create policy chat_messages_insert on public.chat_messages for insert
  with check (
    message_type = 'text'
    and sender_id = auth.uid()
    and exists (
      select 1 from public.chat_rooms cr
      join public.party_members pm on pm.party_id = cr.party_id
      where cr.id = chat_messages.chat_room_id
        and pm.profile_id = auth.uid()
        and pm.status = 'active'
    )
  );

create policy chat_read_states_select on public.chat_read_states for select
  using (profile_id = auth.uid());
create policy chat_read_states_insert on public.chat_read_states for insert
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.chat_rooms cr
      join public.party_members pm on pm.party_id = cr.party_id
      where cr.id = chat_read_states.chat_room_id
        and pm.profile_id = auth.uid()
        and pm.status = 'active'
    )
  );
create policy chat_read_states_update on public.chat_read_states for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notifications — 본인만 조회/읽음 처리. 생성은 서버(service_role)만 수행.
-- ---------------------------------------------------------------------------
create policy notifications_select on public.notifications for select using (profile_id = auth.uid());
create policy notifications_update on public.notifications for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- blocks — 본인 차단 목록만 (운영자는 중재를 위해 조회 가능)
-- ---------------------------------------------------------------------------
create policy blocks_select on public.blocks for select using (blocker_id = auth.uid() or public.is_admin());
create policy blocks_insert on public.blocks for insert with check (blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete using (blocker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- reports — 작성자 본인 + 운영자. 처리(상태 변경)는 운영자만.
-- ---------------------------------------------------------------------------
create policy reports_select on public.reports for select
  using (reporter_id = auth.uid() or public.is_admin());
create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid());
create policy reports_write_update on public.reports for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- audit_logs — 운영자만 조회/기록
-- ---------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs for select using (public.is_admin());
create policy audit_logs_insert on public.audit_logs for insert with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- app_settings — 공개 읽기(허용 도메인 등 비민감 설정), 쓰기는 운영자만
-- ---------------------------------------------------------------------------
create policy app_settings_select on public.app_settings for select using (true);
create policy app_settings_write_insert on public.app_settings for insert with check (public.is_admin());
create policy app_settings_write_update on public.app_settings for update using (public.is_admin()) with check (public.is_admin());
create policy app_settings_write_delete on public.app_settings for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- user_roles — 본인 행 조회만 가능, 모든 쓰기는 운영자만(최초 admin은 seed로 service_role 경유 부여)
-- ---------------------------------------------------------------------------
create policy user_roles_select on public.user_roles for select
  using (profile_id = auth.uid() or public.is_admin());
create policy user_roles_write_insert on public.user_roles for insert with check (public.is_admin());
create policy user_roles_write_update on public.user_roles for update using (public.is_admin()) with check (public.is_admin());
create policy user_roles_write_delete on public.user_roles for delete using (public.is_admin());
