import {
  createArrangementItem,
  createDemoRecognitionArrangement,
  applyAutomaticArrangementRules,
  groupArrangementItems,
  searchArrangementItems,
} from "@/data/arrangements";
import type { ArrangementItem } from "@/data/arrangements";
import {
  buildRecognitionSourceFromRecord,
  createArrangementPendingConfirmation,
  createAutoRecognizedArrangement,
  createArrangementDraft,
  createArrangementRecognitionRequestContext,
  createArrangementInputFromDraft,
  normalizeRecognitionResultPayload,
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
