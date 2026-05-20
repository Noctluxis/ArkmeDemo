import type {
  ArrangementItem,
  ArrangementInput,
  ArrangementSourceRef,
  ArrangementTimeKind,
  CompletionRecognitionMessage,
  CompletionSuggestion,
} from "@/data/arrangements";
import { createArrangementItem } from "@/data/arrangements";
import type { RecordItem } from "@/types/record";

export type AiRecognitionStatus =
  | "not-configured"
  | "configured"
  | "recognizing"
  | "failed"
  | "ready-to-confirm";

export type AiRecognitionConfidence = "low" | "medium" | "high";

export type ArrangementRecognitionSourceType = "self" | "private";

export type ArrangementRecognitionSource = {
  id: string;
  type: ArrangementRecognitionSourceType;
  title: string;
  text: string;
  createdAt: number;
};

export type AiRecognitionResult = {
  title: string;
  description: string;
  timeKind: ArrangementTimeKind;
  dueAt: number | null;
  startAt: number | null;
  endAt: number | null;
  location: string;
  people: string[];
  confidence: AiRecognitionConfidence;
  reason: string;
};

export type AiCompletionRecognitionResult = {
  isCompleted: boolean;
  arrangementId: string;
  confidence: number;
  evidence: string;
  reason: string;
};

export type ArrangementCompletionRecognitionRequest = {
  message: CompletionRecognitionMessage;
  arrangements: ArrangementItem[];
  context: ArrangementRecognitionRequestContext;
};

export type ArrangementDraft = {
  id: string;
  sourceRefs: ArrangementSourceRef[];
  result: AiRecognitionResult;
  status: AiRecognitionStatus;
  errorMessage: string;
  createdAt: number;
};

export type ArrangementPendingConfirmation = {
  draft: ArrangementDraft;
  sourceLabel: string;
  createdAt: number;
};

export type ArrangementRecognitionConfigStatus = {
  configured: boolean;
  provider: string;
  model: string;
};

export type ArrangementRecognitionRequestContext = {
  currentTime: string;
  currentTimeUtc: string;
  timeZone: string;
  timezoneOffsetMinutes: number;
  locale: string;
};

export const arrangementAutoRecognitionEnabledStorageKey =
  "arkme-demo.arrangements.autoRecognitionEnabled";

export function getInitialArrangementAutoRecognitionEnabled() {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(arrangementAutoRecognitionEnabledStorageKey) ===
    "true"
  );
}

export function persistArrangementAutoRecognitionEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    arrangementAutoRecognitionEnabledStorageKey,
    String(enabled)
  );
}

export function buildRecognitionSourceFromRecord(
  record: RecordItem,
  type: ArrangementRecognitionSourceType
): ArrangementRecognitionSource {
  const sourceLabel = record.sourceConversation?.label;
  return {
    id: record.uid,
    type,
    title: sourceLabel || (type === "self" ? "发给自己" : "私聊"),
    text: record.text_content.trim(),
    createdAt: record.send_at,
  };
}

