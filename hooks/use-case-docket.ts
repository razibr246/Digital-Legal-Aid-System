"use client";

import { useEffect, useState } from "react";
import type { CaseDocket } from "@/lib/agent/memory/docket-store";

export function useCaseDocket(sessionId: string | null) {
  const [docket, setDocket] = useState<CaseDocket | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setDocket(null);
      return;
    }

    let active = true;
    const fetchDocket = () => {
      fetch(`/api/agent/docket?sessionId=${encodeURIComponent(sessionId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json?.docket && active) {
            setDocket(json.docket);
          }
        })
        .catch(() => {});
    };

    fetchDocket();
    const interval = setInterval(fetchDocket, 2500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  return docket;
}
