import {
  createArrangementItem,
  createDemoRecognitionArrangement,
  applyAutomaticArrangementRules,
  acceptCompletionSuggestion,
  acceptMergeSuggestion,
  buildCalendarBuckets,
  findCompletionSuggestion,
  findMergeSuggestions,
  getReminderOccurrences,
  groupArrangementItems,
  searchArrangementItems,
} from "@/data/arrangements";
import type { ArrangementItem } from "@/data/arrangements";
import {
  buildRecognitionSourceFromRecord,
  createCompletionSuggestionFromRecognitionResult,
  createArrangementPendingConfirmation,
  createAutoRecognizedArrangement,
  createArrangementDraft,
  createArrangementRecognitionRequestContext,
  createArrangementInputFromDraft,
  normalizeCompletionRecognitionResultPayload,
  normalizeRecognitionResultPayload,
  shouldPromptCompletionSuggestion,
  shouldPromptArrangementRecognitionDraft,
} from "@/data/arrangementRecognition";
import type { RecordItem } from "@/types/record";

const contractNow = new Date("2026-05-19T04:00:00.000Z").getTime();

const manualArrangement: ArrangementItem = createArrangementItem(
  {
    title: "准备候选人面试复盘",
    description: "整理今天的实现过程和待确认点",
    timeKind: "due",
    dueAt: contractNow + 1000 * 60 * 60,
    location: "线上",
    people: ["章诚瑞"],
    reminderNote: "提前看一遍计划",
  },
  contractNow
);

const demoArrangement = createDemoRecognitionArrangement(contractNow);
const groupedArrangementContract = groupArrangementItems(
  [manualArrangement, demoArrangement],
  contractNow
);

if (
  groupedArrangementContract.focus.length < 1 ||
  groupedArrangementContract.upcoming.length < 1 ||
  demoArrangement.sourceRefs[0]?.type !== "demo-ai"
) {
  throw new Error("Arrangement data contract failed");
}

const focusOrderingNow = new Date("2026-05-20T10:00:00.000Z").getTime();
const activeSoonArrangement = createArrangementItem(
  {
    title: "active soon",
    timeKind: "due",
    dueAt: focusOrderingNow + 1000 * 60 * 30,
  },
  focusOrderingNow
);
const recentlyOverdueArrangement = createArrangementItem(
  {
    title: "recently overdue",
    timeKind: "due",
    dueAt: focusOrderingNow - 1000 * 60 * 60,
  },
  focusOrderingNow
);
const staleOverdueArrangement = createArrangementItem(
  {
    title: "stale overdue",
    timeKind: "due",
    dueAt: focusOrderingNow - 1000 * 60 * 60 * 24 * 4,
  },
  focusOrderingNow
);
const focusOrderingGroups = groupArrangementItems(
  [
    recentlyOverdueArrangement,
    applyAutomaticArrangementRules([staleOverdueArrangement], focusOrderingNow)[0],
    activeSoonArrangement,
  ],
  focusOrderingNow
);

if (
  focusOrderingGroups.focus[0]?.id !== activeSoonArrangement.id ||
  focusOrderingGroups.focus[1]?.id !== recentlyOverdueArrangement.id ||
  focusOrderingGroups.later[0]?.id !== staleOverdueArrangement.id
) {
  throw new Error("Arrangement focus ordering and stale overdue contract failed");
}

const automaticallyDeferredArrangement = applyAutomaticArrangementRules(
  [staleOverdueArrangement],
  focusOrderingNow
)[0];

if (automaticallyDeferredArrangement?.status !== "later") {
  throw new Error("Arrangement stale overdue auto later contract failed");
}

const searchedArrangements = searchArrangementItems(
  [
    manualArrangement,
    createArrangementItem(
      {
        title: "联系客户确认时间",
        description: "周五前把会议室定下来",
        timeKind: "none",
        location: "虹桥",
        people: ["王小明"],
        sourceRefs: [
          {
            id: "search-source-1",
            type: "private",
            title: "用户A",
            excerpt: "王小明说周五在虹桥见",
            createdAt: contractNow,
          },
        ],
      },
      contractNow + 2
    ),
  ],
  "虹桥 王小明"
);

if (
  searchedArrangements.length !== 1 ||
  searchedArrangements[0]?.location !== "虹桥"
) {
  throw new Error("Arrangement search contract failed");
}

