import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ELO TERRORISTS — Privacy Policy",
  robots: { index: false, follow: false },
};

export default function ExtensionPrivacy() {
  return (
    <main>
      <h1>ELO TERRORISTS — Privacy Policy</h1>
      <p className="muted">Last updated: July 2026 · Chrome Extension</p>

      <h2>Overview</h2>
      <p>
        ELO TERRORISTS is a Chrome extension that allows FACEIT CS2 players to
        flag and track suspected match-fixers and game-throwers in a shared
        community database. This policy explains what data the extension
        collects, how it is stored, and how it is used.
      </p>

      <h2>How trust works — no account required</h2>
      <p>
        Flagging a player does not require you to create an account or log in to
        any service we operate. Instead, the extension verifies that you were
        actually present in the match by reading your logged-in FACEIT session
        from the page. Specifically, it checks the profile link FACEIT renders
        in its own navigation header when you are signed in, extracts your
        FACEIT nickname, and confirms that nickname appears in the current
        matchroom&apos;s player list. Only if you are one of the ten players in
        the room do the flag buttons appear.
      </p>
      <p>
        This check runs entirely inside your browser. Your FACEIT username is
        never transmitted to our servers — we have no record of which FACEIT
        account submitted any given flag.
      </p>

      <h2>Data collected by the extension</h2>

      <h3>Anonymous reporter ID</h3>
      <p>
        When you first install the extension, a random UUID is generated and
        stored locally in <code>chrome.storage.local</code>. This ID is not
        linked to your FACEIT account, Steam account, Google account, or any
        other identity. It is used solely to associate your submitted flags with
        your reports on the server, so you can view and delete the flags you
        have personally submitted.
      </p>

      <h3>Flags you submit</h3>
      <p>
        When you flag a player, the following information is sent to our server
        and stored in the community database:
      </p>
      <ul>
        <li>The flagged player&apos;s Steam ID (a public numeric identifier)</li>
        <li>Their FACEIT display name at the time of flagging</li>
        <li>The rank you assigned (S / A / B / C / D / F)</li>
        <li>The comment you wrote explaining the reason</li>
        <li>Your anonymous reporter UUID</li>
        <li>The timestamp of submission</li>
      </ul>
      <p>
        We do not collect your name, email, IP address, FACEIT username, or any
        personally identifiable information.
      </p>

      <h3>FACEIT page data read locally</h3>
      <p>
        On every FACEIT page you visit, the extension reads player nicknames
        visible in the page to resolve them against the community database and
        apply highlights. In matchrooms specifically, it also reads the profile
        link in FACEIT&apos;s navigation header to determine your logged-in
        nickname for the participation check described above.
      </p>
      <p>
        Neither your logged-in nickname nor the raw list of player nicknames is
        logged or stored on our server. Nickname-to-Steam-ID mappings resolved
        via our API are cached for up to 24 hours to reduce API load, then
        discarded.
      </p>

      <h2>Data shared with third parties</h2>
      <p>
        To resolve FACEIT nicknames to Steam IDs, our server queries the FACEIT
        Open Data API on your behalf. Your anonymous reporter UUID and the
        nicknames on the page are never sent directly to FACEIT — only our
        server makes that request. We do not sell or share any data with
        advertisers or analytics providers.
      </p>

      <h2>Data stored locally</h2>
      <p>
        The extension stores the following in <code>chrome.storage.local</code>{" "}
        on your device:
      </p>
      <ul>
        <li>Your anonymous reporter UUID</li>
        <li>
          A local copy of the flags you have personally submitted (for display
          in the popup and to allow removal)
        </li>
      </ul>
      <p>
        It also stores a short-lived nickname-to-Steam-ID cache in{" "}
        <code>chrome.storage.session</code> (cleared when the browser closes)
        to avoid redundant network requests within a session. This data never
        leaves your device. Nothing is synced across devices via{" "}
        <code>chrome.storage.sync</code>.
      </p>

      <h2>Community database</h2>
      <p>
        Flags submitted through the extension are stored in a shared database
        and are visible to all extension users. Do not include personal
        information about yourself or others in flag comments beyond what is
        relevant to in-game behavior.
      </p>

      <h2>Deleting your data</h2>
      <p>
        You can remove any flag you have submitted at any time from within the
        extension popup. Removing a flag deletes it from the community database
        permanently. To request deletion of all flags associated with your
        reporter ID, email{" "}
        <a href="mailto:help@steamfriends.xyz">help@steamfriends.xyz</a>.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If this policy changes materially, the updated version will be published
        at this URL with a new &quot;Last updated&quot; date.
      </p>

      <h2>Contact</h2>
      <p>
        Questions can be sent to{" "}
        <a href="mailto:help@steamfriends.xyz">help@steamfriends.xyz</a>.
      </p>

      <p style={{ marginTop: "2rem" }}>
        <a href="/extension">← Back to ELO TERRORISTS</a>
        {" · "}
        <a href="/">Back to home</a>
      </p>
    </main>
  );
}
