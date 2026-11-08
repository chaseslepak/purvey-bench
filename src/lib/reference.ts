import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Ref = { id: number; name: string };
export type StateRef = { code: string; name: string; region_code: string };
export type RegionRef = { code: string; name: string };
export type Reference = {
  regions: RegionRef[];
  states: StateRef[];
  retailers: Ref[];
  channels: Ref[];
  distributors: Ref[];
  categories: Ref[];
};

/** Admin-managed reference lists (public read). Cached per request. */
export const getReference = cache(async (): Promise<Reference> => {
  const db = await createClient();
  const list = (t: string) => db.from(t).select("id, name").eq("active", true).order("name");
  const [regions, states, retailers, channels, distributors, categories] = await Promise.all([
    db.from("regions").select("code, name").order("sort"),
    db.from("states").select("code, name, region_code").order("name"),
    list("retailers"),
    list("channels"),
    list("distributors"),
    list("categories"),
  ]);
  return {
    regions: (regions.data ?? []) as RegionRef[],
    states: (states.data ?? []) as StateRef[],
    retailers: (retailers.data ?? []) as Ref[],
    channels: (channels.data ?? []) as Ref[],
    distributors: (distributors.data ?? []) as Ref[],
    categories: (categories.data ?? []) as Ref[],
  };
});