export function createArrangementDraft(
  sources: ArrangementRecognitionSource[],
  result: AiRecognitionResult,
  now = Date.now()
): ArrangementDraft {
  return {
    id: `arrangement-draft-${now.toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    sourceRefs: sources.map(toSourceRef),
    result,
    status: "ready-to-confirm",
    errorMessage: "",
    createdAt: now,
  };
}

export function createArrangementInputFromDraft(
  draft: ArrangementDraft
): ArrangementInput {
  return {
    title: draft.result.title,
    description: draft.result.description,
    timeKind: draft.result.timeKind,
    dueAt: draft.result.dueAt,
    startAt: draft.result.startAt,
    endAt: draft.result.endAt,
    location: draft.result.location,
    people: draft.result.people,
    sourceRefs: draft.sourceRefs,
    executionLevel: "user-only",
  };
}

export function createArrangementPendingConfirmation(
  draft: ArrangementDraft,
  now = Date.now()
): ArrangementPendingConfirmation {
  return {
    draft,
    sourceLabel: draft.sourceRefs[0]?.title || "聊天",
    createdAt: now,
  };
}

export function shouldPromptArrangementRecognitionDraft(draft: ArrangementDraft) {
  return draft.result.confidence === "high";
}

export function shouldPromptCompletionSuggestion(
  result: AiCompletionRecognitionResult,
  arrangements: ArrangementItem[]
) {
  const matchedArrangement = arrangements.find(
    (arrangement) => arrangement.id === result.arrangementId
  );

  return (
    result.isCompleted &&
    result.confidence >= 0.9 &&
    Boolean(result.evidence) &&
    Boolean(result.reason) &&
    Boolean(matchedArrangement) &&
    isCompletionEligibleArrangement(matchedArrangement)
  );
}

export function createCompletionSuggestionFromRecognitionResult(
  result: AiCompletionRecognitionResult,
  message: CompletionRecognitionMessage,
  arrangements: ArrangementItem[],
  now = Date.now()
): CompletionSuggestion | null {
  if (!shouldPromptCompletionSuggestion(result, arrangements)) return null;

  const matchedArrangement = arrangements.find(
    (arrangement) => arrangement.id === result.arrangementId
  );
  if (!matchedArrangement) return null;

  return {
    id: `completion-${message.id}-${matchedArrangement.id}`,
    arrangementId: matchedArrangement.id,
    sourceRefs: [
      {
        id: message.id,
        type: message.type,
        title: message.title,
        excerpt: message.text,
        createdAt: message.createdAt,
      },
    ],
    reason: result.reason,
    confidence: "high",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

export function createAutoRecognizedArrangement(
  existingArrangements: ArrangementItem[],
  draft: ArrangementDraft,
  now = Date.now()
) {
  const sourceIds = new Set(draft.sourceRefs.map((source) => source.id));
  const alreadyExists = existingArrangements.some((arrangement) =>
    arrangement.sourceRefs.some((source) => sourceIds.has(source.id))
  );

  if (alreadyExists) return null;

  return createArrangementItem(createArrangementInputFromDraft(draft), now);
}

export async function loadArrangementRecognitionConfigStatus() {
  const response = await fetch("/api/arrangements/recognize/config", {
    method: "GET",
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "无法读取 AI 配置状态"));
  }
  return normalizeConfigStatus(payload);
}

export async function recognizeArrangementSources(
  sources: ArrangementRecognitionSource[]
) {
  const requestContext = createArrangementRecognitionRequestContext();
  const response = await fetch("/api/arrangements/recognize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...requestContext,
      sources,
    }),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "AI 识别失败"));
  }

  const resultPayload =
    payload && typeof payload === "object" && "result" in payload
      ? (payload as { result?: unknown }).result
      : payload;
  const result = normalizeRecognitionResultPayload(resultPayload);
  if (!result) {
    throw new Error("AI 返回内容无法转成安排草稿");
  }

  return createArrangementDraft(sources, result);
}

export async function recognizeArrangementCompletion(
  message: CompletionRecognitionMessage,
  arrangements: ArrangementItem[]
) {
  const requestContext = createArrangementRecognitionRequestContext();
  const response = await fetch("/api/arrangements/recognize-completion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...requestContext,
      message,
      arrangements: arrangements.map(toCompletionArrangementPayload),
    }),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "AI 完成识别失败"));
  }

  const resultPayload =
    payload && typeof payload === "object" && "result" in payload
      ? (payload as { result?: unknown }).result
      : payload;
  const result = normalizeCompletionRecognitionResultPayload(resultPayload);
  if (!result) return null;

  return createCompletionSuggestionFromRecognitionResult(
    result,
    message,
    arrangements
  );
}

export function createArrangementRecognitionRequestContext(
  now = Date.now(),
  timezoneOffsetMinutes = new Date(now).getTimezoneOffset()
): ArrangementRecognitionRequestContext {
  const offsetLabel = formatTimezoneOffset(timezoneOffsetMinutes);
  return {
    currentTime: `${formatLocalIsoDateTime(now, timezoneOffsetMinutes)}${offsetLabel}`,
    currentTimeUtc: new Date(now).toISOString(),
    timeZone: `UTC${offsetLabel}`,
    timezoneOffsetMinutes,
    locale: "zh-CN",
  };
}

function toSourceRef(
  source: ArrangementRecognitionSource
): ArrangementSourceRef {
  return {
    id: source.id,
    type: source.type,
    title: source.title,
    excerpt: source.text,
    createdAt: source.createdAt,
  };
}

function normalizeConfigStatus(
  payload: unknown
): ArrangementRecognitionConfigStatus {
  if (!payload || typeof payload !== "object") {
    return {
      configured: false,
      provider: "deepseek",
      model: "deepseek-v4-pro",
    };
  }
  const value = payload as Partial<ArrangementRecognitionConfigStatus>;
  return {
    configured: value.configured === true,
    provider: normalizeText(value.provider) || "deepseek",
    model: normalizeText(value.model) || "deepseek-v4-pro",
  };
}

export function normalizeRecognitionResultPayload(
  value: unknown
): AiRecognitionResult | null {
  const unwrappedValue =
    value &&
    typeof value === "object" &&
    "outputSchema" in value &&
    (value as { outputSchema?: unknown }).outputSchema
      ? (value as { outputSchema?: unknown }).outputSchema
      : value;

  return normalizeRecognitionResult(unwrappedValue);
}

export function normalizeCompletionRecognitionResultPayload(
  value: unknown
): AiCompletionRecognitionResult | null {
  const unwrappedValue =
    value &&
    typeof value === "object" &&
    "outputSchema" in value &&
    (value as { outputSchema?: unknown }).outputSchema
      ? (value as { outputSchema?: unknown }).outputSchema
      : value;

  if (!unwrappedValue || typeof unwrappedValue !== "object") return null;
  const result = unwrappedValue as Partial<AiCompletionRecognitionResult>;
  const confidence = normalizeCompletionConfidence(result.confidence);

  return {
    isCompleted: result.isCompleted === true,
    arrangementId: normalizeText(result.arrangementId),
    confidence,
    evidence: normalizeText(result.evidence),
    reason: normalizeText(result.reason),
  };
}

function normalizeRecognitionResult(value: unknown): AiRecognitionResult | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Partial<AiRecognitionResult>;
  const title = normalizeText(result.title);
  if (!title) return null;

  return {
    title,
    description: normalizeText(result.description),
    timeKind: normalizeTimeKind(result.timeKind),
    dueAt: normalizeTimestamp(result.dueAt),
    startAt: normalizeTimestamp(result.startAt),
    endAt: normalizeTimestamp(result.endAt),
    location: normalizeText(result.location),
    people: normalizePeople(result.people),
    confidence: normalizeConfidence(result.confidence),
    reason: normalizeText(result.reason),
  };
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    return normalizeText((payload as { message?: unknown }).message) || fallback;
  }
  return fallback;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePeople(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((person) => normalizeText(person))
    .filter((person) => person.length > 0);
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeCompletionConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value > 1 && value <= 100) return value / 100;
  return Math.min(Math.max(value, 0), 1);
}

function isCompletionEligibleArrangement(arrangement: ArrangementItem | undefined) {
  return (
    arrangement?.status === "active" ||
    arrangement?.status === "later"
  );
}

function toCompletionArrangementPayload(arrangement: ArrangementItem) {
  return {
    id: arrangement.id,
    title: arrangement.title,
    description: arrangement.description,
    status: arrangement.status,
    timeKind: arrangement.timeKind,
    dueAt: arrangement.dueAt,
    startAt: arrangement.startAt,
    endAt: arrangement.endAt,
    location: arrangement.location,
    people: arrangement.people,
    reminderNote: arrangement.reminderNote,
    sourceRefs: arrangement.sourceRefs,
    executionLevel: arrangement.executionLevel,
    createdAt: arrangement.createdAt,
    updatedAt: arrangement.updatedAt,
  };
}

function formatLocalIsoDateTime(
  timestamp: number,
  timezoneOffsetMinutes: number
) {
  const localTime = new Date(timestamp - timezoneOffsetMinutes * 60_000);
  return localTime.toISOString().slice(0, 19);
}

function formatTimezoneOffset(timezoneOffsetMinutes: number) {
  const sign = timezoneOffsetMinutes <= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(timezoneOffsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const minutes = String(absoluteMinutes % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function normalizeTimeKind(value: unknown): ArrangementTimeKind {
  return value === "due" || value === "range" || value === "none" ? value : "none";
}

function normalizeConfidence(value: unknown): AiRecognitionConfidence {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : "medium";
}
