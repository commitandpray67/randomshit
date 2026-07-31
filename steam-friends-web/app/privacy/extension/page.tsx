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
        ELO TERRORISTS is a Chrome extension that allows FACEIT players to
        flag and track suspected match-fixers and game-throwers in a shared
        community database. This policy explains what data the extension
        collects, how it is stored, and how it is used.
      </p>

      <h2>Data collected by the extension</h2>

      <h3>Anonymous reporter ID</h3>
      <p>
        When you first install the extension, a random UUID is generated and
        stored locally in <code>chrome.storage.local</code>. This ID is not
        linked to your Steam account, Google account, or any other identity.
        It is used solely to associate your submitted flags with your reports
        on the server, so you can view and delete the flags you have
        personally submitted.
      </p>

      <h3>Flags you submit</h3>
      <p>
        When you flag a player, the following information is sent to our
        server and stored in the community database:
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
        We do not collect your name, email, IP address, or any personally
        identifiable information.
      </p>

      <h3>FACEIT nickname lookups</h3>
      <p>
        When you visit a FACEIT page, the extension reads player nicknames
        visible on the page and sends them to our server to resolve them to
        Steam IDs and check the community database. These lookups are not
        logged or stored on our server — only the nickname-to-Steam-ID
        mapping is cached for up to 24 hours to reduce API load.
      </p>

      <h2>Data shared with third parties</h2>
      <p>
        To resolve FACEIT nicknames to Steam IDs, our server queries the
        FACEIT Open Data API on your behalf. Your anonymous reporter UUID
        and the nicknames on the page are never sent directly to FACEIT —
        only our server makes that request. We do not sell or share any
        data with advertisers or analytics providers.
      </p>

      <h2>Data stored locally</h2>
      <p>
        The extension stores two things in <code>chrome.storage.local</code>{" "}
        on your device:
      </p>
      <ul>
        <li>Your anonymous reporter UUID</li>
        <li>
          A local copy of the flags you have personally submitted (for
          display in the popup and to allow removal)
        </li>
      </ul>
      <p>
        This data never leaves your device except as described above (flag
        submissions and lookups). It is never synced across devices via{" "}
        <code>chrome.storage.sync</code>.
      </p>

      <h2>Community database</h2>
      <p>
        Flags submitted through the extension are stored in a shared
        database and are visible to all extension users. Do not include
        personal information about yourself or others in flag comments beyond
        what is relevant to in-game behavior.
      </p>

      <h2>Deleting your data</h2>
      <p>
        You can remove any flag you have submitted at any time from within
        the extension popup. Removing a flag deletes it from the community
        database permanently. To request deletion of all flags associated
        with your reporter ID, email{" "}
        <a href="mailto:help@steamfriends.xyz">help@steamfriends.xyz</a>.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If this policy changes materially, the updated version will be
        published at this URL with a new &quot;Last updated&quot; date.
      </p>

      <h2>Contact</h2>
      <p>
        Questions can be sent to{" "}
        <a href="mailto:help@steamfriends.xyz">help@steamfriends.xyz</a>.
      </p>

      <p style={{ marginTop: "2rem" }}>
        <a href="/">Back to home</a>
      </p>
    </main>
  );
}
