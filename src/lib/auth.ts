import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

export async function getCurrentUserAndProfile() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single<Profile>();

  return { supabase, user: data.user, profile: profile ?? null };
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("profile_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();

  return Boolean(role);
}
