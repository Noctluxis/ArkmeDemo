export type ArrangementStatus = "active" | "completed" | "later";

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
  sourceRefs: ArrangementSourceRef[];
  executionLevel: ArrangementExecutionLevel;
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
  sourceRefs?: ArrangementSourceRef[];
  executionLevel?: ArrangementExecutionLevel;
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
    sourceRefs: input.sourceRefs ?? [],
    executionLevel: input.executionLevel ?? "user-only",
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
    if (arrangement.status === "completed") {
      groups.completed.push(arrangement);
      return;
    }
    if (arrangement.status === "later") {
      groups.later.push(arrangement);
      return;
    }
    if (arrangement.timeKind === "none" || arrangement.dueAt === null) {
      groups.noTime.push(arrangement);
      return;
    }
    if (arrangement.dueAt <= now + oneDayMs) {
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
  return (
    arrangement.status === "active" &&
    arrangement.dueAt !== null &&
    arrangement.dueAt < now
  );
}

export function searchArrangementItems(
  arrangements: ArrangementItem[],
  query: string
) {
  const keywords = normalizeSearchKeywords(query);
  if (keywords.length === 0) return [];

  return arrangements.filter((arrangement) => {
    const searchableText = buildArrangementSearchText(arrangement);
    return keywords.every((keyword) => searchableText.includes(keyword));
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
    sourceRefs: Array.isArray(item.sourceRefs)
      ? item.sourceRefs
          .map(normalizeSourceRef)
          .filter((source): source is ArrangementSourceRef => source !== null)
      : [],
    executionLevel: isExecutionLevel(item.executionLevel)
      ? item.executionLevel
      : "user-only",
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
  const firstTime = first.dueAt ?? first.startAt ?? Number.MAX_SAFE_INTEGER;
  const secondTime = second.dueAt ?? second.startAt ?? Number.MAX_SAFE_INTEGER;
  if (firstTime !== secondTime) return firstTime - secondTime;
  return second.updatedAt - first.updatedAt;
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
  return (
    arrangement.status === "active" &&
    arrangement.dueAt !== null &&
    arrangement.dueAt <= now - staleOverdueMs
  );
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
  return value === "active" || value === "completed" || value === "later";
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