const recognitionRecord: RecordItem = {
  uid: "self-contract-1",
  text_content: "后天上午去医院复查鼻子",
  send_at: contractNow,
  create_at: contractNow,
  update_at: contractNow,
  sourceConversation: {
    type: "self",
    label: "发给自己",
    actionLabel: "打开",
    iconLabel: "自",
    recordUid: "self-contract-1",
  },
};

const recognitionSource = buildRecognitionSourceFromRecord(recognitionRecord, "self");
const recognitionDraft = createArrangementDraft(
  [recognitionSource],
  {
    title: "去医院复查鼻子",
    description: "后天上午去医院复查鼻子。",
    timeKind: "due",
    dueAt: contractNow + 1000 * 60 * 60 * 48,
    startAt: null,
    endAt: null,
    location: "医院",
    people: ["自己"],
    confidence: "high",
    reason: "消息中包含明确时间、地点和行动。",
  },
  contractNow
);
const recognitionArrangementInput = createArrangementInputFromDraft(
  recognitionDraft
);

if (
  recognitionSource.type !== "self" ||
  recognitionDraft.status !== "ready-to-confirm" ||
  recognitionArrangementInput.sourceRefs?.[0]?.type !== "self" ||
  recognitionArrangementInput.title !== "去医院复查鼻子"
) {
  throw new Error("Arrangement recognition contract failed");
}

const wrappedRecognitionResult = normalizeRecognitionResultPayload({
  currentTime: "2026-05-19T14:16:06.885Z",
  outputSchema: {
    title: "去医院复查鼻子",
    description: "后天上午去医院复查鼻子",
    timeKind: "range",
    dueAt: null,
    startAt: "2026-05-21T08:00:00.000Z",
    endAt: "2026-05-21T12:00:00.000Z",
    location: "医院",
    people: [],
    confidence: "high",
    reason: "明确提到后天上午去医院复查鼻子。",
  },
  sources: [],
});

if (
  !wrappedRecognitionResult ||
  wrappedRecognitionResult.title !== "去医院复查鼻子" ||
  wrappedRecognitionResult.timeKind !== "range"
) {
  throw new Error("Wrapped recognition result contract failed");
}

const autoRecognizedArrangement = createAutoRecognizedArrangement(
  [],
  recognitionDraft,
  contractNow + 1000
);
const duplicateAutoRecognizedArrangement = autoRecognizedArrangement
  ? createAutoRecognizedArrangement(
      [autoRecognizedArrangement],
      recognitionDraft,
      contractNow + 2000
    )
  : null;

if (
  !autoRecognizedArrangement ||
  autoRecognizedArrangement.sourceRefs[0]?.id !== "self-contract-1" ||
  duplicateAutoRecognizedArrangement !== null
) {
  throw new Error("Arrangement auto recognition contract failed");
}

const pendingConfirmation = createArrangementPendingConfirmation(
  recognitionDraft,
  contractNow + 3000
);

if (
  pendingConfirmation.draft.id !== recognitionDraft.id ||
  pendingConfirmation.createdAt !== contractNow + 3000 ||
  pendingConfirmation.sourceLabel !== "发给自己"
) {
  throw new Error("Arrangement pending confirmation contract failed");
}

const mediumConfidenceDraft = createArrangementDraft(
  [recognitionSource],
  {
    ...recognitionDraft.result,
    confidence: "medium",
  },
  contractNow + 4000
);

if (
  !shouldPromptArrangementRecognitionDraft(recognitionDraft) ||
  shouldPromptArrangementRecognitionDraft(mediumConfidenceDraft)
) {
  throw new Error("Arrangement confidence prompt contract failed");
}

const recognitionRequestContext = createArrangementRecognitionRequestContext(
  new Date("2026-05-22T07:00:00.000Z").getTime(),
  -480
);

if (
  recognitionRequestContext.currentTime !== "2026-05-22T15:00:00+08:00" ||
  recognitionRequestContext.timeZone !== "UTC+08:00" ||
  recognitionRequestContext.timezoneOffsetMinutes !== -480
) {
  throw new Error("Arrangement recognition timezone contract failed");
}

