import { redirect } from "next/navigation";
import { siteLinks } from "@/lib/site";

/** Bench is covered by Purvey's site-wide privacy policy. */
export default function Page() {
  redirect(siteLinks.privacy);
}
