# ELO TERRORISTS — extension

## OAuth wiring

Three values have to name the same FACEIT OAuth client. Drift between them is
the single most common way login breaks, and the failure looks different at
each layer, so check all three before debugging anything else:

| Where | What |
| --- | --- |
| `background.js` → `FACEIT_CLIENT_ID` | the client the authorize request is made against |
| Vercel env → `FACEIT_CLIENT_ID` / `FACEIT_CLIENT_SECRET` | the credentials `/api/et/oauth/token` exchanges the code with |
| FACEIT developer portal | the client that owns the registered redirect URI |

The redirect URI is derived from the extension ID:

```
https://<extension-id>.chromiumapp.org/
```

`chrome.identity.launchWebAuthFlow` will only accept a redirect back to that
exact host, and FACEIT will only redirect to a URI registered on the client, so
the extension ID is effectively part of the OAuth config.

## Getting the extension ID

**Published (Chrome Web Store).** The store assigns a permanent ID at *first
upload*, not at publish — upload the zip as a draft and the ID is in the
dashboard (and in the item URL). Register its `chromiumapp.org` redirect URI
with FACEIT before going live, or the first install cannot log in.

**Unpacked (development).** Chrome derives the ID from the install path, so it
differs per machine and every clone gets a redirect URI FACEIT does not know.
Two ways out:

- Install from the store and develop against that build, or
- pin the ID by adding a `key` field to this manifest — the base64 public half
  of a keypair, which forces a fixed ID on every unpacked install.

To make unpacked development share the published ID, take the public key from
the store item and add it as `key` here locally. **Do not ship that field in an
uploaded package** — the store assigns its own key, and the field can fail the
upload.

## Store submission checklist

- [ ] `icons` (16/32/48/128) in the manifest — currently absent, so Chrome
      falls back to the generic puzzle-piece icon
- [ ] 128×128 store icon, screenshots, listing copy
- [ ] Privacy policy URL — the extension sends FACEIT identity and reports to
      `steamfriends.xyz`, so the data-use disclosures have to be filled in
- [ ] Justification for each `host_permissions` entry and for `identity` /
      `storage`
- [ ] Redirect URI for the assigned ID registered with FACEIT
