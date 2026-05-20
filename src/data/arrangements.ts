export type ArrangementStatus = "active" | "completed" | "later" | "merged";

export type ArrangementTimeKind = "none" | "due" | "range";

export type ArrangementSourceType =
  | "manual"
  | "self"
  | "private"
  | "group"
  | "demo-ai";

export type ArrangementExecutionLevel =
  | "user-only"
  | "ai-assisted"
  | "ai-executable";

export type ArrangementSourceRef = {
  id: string;
  type: ArrangementSourceType;
  title: string;
  excerpt: string;
  createdAt: number;
};

export type ReminderRuleType = "before" | "same-day" | "recurring";

export type ReminderRecurrence = "daily" | "weekly";

export type ReminderRule = {
  id: string;
  type: ReminderRuleType;
  enabled: boolean;
  offsetMinutes?: number | null;
  timeOfDayMinutes?: number | null;
  recurrence?: ReminderRecurrence | null;
  createdAt: number;
  updatedAt: number;
};

export type ReminderOccurrence = {
  id: string;
  arrangement: ArrangementItem;
  rule: ReminderRule;
  triggerAt: number;
  title: string;
};

export type CalendarBucket = {
  dateKey: string;
  arrangements: ArrangementItem[];
};

export type SuggestionStatus = "pending" | "accepted" | "dismissed";

export type SuggestionConfidence = "low" | "medium" | "high";

export type MergeSuggestion = {
  id: string;
  primaryArrangementId: string;
  candidateArrangementIds: string[];
  reason: string;
  confidence: SuggestionConfidence;
  status: SuggestionStatus;
  createdAt: number;
  updatedAt: number;
};

export type CompletionRecognitionMessage = {
  id: string;
  type: "self" | "private";
  title: string;
  text: string;
  createdAt: number;
};

export type CompletionSuggestion = {
  id: string;
  arrangementId: string;
  sourceRefs: ArrangementSourceRef[];
  reason: string;
  confidence: SuggestionConfidence;
  status: SuggestionStatus;
  createdAt: number;
  updatedAt: number;
};

export type ArrangementItem = {
  id: string;
  title: string;
  description: string;
  status: ArrangementStatus;
  timeKind: ArrangementTimeKind;
  dueAt: number | null;
  startAt: number | null;
  endAt: number | null;
  location: string;
  people: string[];
  reminderNote: string;
  reminderRules: ReminderRule[];
  sourceRefs: ArrangementSourceRef[];
  executionLevel: ArrangementExecutionLevel;
  mergedIntoId: string | null;
  mergedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type ArrangementInput = {
  title: string;
  description?: string;
  timeKind?: ArrangementTimeKind;
  dueAt?: number | null;
  startAt?: number | null;
  endAt?: number | null;
  location?: string;
  people?: string[] | string;
  reminderNote?: string;
  reminderRules?: ReminderRule[];
  sourceRefs?: ArrangementSourceRef[];
  executionLevel?: ArrangementExecutionLevel;
  mergedIntoId?: string | null;
  mergedAt?: number | null;
};

export type ArrangementGroups = {
  focus: ArrangementItem[];
  upcoming: ArrangementItem[];
  noTime: ArrangementItem[];
  later: ArrangementItem[];
  completed: ArrangementItem[];
};

export const arrangementsStorageKey = "arkme-demo.arrangements.v1";
export const arrangementsStorageEvent = "arkme-demo:arrangements-updated";

const oneDayMs = 1000 * 60 * 60 * 24;
const staleOverdueMs = oneDayMs * 3;

export function getInitialArrangements(now = Date.now()): ArrangementItem[] {
  if (typeof window === "undefined") {
    return createSeedArrangements(now);
  }

  const storedValue = window.localStorage.getItem(arrangementsStorageKey);
  if (!storedValue) {
    const seedArrangements = createSeedArrangements(now);
    persistArrangements(seedArrangements);
    return seedArrangements;
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) return createSeedArrangements(now);
    const arrangements = parsedValue
      .map(normalizeArrangementItem)
      .filter((item): item is ArrangementItem => item !== null);
    return arrangements.length > 0 ? arrangements : createSeedArrangements(now);
  } catch {
    return createSeedArrangements(now);
  }
}

