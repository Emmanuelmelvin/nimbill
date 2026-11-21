"use client";

import { useState } from "react";

/** This year, read in the browser so a page prerendered last December still shows the right one. */
export function CurrentYear() {
  const [year] = useState(() => new Date().getFullYear());
  return <span suppressHydrationWarning>{year}</span>;
}
