export const metadata = {
  title: "Privacy Policy",
};

export default function Privacy() {
  return (
    <main>
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: 2026</p>

      <h2>What this site does</h2>
      <p>
        Steam Friends Tracker lets you sign in with your Steam account and keeps
        a record of your Steam friends list over time, so it can show you who was
        added and who removed you.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>Your public SteamID, display name, and avatar.</li>
        <li>
          The public SteamIDs, names, and avatars of the friends on your list,
          along with the dates we first and last saw each one.
        </li>
        <li>
          A history of changes (added / removed / re-added) so we can show your
          timeline.
        </li>
      </ul>
      <p>
        We only read information that Steam already exposes publicly through its
        Web API. We never see or store your Steam password; sign-in happens on
        Steam&apos;s own servers via Steam OpenID.
      </p>

      <h2>How we use it</h2>
      <p>
        The data is used solely to show you your own friend history inside this
        app. We do not sell it or share it with third parties.
      </p>

      <h2>Advertising &amp; cookies</h2>
      <p>
        This site may display ads served by Google AdSense. Google and its
        partners may use cookies to serve ads based on your visits to this and
        other sites. You can opt out of personalized advertising by visiting{" "}
        <a href="https://www.google.com/settings/ads" target="_blank" rel="noreferrer">
          Google Ads Settings
        </a>
        . We also use a single essential cookie to keep you signed in; it is not
        used for tracking.
      </p>

      <h2>Deleting your data</h2>
      <p>
        You can request deletion of all data associated with your account at any
        time. Email{" "}
        <a href="mailto:help@steamfriends.xyz">help@steamfriends.xyz</a> and your
        records will be removed.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy can be sent to{" "}
        <a href="mailto:help@steamfriends.xyz">help@steamfriends.xyz</a>.
      </p>

      <p style={{ marginTop: "2rem" }}>
        <a href="/">Back to home</a>
      </p>
    </main>
  );
}