const calendarStart = new Date("2026-05-01T00:00:00+08:00").getTime();
const calendarEnd = new Date("2026-05-31T23:59:59+08:00").getTime();
const calendarDue = createArrangementItem(
  {
    title: "calendar due",
    timeKind: "due",
    dueAt: new Date("2026-05-10T15:00:00+08:00").getTime(),
  },
  contractNow + 5000
);
const calendarRange = createArrangementItem(
  {
    title: "calendar range",
    timeKind: "range",
    startAt: new Date("2026-05-12T20:00:00+08:00").getTime(),
    endAt: new Date("2026-05-13T10:00:00+08:00").getTime(),
  },
  contractNow + 6000
);
const calendarNone = createArrangementItem(
  {
    title: "calendar none",
    timeKind: "none",
  },
  contractNow + 7000
);
const calendarBuckets = buildCalendarBuckets(
  [calendarDue, calendarRange, calendarNone],
  calendarStart,
  calendarEnd
);

if (
  calendarBuckets.find((bucket) => bucket.dateKey === "2026-05-10")
    ?.arrangements[0]?.id !== calendarDue.id ||
  !calendarBuckets
    .find((bucket) => bucket.dateKey === "2026-05-13")
    ?.arrangements.some((arrangement) => arrangement.id === calendarRange.id) ||
  calendarBuckets.some((bucket) =>
    bucket.arrangements.some((arrangement) => arrangement.id === calendarNone.id)
  )
) {
  throw new Error("Arrangement calendar bucket contract failed");
}

const reminderArrangement = createArrangementItem(
  {
    title: "reminder due",
    timeKind: "due",
    dueAt: new Date("2026-05-20T10:30:00+08:00").getTime(),
    reminderRules: [
      {
        id: "before-30",
        type: "before",
        enabled: true,
        offsetMinutes: 30,
        createdAt: contractNow,
        updatedAt: contractNow,
      },
      {
        id: "same-day-9",
        type: "same-day",
        enabled: true,
        timeOfDayMinutes: 9 * 60,
        createdAt: contractNow,
        updatedAt: contractNow,
      },
      {
        id: "daily-9",
        type: "recurring",
        enabled: true,
        recurrence: "daily",
        timeOfDayMinutes: 9 * 60,
        createdAt: contractNow,
        updatedAt: contractNow,
      },
    ],
  },
  contractNow + 8000
);
const reminderOccurrences = getReminderOccurrences(
  [reminderArrangement],
  new Date("2026-05-20T10:05:00+08:00").getTime()
);

if (
  !reminderOccurrences.some((occurrence) => occurrence.rule.type === "before") ||
  !reminderOccurrences.some((occurrence) => occurrence.rule.type === "same-day") ||
  !reminderOccurrences.some((occurrence) => occurrence.rule.type === "recurring")
) {
  throw new Error("Arrangement reminder occurrence contract failed");
}

const yesterdayReminderOccurrences = getReminderOccurrences(
  [
    createArrangementItem(
      {
        title: "yesterday reminder",
        timeKind: "due",
        dueAt: new Date("2026-05-19T10:30:00+08:00").getTime(),
        reminderRules: [
          {
            id: "yesterday-same-day",
            type: "same-day",
            enabled: true,
            timeOfDayMinutes: 9 * 60,
            createdAt: contractNow,
            updatedAt: contractNow,
          },
        ],
      },
      contractNow + 8500
    ),
  ],
  new Date("2026-05-20T10:05:00+08:00").getTime()
);

if (yesterdayReminderOccurrences.length > 0) {
  throw new Error("Arrangement same-day reminder should only show today");
}

const hospitalPrimary = createArrangementItem(
  {
    title: "去医院体检",
    description: "周五上午去医院体检",
    timeKind: "due",
    dueAt: new Date("2026-05-22T09:00:00+08:00").getTime(),
    location: "医院",
    sourceRefs: [
      {
        id: "hospital-source-1",
        type: "self",
        title: "发给自己",
        excerpt: "周五上午去医院体检",
        createdAt: contractNow,
      },
    ],
  },
  contractNow + 9000
);
const hospitalCandidate = createArrangementItem(
  {
    title: "医院复查",
    description: "别忘了体检后复查",
    timeKind: "due",
    dueAt: new Date("2026-05-22T11:00:00+08:00").getTime(),
    location: "医院",
    sourceRefs: [
      {
        id: "hospital-source-2",
        type: "private",
        title: "用户A",
        excerpt: "体检之后还要去医院复查",
        createdAt: contractNow,
      },
    ],
  },
  contractNow + 10000
);
const mergeSuggestions = findMergeSuggestions([
  hospitalCandidate,
  hospitalPrimary,
]);
const hospitalMergeSuggestion = mergeSuggestions[0];
const mergedArrangements = hospitalMergeSuggestion
  ? acceptMergeSuggestion(
      [hospitalPrimary, hospitalCandidate],
      hospitalMergeSuggestion,
      contractNow + 11000
    )
  : [];
