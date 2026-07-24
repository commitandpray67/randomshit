"use client";

import { useFormStatus } from "react-dom";

/** Submit button for the dashboard refresh form; shows a spinner while the
 * server action is re-syncing from Steam so the click has visible feedback. */
export default function RefreshButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending && <span className="spinner" aria-hidden="true" />}
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
