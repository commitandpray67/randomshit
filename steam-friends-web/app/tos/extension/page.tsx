import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ELO TERRORISTS — Terms of Service",
  robots: { index: false, follow: false },
};

export default function ExtensionToS() {
  return (
    <main>
      <h1>ELO TERRORISTS — Terms of Service</h1>
      <p className="muted">Last updated: July 2026 · Chrome Extension</p>

      <h2>1. What this service is</h2>
      <p>
        ELO TERRORISTS (&ldquo;the extension&rdquo;, &ldquo;the service&rdquo;) is a
        community-operated Chrome extension and database that allows FACEIT CS2 players to
        submit reports (&ldquo;flags&rdquo;) about other players they believe to be
        match-fixers or consistent game-throwers. Flags are aggregated and displayed to
        all extension users to help them identify potentially problematic players in their
        lobbies.
      </p>
      <p>
        The service is not affiliated with, endorsed by, or operated by Valve Corporation,
        FACEIT Ltd., or any official CS2 or FACEIT entity. All player data displayed is
        sourced from public FACEIT APIs and community submissions.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        To submit flags you must connect a valid FACEIT account via the in-extension OAuth
        flow. By connecting your account you confirm that you are the account&apos;s
        legitimate owner and that you are at least 13 years old (or the minimum age
        required by your jurisdiction to use online services).
      </p>

      <h2>3. Acceptable use</h2>
      <p>You agree to use the service only for its intended purpose: reporting players
        whose in-game conduct you have personally observed and reasonably believe to
        constitute match-fixing or intentional game-throwing in FACEIT CS2 matches.
        Specifically you agree to:
      </p>
      <ul>
        <li>Flag only players you have encountered in real matches.</li>
        <li>Assign ranks honestly and proportionately to the behavior you observed.</li>
        <li>Write flag comments that describe in-game conduct, not personal
          characteristics.</li>
        <li>Remove flags if you later believe they were submitted in error.</li>
      </ul>

      <h2>4. Prohibited conduct</h2>
      <p>You must not:</p>
      <ul>
        <li>Submit false, fabricated, or deliberately misleading flags.</li>
        <li>Use the service to harass, target, or defame specific individuals.</li>
        <li>Coordinate with others to mass-flag a player without independent evidence.</li>
        <li>Include personal information (real names, addresses, social media handles,
          etc.) in flag comments.</li>
        <li>Attempt to circumvent rate limits, access controls, or the FACEIT identity
          verification step.</li>
        <li>Use automated tools, scripts, or bots to submit or manipulate flags.</li>
        <li>Resell, redistribute, or commercially exploit the community database or any
          part of the service.</li>
      </ul>

      <h2>5. Content you submit</h2>
      <p>
        When you submit a flag you grant us a non-exclusive, royalty-free licence to
        store, aggregate, and display that flag (including the rank and comment) to other
        users of the service. You retain no expectation of privacy for flag content — it
        is visible to all extension users.
      </p>
      <p>
        You are solely responsible for the flags and comments you submit. Do not include
        content that is defamatory, discriminatory, or otherwise unlawful.
      </p>

      <h2>6. No guarantee of accuracy</h2>
      <p>
        All flags in the database represent the opinions of community members, not
        verified facts. We make no warranty that any flag is accurate, fair, or
        up to date. Ranks displayed may not reflect a player&apos;s current behaviour.
        Do not use this service as the sole basis for real-world decisions. We are not
        liable for any harm caused by reliance on community-submitted data.
      </p>

      <h2>7. Identity and privacy</h2>
      <p>
        Connecting your FACEIT account enables the service to verify your identity and
        (when flagging from within a matchroom) confirm that you were a participant in
        that match. Your FACEIT username and account GUID are never stored in plain text
        on our servers — we store only a one-way cryptographic hash of your FACEIT GUID
        as a stable reporter identifier. See the{" "}
        <a href="/privacy/extension">Privacy Policy</a> for full details.
      </p>

      <h2>8. Suspension and termination</h2>
      <p>
        We reserve the right to block any reporter identity from submitting further flags,
        without notice, if we determine that the account is being used in violation of
        these terms — including submitting coordinated false reports or attempting to
        abuse or circumvent the system. Existing flags submitted in violation may be
        removed from the database.
      </p>

      <h2>9. Disclaimer of warranties</h2>
      <p>
        The service is provided &ldquo;as is&rdquo; without warranty of any kind, express
        or implied. We do not guarantee uptime, data retention, or that the service will
        remain available. We may modify, suspend, or discontinue the service at any time.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by applicable law, we shall not be liable for any
        indirect, incidental, special, or consequential damages arising from your use of
        the service, including but not limited to reputational harm to any player listed
        in the community database.
      </p>

      <h2>11. Changes to these terms</h2>
      <p>
        We may update these terms at any time. Continued use of the extension after a
        revised version is published at this URL constitutes acceptance of the new terms.
        Material changes will be reflected by an updated &ldquo;Last updated&rdquo; date.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions or abuse reports can be sent to{" "}
        <a href="mailto:help@steamfriends.xyz">help@steamfriends.xyz</a>.
      </p>

      <p style={{ marginTop: "2rem" }}>
        <a href="/extension">← Back to ELO TERRORISTS</a>
        {" · "}
        <a href="/privacy/extension">Privacy Policy</a>
        {" · "}
        <a href="/">Back to home</a>
      </p>
    </main>
  );
}
