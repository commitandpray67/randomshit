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

      <h2>How trust works — FACEIT OAuth</h2>
      <p>
        To submit a flag you must connect your FACEIT account via the
        extension&apos;s built-in OAuth flow. This proves you own a real FACEIT
        account without requiring you to create a separate account on our service.
        When you click &ldquo;Connect with FACEIT&rdquo;, you are redirected to
        FACEIT&apos;s own login page; we never see your FACEIT password.
      </p>
      <p>
        When you flag a player from inside a matchroom, the extension sends the
        current match ID to our server. Our server independently calls the FACEIT
        Data API to confirm that your FACEIT account appears in that match&apos;s
        player roster before accepting the flag. This check happens entirely
        server-side — we do not rely on anything the extension claims about who
        you are.
      </p>

      <h2>Data collected by the extension</h2>

      <h3>FACEIT access token</h3>
      <p>
        After you connect your FACEIT account, an OAuth access token and refresh
        token are stored in <code>chrome.storage.local</code> on your device.
        These tokens allow the extension to authenticate your flagging requests.
        They are never sent to any server other than FACEIT (for token refresh)
        and our own API (attached to flag submissions so we can verify your
        identity).
      </p>

      <h3>Reporter identifier</h3>
      <p>
        We never store your FACEIT username or GUID in plain text. When a flag is
        accepted, our server computes a one-way SHA-256 hash of your FACEIT GUID
        and stores that hash as your stable reporter identifier. This hash cannot
        be reversed to recover your FACEIT identity, but it is consistent across
        all flags you submit, allowing you to view and delete your own reports.
      </p>

      <h3>Flags you submit</h3>
      <p>
        When you flag a player, the following is sent to our server and stored in
        the community database:
      </p>
      <ul>
        <li>The flagged player&apos;s Steam ID (a public numeric identifier)</li>
        <li>Their FACEIT display name at the time of flagging</li>
        <li>The rank you assigned (S / A / B / C / D / F)</li>
        <li>The comment you wrote explaining the reason</li>
        <li>Your hashed reporter identifier</li>
        <li>The timestamp of submission</li>
      </ul>
      <p>
        We do not store your FACEIT username, email, IP address, or any other
        personally identifiable information in the community database.
      </p>

      <h3>FACEIT page data read locally</h3>
      <p>
        On every FACEIT page you visit, the extension reads player nicknames
        visible in the page to look them up in the community database and apply
        highlights. This reading happens entirely inside your browser and the raw
        list of nicknames is never logged or transmitted to our server.
        Nickname-to-Steam-ID mappings resolved via our API are cached in{" "}
        <code>chrome.storage.session</code> (cleared on browser close) to reduce
        network requests.
      </p>

      <h2>Data shared with third parties</h2>
      <p>
        To resolve FACEIT nicknames to Steam IDs, our server queries the FACEIT
        Open Data API. To verify match participation, our server calls the FACEIT
        Data API using a server-side API key — your FACEIT access token is used
        only to verify your identity via the FACEIT userinfo endpoint and is
        never forwarded to any third-party service. We do not sell or share any
        data with advertisers or analytics providers.
      </p>

      <h2>Data stored on your device</h2>
      <p>
        The extension stores the following in <code>chrome.storage.local</code>:
      </p>
      <ul>
        <li>Your FACEIT OAuth access and refresh tokens</li>
        <li>Your FACEIT display name (shown in the popup)</li>
        <li>
          A local copy of the flags you have personally submitted (for display
          in the popup and to allow removal)
        </li>
      </ul>
      <p>
        Nothing is synced across devices via <code>chrome.storage.sync</code>.
        Disconnecting your FACEIT account from the popup removes all stored
        tokens from your device immediately.
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
        reporter identifier, or to request that your hashed GUID be removed,
        email{" "}
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
        <a href="/tos/extension">Terms of Service</a>
        {" · "}
        <a href="/">Back to home</a>
      </p>
    </main>
  );
}
