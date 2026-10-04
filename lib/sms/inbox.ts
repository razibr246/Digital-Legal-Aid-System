export interface SimulatedSms {
  id: string;
  to: string;
  message: string;
  createdAt: string;
}

const STORAGE_KEY = "legal-voice-agent-simulated-sms";

export function saveSimulatedSms(to: string, message: string): SimulatedSms {
  const sms: SimulatedSms = {
    id: crypto.randomUUID(),
    to,
    message,
    createdAt: new Date().toISOString(),
  };
  const current = getSimulatedSms();
  localStorage.setItem(STORAGE_KEY, JSON.stringify([sms, ...current].slice(0, 20)));
  return sms;
}

export function getSimulatedSms(): SimulatedSms[] {
  if (typeof window === "undefined") return [];
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearSimulatedSms(): void {
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
}
