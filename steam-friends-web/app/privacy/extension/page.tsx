import type { Metadata } from "next";

// Indexable: the Chrome Web Store listing points here, and a policy the store
// requires you to publish should not be telling crawlers to ignore it.
export const metadata: Metadata = {
  title: "ELO TERRORISTS — Privacy Policy",
  alternates: { canonical: "https://steamfriends.xyz/privacy/extension" },
};

export default function ExtensionPrivacy() {
  return (
    <main>
      <h1>ELO TERRORISTS — Privacy Policy</h1>
      <p className="muted">Last updated: August 2026 · Chrome Extension</p>

      <h2>Overview</h2>
      <p>
        ELO TERRORISTS is a Chrome extension that allows FACEIT CS2 players to
        flag and track suspected match-fixers and game-throwers in a shared
        community database. This policy explains what data the extension
        collects, how it is stored, and how it is used.
      </p>

      <h2>Summary</h2>
      <p>
        The extension handles three categories of data, matching the disclosures
        on its Chrome Web Store listing:
      </p>
      <ul>
        <li>
          <strong>Authentication information</strong> — FACEIT OAuth tokens,
          stored on your device and sent to our API so it can verify your
          identity with FACEIT.
        </li>
        <li>
          <strong>Personally identifiable information</strong> — FACEIT nicknames
          and account IDs, and the public Steam IDs they map to.
        </li>
        <li>
          <strong>Website content</strong> — player nicknames read from the
          FACEIT page you are viewing, sent to our API to be looked up.
        </li>
      </ul>
      <p>
        We do not collect health, financial, or location data, personal
        communications, browsing history, or any record of your activity on
        pages. We do not sell or transfer data to third parties, and we do not
        use it for anything outside the purpose described here.
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
        The flag button is only offered inside a matchroom, never on profiles or
        elsewhere on FACEIT. When you use it, the extension sends the current
        match ID to our server. Our server independently calls the FACEIT
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
        The access token is sent to our API when you submit or delete a flag, so
        the server can confirm who you are with FACEIT before accepting it.
        Refresh and token exchange also pass through our server, which forwards
        them to FACEIT — this is necessary because FACEIT&apos;s token endpoint
        requires a client secret that cannot safely be shipped inside a browser
        extension. The tokens are not sent anywhere else, and we do not retain
        them after the request they were used for.
      </p>

      <h3>Reporter identifier</h3>
      <p>
        We never store your FACEIT username or GUID in plain text on our servers.
        When a flag is accepted, our server computes a one-way SHA-256 hash of
        your FACEIT GUID
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
        We do not store your FACEIT username, email address, or any other
        personally identifiable information in the community database.
      </p>

      <h3>Network information</h3>
      <p>
        Like any web service, our API receives the IP address your requests come
        from. It is used only as a short-lived, in-memory key for rate limiting,
        to stop one person flooding the database. It is never written to our
        database, never attached to a report, and is discarded when the rate-limit
        window expires. We do not use analytics, advertising, or tracking
        services of any kind.
      </p>

      <h3>Player nicknames read from FACEIT pages</h3>
      <p>
        On FACEIT pages you visit, the extension reads the player nicknames
        visible in the page — match rosters, scoreboards and profile links. Those
        nicknames are sent to our API, which resolves them to Steam IDs and
        returns the community flag status used to highlight them. This is the
        core lookup the extension performs and it cannot work offline.
      </p>
      <p>
        To avoid repeating identical lookups, our server keeps a cache mapping a
        nickname to its public FACEIT player ID and Steam ID, refreshed at least
        every 24 hours. The extension caches the same results in{" "}
        <code>chrome.storage.session</code>, which is cleared when you close the
        browser.
      </p>
      <p>
        These lookups are not tied to you. We do not record which page you were
        on, when you visited it, or which account requested a nickname — the
        cache stores only the public nickname-to-Steam-ID mapping itself, with no
        reference to the user who triggered it. Lookups do not require you to be
        signed in.
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
        <li>Your FACEIT OAuth access and refresh tokens, and their expiry time</li>
        <li>
          Your FACEIT nickname and account ID, shown in the popup so you can see
          which account is connected. These stay on your device — only the hashed
          form of the account ID ever reaches our servers.
        </li>
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
