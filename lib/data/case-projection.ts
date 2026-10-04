export interface PortalCaseRow {
  id: string;
  docket_id: string;
  citizen_user_id: string;
  voice_session_id: string;
  application_id: string | null;
  application_time: string | null;
  applicant_name: string | null;
  primary_contact_number: string | null;
  has_disability: number | boolean | null;
  disability_type: string | null;
  gender: string | null;
  address: string | null;
  problem: string;
  problem_statement: string | null;
  source_language: string | null;
  original_transcript: string | null;
  semantic_matched: number | boolean | null;
  semantic_confidence: number | null;
  semantic_intent: string | null;
  semantic_normalized_bangla: string | null;
  intake_summary: string | null;
  urgency: string | null;
  priority: string | null;
  severity_level: string | null;
  severity_category: string | null;
  severity_factors_json: string | null;
  recording_id: string | null;
  recording_voice_session_id: string | null;
  recording_content_type: string | null;
  recording_duration_ms: number | null;
  recording_created_at: string | null;
  district: string | null;
  thana: string | null;
  category: string | null;
  status: string;
  assigned_lawyer_id: string | null;
  /** From the LEFT JOIN on panel_assignments/panel_lawyers in the list query. */
  lawyer_name?: string | null;
  dlao_notes: string | null;
  created_at: string;
  updated_at: string;
  display_name?: string | null;
  phone?: string | null;
}

export interface PortalCase {
  id: string;
  applicationId: string;
  docketId: string;
  citizenUserId: string;
  voiceSessionId: string;
  applicationTime: string;
  applicantName: string;
  citizenName: string;
  primaryContactNumber: string | null;
  citizenPhone: string | null;
  hasDisability: boolean;
  disabilityType: string | null;
  gender: string | null;
  address: string | null;
  problem: string;
  problemStatement: string;
  summary: string;
  sourceLanguage: string;
  originalTranscript: string | null;
  semanticMatched: boolean;
  semanticConfidence: number | null;
  semanticIntent: string | null;
  semanticNormalizedBangla: string | null;
  intakeSummary: string | null;
  urgency: string;
  priority: string;
  severityLevel: string | null;
  severityCategory: string | null;
  severityFactors: string[];
  recording: {
    id: string;
    voiceSessionId: string;
    contentType: string;
    durationMs: number;
    createdAt: string;
  } | null;
  district: string | null;
  thana: string | null;
  category: string | null;
  status: string;
  assignedLawyerId: string | null;
  /** Name of the active panel lawyer, so a collapsed picker can show who is on the case. */
  assignedLawyerName: string | null;
  dlaoNotes: string;
  createdAt: string;
  updatedAt: string;
}

function parseFactors(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function mapPortalCase(row: PortalCaseRow): PortalCase {
  const applicationId = row.application_id || row.docket_id || row.id;
  const applicantName = row.applicant_name || row.display_name || "Not provided";
  const primaryContactNumber = row.primary_contact_number || row.phone || null;
  const problemStatement = row.problem_statement || row.problem || "";
  const address = row.address || row.thana || null;

  return {
    id: row.id,
    applicationId,
    docketId: row.docket_id,
    citizenUserId: row.citizen_user_id,
    voiceSessionId: row.voice_session_id,
    applicationTime: row.application_time || row.created_at,
    applicantName,
    citizenName: applicantName,
    primaryContactNumber,
    citizenPhone: primaryContactNumber,
    hasDisability: Boolean(row.has_disability),
    disabilityType: row.disability_type || null,
    gender: row.gender || null,
    address,
    problem: problemStatement,
    problemStatement,
    summary: problemStatement,
    sourceLanguage: row.source_language || "bn",
    originalTranscript: row.original_transcript || null,
    semanticMatched: Boolean(row.semantic_matched),
    semanticConfidence: row.semantic_confidence ?? null,
    semanticIntent: row.semantic_intent || null,
    semanticNormalizedBangla: row.semantic_normalized_bangla || null,
    intakeSummary: row.intake_summary || problemStatement,
    urgency: row.urgency || "normal",
    priority: row.priority || "normal",
    severityLevel: row.severity_level || null,
    severityCategory: row.severity_category || null,
    severityFactors: parseFactors(row.severity_factors_json),
    recording: row.recording_id
      ? {
          id: row.recording_id,
          voiceSessionId: row.recording_voice_session_id || "",
          contentType: row.recording_content_type || "audio/webm",
          durationMs: row.recording_duration_ms || 0,
          createdAt: row.recording_created_at || row.created_at,
        }
      : null,
    district: row.district,
    thana: row.thana,
    category: row.category,
    status: row.status === "submitted" ? "pending_review" : row.status,
    assignedLawyerId: row.assigned_lawyer_id,
    assignedLawyerName: row.lawyer_name ?? null,
    dlaoNotes: row.dlao_notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