export function persistArrangements(arrangements: ArrangementItem[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(arrangementsStorageKey, JSON.stringify(arrangements));
    window.dispatchEvent(new Event(arrangementsStorageEvent));
  } catch {
    // Keep the in-memory UI usable when localStorage is unavailable.
  }
}

export function createArrangementItem(
  input: ArrangementInput,
  now = Date.now()
): ArrangementItem {
  const timeKind = input.timeKind ?? inferTimeKind(input);

  return {
    id: createArrangementId(now),
    title: normalizeText(input.title) || "未命名安排",
    description: normalizeText(input.description),
    status: "active",
    timeKind,
    dueAt: input.dueAt ?? null,
    startAt: input.startAt ?? null,
    endAt: input.endAt ?? null,
    location: normalizeText(input.location),
    people: normalizePeople(input.people),
    reminderNote: normalizeText(input.reminderNote),
    reminderRules: normalizeReminderRules(input.reminderRules),
    sourceRefs: input.sourceRefs ?? [],
    executionLevel: input.executionLevel ?? "user-only",
    mergedIntoId: input.mergedIntoId ?? null,
    mergedAt: input.mergedAt ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createDemoRecognitionArrangement(now = Date.now()): ArrangementItem {
  const tomorrowMorning = startOfLocalDay(now) + oneDayMs + 9 * 60 * 60 * 1000;

  return createArrangementItem(
    {
      title: "帮林夏带早餐",
      description: "明天到公司时顺手帮林夏带一份早餐。",
      timeKind: "due",
      dueAt: tomorrowMorning,
      location: "公司",
      people: ["林夏"],
      reminderNote: "到公司路上看一眼",
      sourceRefs: [
        {
          id: "demo-ai-breakfast",
          type: "demo-ai",
          title: "演示识别",
          excerpt: "林夏：明天到公司能帮我带份早餐吗？",
          createdAt: now - 1000 * 60 * 8,
        },
      ],
      executionLevel: "user-only",
    },
    now
  );
}

export function updateArrangementStatus(
  arrangements: ArrangementItem[],
  id: string,
  status: ArrangementStatus,
  now = Date.now()
) {
  return arrangements.map((arrangement) =>
    arrangement.id === id
      ? {
          ...arrangement,
          status,
          updatedAt: now,
        }
      : arrangement
  );
}

export function upsertArrangement(
  arrangements: ArrangementItem[],
  nextArrangement: ArrangementItem
) {
  const existingIndex = arrangements.findIndex(
    (arrangement) => arrangement.id === nextArrangement.id
  );
  if (existingIndex < 0) {
    return [nextArrangement, ...arrangements];
  }

  return arrangements.map((arrangement) =>
    arrangement.id === nextArrangement.id ? nextArrangement : arrangement
  );
}

export function groupArrangementItems(
  arrangements: ArrangementItem[],
  now = Date.now()
): ArrangementGroups {
  const groups: ArrangementGroups = {
    focus: [],
    upcoming: [],
    noTime: [],
    later: [],
    completed: [],
  };

  const sortedArrangements = [...arrangements].sort(compareArrangements);
  sortedArrangements.forEach((arrangement) => {
    if (arrangement.status === "merged") return;
    if (arrangement.status === "completed") {
      groups.completed.push(arrangement);
      return;
    }
    if (arrangement.status === "later") {
      groups.later.push(arrangement);
      return;
    }
    const primaryTime = getArrangementPrimaryTime(arrangement);
    if (arrangement.timeKind === "none" || primaryTime === null) {
      groups.noTime.push(arrangement);
      return;
    }
    if (primaryTime <= now + oneDayMs) {
      groups.focus.push(arrangement);
      return;
    }
    groups.upcoming.push(arrangement);
  });

  groups.focus.sort((first, second) => compareFocusArrangements(first, second, now));
  return groups;
}

export function applyAutomaticArrangementRules(
  arrangements: ArrangementItem[],
  now = Date.now()
) {
  let changed = false;
  const nextArrangements = arrangements.map((arrangement) => {
    if (!isStaleOverdueArrangement(arrangement, now)) return arrangement;
    changed = true;
    return {
      ...arrangement,
      status: "later" as ArrangementStatus,
      updatedAt: now,
    };
  });

  return changed ? nextArrangements : arrangements;
}

export function formatArrangementTime(arrangement: ArrangementItem) {
  if (arrangement.timeKind === "none") return "无明确时间";
  if (arrangement.timeKind === "range" && arrangement.startAt && arrangement.endAt) {
    return `${formatShortDateTime(arrangement.startAt)} - ${formatShortTime(
      arrangement.endAt
    )}`;
  }
  if (arrangement.dueAt) return formatShortDateTime(arrangement.dueAt);
  return "时间待确认";
}

export function isArrangementOverdue(arrangement: ArrangementItem, now = Date.now()) {
  const primaryTime = getArrangementPrimaryTime(arrangement);
  return (
    arrangement.status === "active" &&
    primaryTime !== null &&
    primaryTime < now
  );
}

export function searchArrangementItems(
  arrangements: ArrangementItem[],
  query: string
) {
  const keywords = normalizeSearchKeywords(query);
  if (keywords.length === 0) return [];

  return arrangements.filter((arrangement) => {
    if (arrangement.status === "merged") return false;
    const searchableText = buildArrangementSearchText(arrangement);
    return keywords.every((keyword) => searchableText.includes(keyword));
  });
}

export function buildCalendarBuckets(
  arrangements: ArrangementItem[],
  startAt: number,
  endAt: number
): CalendarBucket[] {
  const bucketMap = new Map<string, ArrangementItem[]>();

  arrangements.forEach((arrangement) => {
    if (arrangement.status === "merged") return;
    if (arrangement.timeKind === "none") return;

    const dateKeys = getArrangementCalendarDateKeys(arrangement, startAt, endAt);
    dateKeys.forEach((dateKey) => {
      const existing = bucketMap.get(dateKey) ?? [];
      existing.push(arrangement);
      bucketMap.set(dateKey, existing);
    });
  });

  return Array.from(bucketMap.entries())
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .map(([dateKey, bucketArrangements]) => ({
      dateKey,
      arrangements: bucketArrangements.sort(compareArrangements),
    }));
}

export function getReminderOccurrences(
  arrangements: ArrangementItem[],
  now = Date.now()
): ReminderOccurrence[] {
  return arrangements
    .filter((arrangement) => arrangement.status === "active")
    .flatMap((arrangement) =>
      arrangement.reminderRules
        .filter((rule) => rule.enabled)
        .map((rule) => createReminderOccurrence(arrangement, rule, now))
        .filter(
          (occurrence): occurrence is ReminderOccurrence => occurrence !== null
        )
    )
    .sort((first, second) => first.triggerAt - second.triggerAt);
}

export function findMergeSuggestions(
  arrangements: ArrangementItem[],
  now = Date.now()
): MergeSuggestion[] {
  const visibleArrangements = arrangements
    .filter(
      (arrangement) =>
        arrangement.status !== "merged" && arrangement.status !== "completed"
    )
    .sort(compareArrangements);
  const suggestions: MergeSuggestion[] = [];
  const seenCandidateIds = new Set<string>();

  visibleArrangements.forEach((primary) => {
    if (seenCandidateIds.has(primary.id)) return;
    const candidates = visibleArrangements.filter((candidate) => {
      if (candidate.id === primary.id || seenCandidateIds.has(candidate.id)) {
        return false;
      }
      return shouldSuggestMerge(primary, candidate);
    });

    if (candidates.length === 0) return;

    candidates.forEach((candidate) => seenCandidateIds.add(candidate.id));
    suggestions.push({
      id: `merge-${primary.id}-${candidates.map((item) => item.id).join("-")}`,
      primaryArrangementId: primary.id,
      candidateArrangementIds: candidates.map((candidate) => candidate.id),
      reason: buildMergeReason(primary, candidates),
      confidence: candidates.some((candidate) => isHospitalLikePair(primary, candidate))
        ? "high"
        : "medium",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  });

  return suggestions;
}

export function acceptMergeSuggestion(
  arrangements: ArrangementItem[],
  suggestion: MergeSuggestion,
  now = Date.now()
): ArrangementItem[] {
  const primary = arrangements.find(
    (arrangement) => arrangement.id === suggestion.primaryArrangementId
  );
  if (!primary) return arrangements;

  const candidateIds = new Set(suggestion.candidateArrangementIds);
  const candidateSources = arrangements
    .filter((arrangement) => candidateIds.has(arrangement.id))
    .flatMap((arrangement) => arrangement.sourceRefs);
  const mergedSources = mergeSourceRefs(primary.sourceRefs, candidateSources);

  return arrangements.map((arrangement) => {
    if (arrangement.id === primary.id) {
      return {
        ...arrangement,
        sourceRefs: mergedSources,
        updatedAt: now,
      };
    }
    if (!candidateIds.has(arrangement.id)) return arrangement;
    return {
      ...arrangement,
      status: "merged" as ArrangementStatus,
      mergedIntoId: primary.id,
      mergedAt: now,
      updatedAt: now,
    };
  });
}

export function findCompletionSuggestion(
  arrangements: ArrangementItem[],
  message: CompletionRecognitionMessage,
  now = Date.now()
): CompletionSuggestion | null {
  if (!hasCompletionIntent(message.text)) return null;

  const candidates = arrangements
    .filter((arrangement) => arrangement.status === "active")
    .map((arrangement) => ({
      arrangement,
      score: scoreCompletionMatch(arrangement, message),
    }))
    .filter((candidate) => candidate.score >= 2)
    .sort((first, second) => second.score - first.score);

  const matched = candidates[0]?.arrangement;
  if (!matched) return null;

  const sourceRef: ArrangementSourceRef = {
    id: message.id,
    type: message.type,
    title: message.title,
    excerpt: message.text,
    createdAt: message.createdAt,
  };

  return {
    id: `completion-${message.id}-${matched.id}`,
    arrangementId: matched.id,
    sourceRefs: [sourceRef],
    reason: `后续对话提到“${message.text.slice(0, 24)}”，与安排“${
      matched.title
    }”高度相关，并包含已完成表达。`,
    confidence: "high",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

export function acceptCompletionSuggestion(
  arrangements: ArrangementItem[],
  suggestion: CompletionSuggestion,
  now = Date.now()
): ArrangementItem[] {
  return arrangements.map((arrangement) => {
    if (arrangement.id !== suggestion.arrangementId) return arrangement;
    return {
      ...arrangement,
      status: "completed" as ArrangementStatus,
      sourceRefs: mergeSourceRefs(arrangement.sourceRefs, suggestion.sourceRefs),
      updatedAt: now,
    };
  });
}

function createSeedArrangements(now: number): ArrangementItem[] {
  return [
    createArrangementItem(
      {
        title: "整理安排模块 V1 验收点",
        description: "把手动创建、以后再说、完成和演示识别都过一遍。",
        timeKind: "due",
        dueAt: startOfLocalDay(now) + 17 * 60 * 60 * 1000,
        location: "即我 Demo",
        people: ["自己"],
        reminderNote: "完成前做一次刷新验证",
      },
      now - 1000 * 60 * 12
    ),
    createArrangementItem(
      {
        title: "想想下周要跟进的事",
        description: "先放在这里，不急着排具体时间。",
        timeKind: "none",
        people: ["自己"],
      },
      now - 1000 * 60 * 30
    ),
  ];
}

function normalizeArrangementItem(value: unknown): ArrangementItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<ArrangementItem>;
  if (!item.id || !item.title || !isArrangementStatus(item.status)) return null;

  return {
    id: String(item.id),
    title: normalizeText(item.title),
    description: normalizeText(item.description),
    status: item.status,
    timeKind: isArrangementTimeKind(item.timeKind) ? item.timeKind : "none",
    dueAt: normalizeTimestamp(item.dueAt),
    startAt: normalizeTimestamp(item.startAt),
    endAt: normalizeTimestamp(item.endAt),
    location: normalizeText(item.location),
    people: normalizePeople(item.people),
    reminderNote: normalizeText(item.reminderNote),
    reminderRules: normalizeReminderRules(item.reminderRules),
    sourceRefs: Array.isArray(item.sourceRefs)
      ? item.sourceRefs
          .map(normalizeSourceRef)
          .filter((source): source is ArrangementSourceRef => source !== null)
      : [],
    executionLevel: isExecutionLevel(item.executionLevel)
      ? item.executionLevel
      : "user-only",
    mergedIntoId:
      typeof item.mergedIntoId === "string" ? item.mergedIntoId : null,
    mergedAt: normalizeTimestamp(item.mergedAt),
    createdAt: normalizeTimestamp(item.createdAt) ?? Date.now(),
    updatedAt: normalizeTimestamp(item.updatedAt) ?? Date.now(),
  };
}

function normalizeSourceRef(value: unknown): ArrangementSourceRef | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ArrangementSourceRef>;
  if (!source.id || !source.title || !isSourceType(source.type)) return null;

  return {
    id: String(source.id),
    type: source.type,
    title: normalizeText(source.title),
    excerpt: normalizeText(source.excerpt),
    createdAt: normalizeTimestamp(source.createdAt) ?? Date.now(),
  };
}

function normalizeReminderRules(value: unknown): ReminderRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeReminderRule)
    .filter((rule): rule is ReminderRule => rule !== null);
}

function normalizeReminderRule(value: unknown): ReminderRule | null {
  if (!value || typeof value !== "object") return null;
  const rule = value as Partial<ReminderRule>;
  if (!rule.id || !isReminderRuleType(rule.type)) return null;

  return {
    id: String(rule.id),
    type: rule.type,
    enabled: rule.enabled !== false,
    offsetMinutes:
      typeof rule.offsetMinutes === "number" && Number.isFinite(rule.offsetMinutes)
        ? rule.offsetMinutes
        : null,
    timeOfDayMinutes:
      typeof rule.timeOfDayMinutes === "number" &&
      Number.isFinite(rule.timeOfDayMinutes)
        ? rule.timeOfDayMinutes
        : null,
    recurrence: isReminderRecurrence(rule.recurrence) ? rule.recurrence : null,
    createdAt: normalizeTimestamp(rule.createdAt) ?? Date.now(),
    updatedAt: normalizeTimestamp(rule.updatedAt) ?? Date.now(),
  };
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSearchKeywords(query: string) {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((keyword) => keyword.length > 0);
}

function buildArrangementSearchText(arrangement: ArrangementItem) {
  return [
    arrangement.title,
    arrangement.description,
    arrangement.location,
    arrangement.people.join(" "),
    arrangement.reminderNote,
    arrangement.status,
    arrangement.status === "active" ? "进行中" : "",
    arrangement.status === "later" ? "以后再说" : "",
    arrangement.status === "completed" ? "已完成" : "",
    arrangement.sourceRefs.map((source) => `${source.title} ${source.excerpt}`).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function normalizePeople(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((person) => normalizeText(person))
      .filter((person) => person.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(/[,，、\n]/)
      .map((person) => person.trim())
      .filter((person) => person.length > 0);
  }

  return [];
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function inferTimeKind(input: ArrangementInput): ArrangementTimeKind {
  if (input.startAt && input.endAt) return "range";
  if (input.dueAt) return "due";
  return "none";
}

function createArrangementId(now: number) {
  return `arrangement-${now.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function compareArrangements(first: ArrangementItem, second: ArrangementItem) {
  const firstTime = getArrangementPrimaryTime(first) ?? Number.MAX_SAFE_INTEGER;
  const secondTime = getArrangementPrimaryTime(second) ?? Number.MAX_SAFE_INTEGER;
  if (firstTime !== secondTime) return firstTime - secondTime;
  return second.updatedAt - first.updatedAt;
}

function getArrangementPrimaryTime(arrangement: ArrangementItem) {
  if (arrangement.timeKind === "range") return arrangement.startAt;
  if (arrangement.timeKind === "due") return arrangement.dueAt;
  return null;
}

function compareFocusArrangements(
  first: ArrangementItem,
  second: ArrangementItem,
  now: number
) {
  const firstOverdue = isArrangementOverdue(first, now);
  const secondOverdue = isArrangementOverdue(second, now);
  if (firstOverdue !== secondOverdue) return firstOverdue ? 1 : -1;
  return compareArrangements(first, second);
}

function isStaleOverdueArrangement(arrangement: ArrangementItem, now: number) {
  const primaryTime = getArrangementPrimaryTime(arrangement);
  return (
    arrangement.status === "active" &&
    primaryTime !== null &&
    primaryTime <= now - staleOverdueMs
  );
}

function getArrangementCalendarDateKeys(
  arrangement: ArrangementItem,
  viewStart: number,
  viewEnd: number
) {
  if (arrangement.timeKind === "due" && arrangement.dueAt !== null) {
    if (arrangement.dueAt < viewStart || arrangement.dueAt > viewEnd) return [];
    return [formatDateKey(arrangement.dueAt)];
  }

  if (
    arrangement.timeKind === "range" &&
    arrangement.startAt !== null &&
    arrangement.endAt !== null
  ) {
    const firstDay = startOfLocalDay(Math.max(arrangement.startAt, viewStart));
    const lastDay = startOfLocalDay(Math.min(arrangement.endAt, viewEnd));
    const keys: string[] = [];
    for (let cursor = firstDay; cursor <= lastDay; cursor += oneDayMs) {
      keys.push(formatDateKey(cursor));
    }
    return keys;
  }

  return [];
}

function createReminderOccurrence(
  arrangement: ArrangementItem,
  rule: ReminderRule,
  now: number
): ReminderOccurrence | null {
  const primaryTime = getArrangementPrimaryTime(arrangement);
  if (rule.type === "before") {
    if (primaryTime === null || typeof rule.offsetMinutes !== "number") return null;
    const triggerAt = primaryTime - rule.offsetMinutes * 60 * 1000;
    if (!isReminderDue(triggerAt, now)) return null;
    return buildReminderOccurrence(arrangement, rule, triggerAt);
  }

  if (rule.type === "same-day") {
    if (primaryTime === null || typeof rule.timeOfDayMinutes !== "number") {
      return null;
    }
    const triggerAt = timeOnLocalDay(primaryTime, rule.timeOfDayMinutes);
    if (!isReminderDue(triggerAt, now)) return null;
    return buildReminderOccurrence(arrangement, rule, triggerAt);
  }

  if (rule.type === "recurring") {
    if (typeof rule.timeOfDayMinutes !== "number") return null;
    if (
      rule.recurrence === "weekly" &&
      primaryTime !== null &&
      new Date(primaryTime).getDay() !== new Date(now).getDay()
    ) {
      return null;
    }
    const triggerAt = timeOnLocalDay(now, rule.timeOfDayMinutes);
    if (!isReminderDue(triggerAt, now)) return null;
    return buildReminderOccurrence(arrangement, rule, triggerAt);
  }

  return null;
}

function buildReminderOccurrence(
  arrangement: ArrangementItem,
  rule: ReminderRule,
  triggerAt: number
): ReminderOccurrence {
  return {
    id: `${arrangement.id}-${rule.id}-${formatDateKey(triggerAt)}`,
    arrangement,
    rule,
    triggerAt,
    title: arrangement.title,
  };
}

function isReminderDue(triggerAt: number, now: number) {
  return triggerAt <= now && startOfLocalDay(triggerAt) === startOfLocalDay(now);
}

function shouldSuggestMerge(first: ArrangementItem, second: ArrangementItem) {
  const sharedKeywords = getSharedKeywords(first, second);
  if (isHospitalLikePair(first, second)) return true;
  if (
    sharedKeywords.length >= 2 &&
    areTimesClose(first, second, oneDayMs * 3) &&
    hasStrongSharedContext(first, second)
  ) {
    return true;
  }
  return false;
}

function buildMergeReason(primary: ArrangementItem, candidates: ArrangementItem[]) {
  const titles = candidates.map((candidate) => `“${candidate.title}”`).join("、");
  return `这些安排与“${primary.title}”在主题、地点或来源上下文上相近，可合并为一个安排，减少重复提醒：${titles}`;
}

function isHospitalLikePair(first: ArrangementItem, second: ArrangementItem) {
  const firstText = buildArrangementSearchText(first);
  const secondText = buildArrangementSearchText(second);
  const hospitalWords = ["医院", "体检", "复查", "挂号", "检查"];
  const sharedMedicalWords = hospitalWords.filter(
    (word) => firstText.includes(word) && secondText.includes(word)
  );

  return (
    sharedMedicalWords.length > 0 &&
    (areTimesClose(first, second, oneDayMs * 7) || hasSameLocation(first, second)) &&
    (sharedMedicalWords.length >= 2 ||
      hasSameLocation(first, second) ||
      sharedMedicalWords.includes("医院"))
  );
}

function hasStrongSharedContext(first: ArrangementItem, second: ArrangementItem) {
  return (
    hasSameLocation(first, second) ||
    hasSharedPeople(first, second) ||
    areTimesClose(first, second, oneDayMs * 3)
  );
}

function hasSameLocation(first: ArrangementItem, second: ArrangementItem) {
  return (
    first.location.length > 0 &&
    second.location.length > 0 &&
    first.location === second.location
  );
}

function hasSharedPeople(first: ArrangementItem, second: ArrangementItem) {
  const secondPeople = new Set(second.people);
  return first.people.some((person) => secondPeople.has(person));
}

function getSharedKeywords(first: ArrangementItem, second: ArrangementItem) {
  const firstKeywords = new Set(extractTopicKeywords(buildArrangementSearchText(first)));
  const secondKeywords = new Set(extractTopicKeywords(buildArrangementSearchText(second)));
  return Array.from(firstKeywords).filter((keyword) => secondKeywords.has(keyword));
}

function extractTopicKeywords(text: string) {
  const explicitWords = [
    "医院",
    "体检",
    "复查",
    "早餐",
    "会议",
    "客户",
    "面试",
    "报告",
  ];
  const words = explicitWords.filter((word) => text.includes(word));
  const latinWords = text.match(/[a-z0-9]{2,}/g) ?? [];
  return Array.from(new Set([...words, ...latinWords]));
}

function areTimesClose(
  first: ArrangementItem,
  second: ArrangementItem,
  thresholdMs: number
) {
  const firstTime = getArrangementPrimaryTime(first);
  const secondTime = getArrangementPrimaryTime(second);
  if (firstTime === null || secondTime === null) return false;
  return Math.abs(firstTime - secondTime) <= thresholdMs;
}

function mergeSourceRefs(
  existingSources: ArrangementSourceRef[],
  nextSources: ArrangementSourceRef[]
) {
  const sourceMap = new Map<string, ArrangementSourceRef>();
  [...existingSources, ...nextSources].forEach((source) => {
    sourceMap.set(`${source.type}-${source.id}`, source);
  });
  return Array.from(sourceMap.values()).sort(
    (first, second) => first.createdAt - second.createdAt
  );
}

function hasCompletionIntent(text: string) {
  const normalized = text.toLowerCase();
  return [
    "完成了",
    "做完了",
    "办完了",
    "已经",
    "去了",
    "体检了",
    "复查了",
    "处理好了",
  ].some((phrase) => normalized.includes(phrase));
}

function scoreCompletionMatch(
  arrangement: ArrangementItem,
  message: CompletionRecognitionMessage
) {
  const arrangementText = buildArrangementSearchText(arrangement);
  const messageText = message.text.toLowerCase();
  const sharedKeywordScore = extractTopicKeywords(arrangementText).filter((keyword) =>
    messageText.includes(keyword)
  ).length;
  const locationScore =
    arrangement.location && messageText.includes(arrangement.location) ? 1 : 0;
  const timeScore = isMessageNearArrangementTime(arrangement, message.createdAt)
    ? 1
    : 0;
  return sharedKeywordScore + locationScore + timeScore;
}

function isMessageNearArrangementTime(
  arrangement: ArrangementItem,
  messageTime: number
) {
  const primaryTime = getArrangementPrimaryTime(arrangement);
  if (primaryTime === null) return true;
  return Math.abs(messageTime - primaryTime) <= oneDayMs * 7;
}

function timeOnLocalDay(timestamp: number, minutesOfDay: number) {
  const date = new Date(timestamp);
  date.setHours(Math.floor(minutesOfDay / 60), minutesOfDay % 60, 0, 0);
  return date.getTime();
}

function formatDateKey(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatShortDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function formatShortTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function isArrangementStatus(value: unknown): value is ArrangementStatus {
  return (
    value === "active" ||
    value === "completed" ||
    value === "later" ||
    value === "merged"
  );
}

function isArrangementTimeKind(value: unknown): value is ArrangementTimeKind {
  return value === "none" || value === "due" || value === "range";
}

function isSourceType(value: unknown): value is ArrangementSourceType {
  return (
    value === "manual" ||
    value === "self" ||
    value === "private" ||
    value === "group" ||
    value === "demo-ai"
  );
}

function isExecutionLevel(value: unknown): value is ArrangementExecutionLevel {
  return (
    value === "user-only" ||
    value === "ai-assisted" ||
    value === "ai-executable"
  );
}

function isReminderRuleType(value: unknown): value is ReminderRuleType {
  return value === "before" || value === "same-day" || value === "recurring";
}

function isReminderRecurrence(value: unknown): value is ReminderRecurrence {
  return value === "daily" || value === "weekly";
}
