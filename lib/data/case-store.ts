export type CaseStatus = "pending_review" | "needs_documents" | "assigned" | "closed";

export interface LegalCase {
  id: string;
  docketId: string;
  citizenPhone: string;
  citizenName: string;
  summary: string;
  status: CaseStatus;
  assignedLawyerId: string | null;
  dlaoNotes: string;
  createdAt: number;
}

interface CaseStoreData {
  cases: Map<string, LegalCase>;
}

const globalStore = globalThis as typeof globalThis & {
  __legalVoiceCaseStore?: CaseStoreData;
};

function getStore(): CaseStoreData {
  if (!globalStore.__legalVoiceCaseStore) {
    globalStore.__legalVoiceCaseStore = { cases: new Map() };
    
    // Seed some mock data for the demo
    const mockCase: LegalCase = {
      id: "CASE-2025-0001",
      docketId: "demo-DLAS-2025-1234",
      citizenPhone: "01700000000",
      citizenName: "রহিম মিয়া",
      summary: "জমিজমা সংক্রান্ত পারিবারিক বিরোধ এবং দখল উচ্ছেদ।",
      status: "pending_review",
      assignedLawyerId: null,
      dlaoNotes: "",
      createdAt: Date.now() - 86400000 * 2, // 2 days ago
    };
    globalStore.__legalVoiceCaseStore.cases.set(mockCase.id, mockCase);
  }
  return globalStore.__legalVoiceCaseStore;
}

export const caseStore = {
  getAll: () => Array.from(getStore().cases.values()).sort((a, b) => b.createdAt - a.createdAt),
  
  getById: (id: string) => getStore().cases.get(id) || null,
  
  getByCitizen: (phone: string) => 
    Array.from(getStore().cases.values())
      .filter(c => c.citizenPhone === phone)
      .sort((a, b) => b.createdAt - a.createdAt),
      
  getByLawyer: (lawyerId: string) => 
    Array.from(getStore().cases.values())
      .filter(c => c.assignedLawyerId === lawyerId)
      .sort((a, b) => b.createdAt - a.createdAt),

  create: (data: Omit<LegalCase, "id" | "createdAt" | "status" | "assignedLawyerId" | "dlaoNotes">) => {
    const id = `CASE-2025-${String(getStore().cases.size + 1).padStart(4, "0")}`;
    const newCase: LegalCase = {
      ...data,
      id,
      status: "pending_review",
      assignedLawyerId: null,
      dlaoNotes: "",
      createdAt: Date.now(),
    };
    getStore().cases.set(id, newCase);
    return newCase;
  },

  update: (id: string, patch: Partial<LegalCase>) => {
    const existing = getStore().cases.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    getStore().cases.set(id, updated);
    return updated;
  }
};

export function getStatusVariant(status: string): "new" | "pending" | "overdue" | "urgent" | "closed" | "success" {
  switch (status) {
    case "pending_review": return "new";
    case "needs_documents": return "pending";
    case "assigned": return "success";
    case "closed": return "closed";
    default: return "pending";
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "pending_review": return "পর্যালোচনার অপেক্ষায়";
    case "needs_documents": return "কাগজপত্র প্রয়োজন";
    case "assigned": return "আইনজীবী নিযুক্ত";
    case "closed": return "নিষ্পত্তি";
    default: return status;
  }
}