const mergedPrimary = mergedArrangements.find(
  (arrangement) => arrangement.id === hospitalMergeSuggestion?.primaryArrangementId
);
const mergedCandidate = mergedArrangements.find(
  (arrangement) => arrangement.id === hospitalCandidate.id
);

if (
  !hospitalMergeSuggestion ||
  mergedCandidate?.status !== "merged" ||
  mergedCandidate.mergedIntoId !== hospitalMergeSuggestion.primaryArrangementId ||
  (mergedPrimary?.sourceRefs.length ?? 0) < 2
) {
  throw new Error("Arrangement merge suggestion contract failed");
}

const unrelatedMergeSuggestions = findMergeSuggestions([
  hospitalPrimary,
  createArrangementItem(
    {
      title: "客户会议资料确认",
      description: "整理会议材料并确认客户时间",
      timeKind: "due",
      dueAt: new Date("2026-05-22T10:00:00+08:00").getTime(),
      location: "办公室",
      people: ["客户"],
    },
    contractNow + 12000
  ),
]);

if (unrelatedMergeSuggestions.length > 0) {
  throw new Error("Arrangement conservative merge contract failed");
}

const completionSuggestion = findCompletionSuggestion(
  [hospitalPrimary],
  {
    id: "completion-message-1",
    type: "self",
    title: "发给自己",
    text: "我今天上午去医院体检了",
    createdAt: new Date("2026-05-22T12:00:00+08:00").getTime(),
  },
  new Date("2026-05-22T12:00:00+08:00").getTime()
);
const completedArrangements = completionSuggestion
  ? acceptCompletionSuggestion(
      [hospitalPrimary],
      completionSuggestion,
      new Date("2026-05-22T12:05:00+08:00").getTime()
    )
  : [];

if (
  !completionSuggestion ||
  completedArrangements.find((arrangement) => arrangement.id === hospitalPrimary.id)
    ?.status !== "completed"
) {
  throw new Error("Arrangement completion suggestion contract failed");
}

const llmCompletionMessage = {
  id: "completion-message-llm-1",
  type: "self" as const,
  title: "发给自己",
  text: "我刚刚已经和客户把报价报告确认完了。",
  createdAt: new Date("2026-05-22T12:30:00+08:00").getTime(),
};
const llmCompletionArrangement = createArrangementItem(
  {
    title: "客户报价报告确认",
    description: "和客户确认报价报告最终版本",
    timeKind: "due",
    dueAt: new Date("2026-05-22T18:00:00+08:00").getTime(),
    location: "线上",
    people: ["客户"],
  },
  contractNow + 13000
);
const llmCompletionResult = normalizeCompletionRecognitionResultPayload({
  isCompleted: true,
  arrangementId: llmCompletionArrangement.id,
  confidence: 0.94,
  evidence: "已经和客户把报价报告确认完了",
  reason: "新消息明确表示客户报价报告确认已经完成。",
});
const llmCompletionSuggestion = llmCompletionResult
  ? createCompletionSuggestionFromRecognitionResult(
      llmCompletionResult,
      llmCompletionMessage,
      [llmCompletionArrangement],
      llmCompletionMessage.createdAt
    )
  : null;

if (
  !llmCompletionResult ||
  !shouldPromptCompletionSuggestion(llmCompletionResult, [
    llmCompletionArrangement,
  ]) ||
  llmCompletionSuggestion?.arrangementId !== llmCompletionArrangement.id ||
  llmCompletionSuggestion.confidence !== "high"
) {
  throw new Error("LLM completion suggestion high-confidence contract failed");
}

const lowConfidenceCompletionResult = normalizeCompletionRecognitionResultPayload({
  isCompleted: true,
  arrangementId: llmCompletionArrangement.id,
  confidence: 0.86,
  evidence: "可能确认了",
  reason: "表达不够确定。",
});

if (
  lowConfidenceCompletionResult &&
  shouldPromptCompletionSuggestion(lowConfidenceCompletionResult, [
    llmCompletionArrangement,
  ])
) {
  throw new Error("LLM completion suggestion confidence threshold contract failed");
}
