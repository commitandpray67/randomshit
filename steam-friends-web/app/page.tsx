import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  const steamId = await getSession();
  if (steamId) redirect("/dashboard");

  return (
    <main>
      <h1>Steam Friends Tracker</h1>
      <p>
        Sign in with Steam and we&apos;ll remember your friends list. Come back
        anytime to see who added you — and who quietly unfriended you.
      </p>

      <p>
        <a className="btn" href="/api/auth/steam">
          Sign in through Steam
        </a>
      </p>

      <div className="card">
        <strong>Heads up:</strong> your Steam <em>friends list</em> must be set
        to <em>Public</em> (Steam → Edit Profile → Privacy Settings → My friends
        list → Public). Steam doesn&apos;t let any third-party app read a private
        friends list, even your own.
      </div>
    </main>
  );
}
