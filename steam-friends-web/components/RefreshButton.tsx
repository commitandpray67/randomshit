"use client";

import { useFormStatus } from "react-dom";

export default function RefreshButton({
  label = "Refresh",
  pendingLabel = "Refreshing…",
}: {
  label?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending && <span className="spinner" aria-hidden="true" />}
      {pending ? pendingLabel : label}
    </button>
  );
}
