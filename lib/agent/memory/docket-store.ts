/**
 * In-Memory Working Docket Store (Structured Slot Memory)
 *
 * Tracks caller case files, slot-filling state, and legal aid eligibility.
 * Runs in-memory with sub-millisecond access and supports real-time event subscriptions.
 */

export type CaseCategory =
  | "criminal_bail"
  | "domestic_violence"
  | "land_dispute"
  | "labor_wage"
  | "family_dower_maintenance"
  | "cyber_harassment"
  | "general_civil"
  | "emergency_detention";

import type { SeverityLevel } from "../knowledge/severity-classification";

export type UrgencyLevel = "normal" | "urgent" | "emergency_danger";

export type EligibilityStatus =
  | "eligible_100_free"
  | "partial_aid"
  | "ineligible_high_income"
  | "pending";

export interface CaseDocket {
  sessionId: string;
  callerName: string | null;
  phone: string | null;
  phonePrimary: boolean | null;
  phoneOperator: string | null;
  gender: string | null;
  hasDisability: boolean | null;
  disabilityType: string | null;
  disabilityTypeCode: string | null;
  district: string | null;
  thana: string | null;
  category: CaseCategory | null;
  incidentSummary: string | null;
  monthlyIncomeBdt: number | null;
  eligibilityStatus: EligibilityStatus;
  eligibilityReason: string | null;
  severityLevel: SeverityLevel | null;
  severityTags: string[];
  severityFactors: string[];
  severityCategory: string | null;
  severityCaseReference: string | null;
  docketId: string | null;
  urgency: UrgencyLevel;
  emergencyTriggered: boolean;
  assignedOffice: string | null;
  executedTools: Array<{ toolName: string; timestamp: number; summary: string }>;
  createdAt: string;
  updatedAt: string;
}

class DocketStore {
  private dockets = new Map<string, CaseDocket>();
  private listeners = new Map<string, Set<(docket: CaseDocket) => void>>();

  public getOrCreate(sessionId: string): CaseDocket {
    let docket = this.dockets.get(sessionId);
    if (!docket) {
      docket = {
        sessionId,
         callerName: null,
         phone: null,
         phonePrimary: null,
         phoneOperator: null,

         gender: null,
         hasDisability: null,
         disabilityType: null,
         disabilityTypeCode: null,
         district: null,

        thana: null,
        category: null,
        incidentSummary: null,
        monthlyIncomeBdt: null,
         eligibilityStatus: "pending",
         eligibilityReason: null,
         severityLevel: null,
         severityTags: [],
         severityFactors: [],
         severityCategory: null,
         severityCaseReference: null,
         docketId: null,

        urgency: "normal",
        emergencyTriggered: false,
        assignedOffice: null,
        executedTools: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.dockets.set(sessionId, docket);
    }
    return docket;
  }

  public update(sessionId: string, patch: Partial<CaseDocket>): CaseDocket {
    const docket = this.getOrCreate(sessionId);
    Object.assign(docket, patch, { updatedAt: new Date().toISOString() });
    this.notify(sessionId, docket);
    return docket;
  }

  public recordToolCall(sessionId: string, toolName: string, summary: string): void {
    const docket = this.getOrCreate(sessionId);
    docket.executedTools.push({
      toolName,
      timestamp: Date.now(),
      summary,
    });
    docket.updatedAt = new Date().toISOString();
    this.notify(sessionId, docket);
  }

  public subscribe(sessionId: string, callback: (docket: CaseDocket) => void): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }
    this.listeners.get(sessionId)!.add(callback);
    // Emit immediate current state
    callback(this.getOrCreate(sessionId));

    return () => {
      this.listeners.get(sessionId)?.delete(callback);
    };
  }

  private notify(sessionId: string, docket: CaseDocket) {
    const subs = this.listeners.get(sessionId);
    if (subs) {
      for (const cb of subs) {
        try {
          cb(docket);
        } catch {}
      }
    }
  }

  public clear(sessionId: string) {
    this.dockets.delete(sessionId);
    this.listeners.delete(sessionId);
  }
}

// Global singleton for the Next.js Node process
declare global {
  // eslint-disable-next-line no-var
  var __globalDocketStore: DocketStore | undefined;
}

export const docketStore = global.__globalDocketStore ?? new DocketStore();
if (process.env.NODE_ENV !== "production") {
  global.__globalDocketStore = docketStore;
}
