import Link from "next/link";
import { signOutExpert } from "@/app/expert/actions";

/**
 * The expert console's chrome. Three pages now share it, which is one more
 * than it takes for two copies to start drifting.
 */
export default function ExpertBar({ current }: { current: "schedule" | "availability" | "profile" }) {
  return (
    <div className="os-bar">
      <Link href="/expert" className="logo os-mark">
        blue<span>point</span> <em>experts</em>
      </Link>
      <span className="os-nav">
        {current !== "schedule" ? <Link href="/expert">Schedule</Link> : null}
        {current !== "availability" ? <Link href="/expert/availability">Availability</Link> : null}
        {current !== "profile" ? <Link href="/expert/profile">Your profile</Link> : null}
        <form action={signOutExpert}>
          <button className="ops-signout" type="submit">
            Sign out
          </button>
        </form>
      </span>
    </div>
  );
}
