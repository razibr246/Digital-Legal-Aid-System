"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AgentSettings,
  DEFAULT_AGENT_SETTINGS,
  loadAgentSettings,
  saveAgentSettings,
  resetAgentSettings,
} from "@/lib/settings/agent-settings";

export function useAgentSettings() {
  const [settings, setSettingsState] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS);

  useEffect(() => {
    setSettingsState(loadAgentSettings());

    const handleUpdate = () => {
      setSettingsState(loadAgentSettings());
    };

    window.addEventListener("legal_agent_settings_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("legal_agent_settings_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<AgentSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveAgentSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const def = resetAgentSettings();
    setSettingsState(def);
  }, []);

  return {
    settings,
    updateSettings,
    resetSettings,
  };
}
