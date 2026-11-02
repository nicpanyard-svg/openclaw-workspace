"use client";

import { useEffect, useState } from "react";
import { broadcastResponseToMainFrame } from "@azure/msal-browser/redirect-bridge";

export default function OutlookCallback() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void broadcastResponseToMainFrame().catch(() => setFailed(true));
  }, []);
  return <p role="status">{failed ? "Outlook could not finish connecting. Close this window and try again in RapidQuote." : "Connecting Outlook..."}</p>;
}
