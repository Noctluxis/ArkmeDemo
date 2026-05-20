import React from "react";
import {
  arrangementsStorageKey,
  acceptMergeSuggestion,
  applyAutomaticArrangementRules,
  buildCalendarBuckets,
  createArrangementItem,
  findMergeSuggestions,
  formatArrangementTime,
  getInitialArrangements,
  getReminderOccurrences,
  groupArrangementItems,
  isArrangementOverdue,
  persistArrangements,
  searchArrangementItems,
  updateArrangementStatus,
  upsertArrangement,
  type ArrangementGroups,
  type ArrangementInput,
  type ArrangementItem,
  type ArrangementStatus,
  type ArrangementTimeKind,
  type CalendarBucket,
  type MergeSuggestion,
  type ReminderOccurrence,
  type ReminderRule,
} from "@/data/arrangements";
import { cn } from "@/lib/utils";

type ArrangementFormState = {
  title: string;
  description: string;
  timeKind: ArrangementTimeKind;
  dueAt: string;
  startAt: string;
  endAt: string;
  location: string;
  people: string;
  reminderNote: string;
};

const emptyFormState: ArrangementFormState = {
  title: "",
  description: "",
  timeKind: "due",
  dueAt: "",
  startAt: "",
  endAt: "",
  location: "",
  people: "",
  reminderNote: "",
};

const groupMeta: Array<{
  key: keyof ArrangementGroups;
  title: string;
}> = [
  {
    key: "focus",
    title: "重点关注",
  },
  {
    key: "upcoming",
    title: "已安排",
  },
  {
    key: "noTime",
    title: "无明确时间",
  },
  {
    key: "later",
    title: "以后再说",
  },
  {
    key: "completed",
    title: "已完成",
  },
];

type CollapsibleGroupKey = Extract<
  keyof ArrangementGroups,
  "focus" | "upcoming" | "noTime" | "later" | "completed"
>;

const collapsibleGroupKeys: CollapsibleGroupKey[] = [
  "focus",
  "upcoming",
  "noTime",
  "later",
  "completed",
];

export default function Arrangements() {
  const [now, setNow] = React.useState(() => Date.now());
  const [arrangements, setArrangements] = React.useState<ArrangementItem[]>(() =>
    getInitialArrangements(now)
  );
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingArrangementId, setEditingArrangementId] = React.useState<string | null>(
    null
  );
  const [detailArrangementId, setDetailArrangementId] = React.useState<string | null>(
    null
  );
  const [formState, setFormState] =
    React.useState<ArrangementFormState>(emptyFormState);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [quickStatusView, setQuickStatusView] = React.useState<
    "active" | "later" | "completed" | null
  >(null);
  const [collapsedGroups, setCollapsedGroups] = React.useState<
    Record<CollapsibleGroupKey, boolean>
  >({
    focus: false,
    upcoming: false,
    noTime: false,
    later: true,
    completed: true,
  });
  const [viewMode, setViewMode] = React.useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = React.useState(() =>
    startOfMonthTimestamp(now)
  );
  const [selectedCalendarDate, setSelectedCalendarDate] = React.useState<
    string | null
  >(null);
  const [dismissedMergeSuggestionIds, setDismissedMergeSuggestionIds] =
    React.useState<string[]>([]);

  React.useEffect(() => {
    persistArrangements(arrangements);
  }, [arrangements]);

  React.useEffect(() => {
    setArrangements((current) => applyAutomaticArrangementRules(current, now));
  }, [now]);

  React.useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000 * 60);
    return () => window.clearInterval(intervalId);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshArrangements = () => {
      setArrangements(getInitialArrangements(Date.now()));
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === arrangementsStorageKey) {
        refreshArrangements();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const groups = React.useMemo(
    () => groupArrangementItems(arrangements, now),
    [arrangements, now]
  );
  const detailArrangement = arrangements.find(
    (arrangement) => arrangement.id === detailArrangementId
  );
  const activeCount = arrangements.filter(
    (arrangement) => arrangement.status === "active"
  ).length;
  const laterCount = groups.later.length;
  const completedCount = groups.completed.length;
  const quickStatusArrangements = React.useMemo(() => {
    if (quickStatusView === "active") {
      return arrangements.filter((arrangement) => arrangement.status === "active");
    }
    if (quickStatusView === "later") return groups.later;
    if (quickStatusView === "completed") return groups.completed;
    return [];
  }, [arrangements, groups.completed, groups.later, quickStatusView]);
  const searchResults = React.useMemo(
    () => searchArrangementItems(arrangements, searchQuery),
    [arrangements, searchQuery]
  );
  const reminderOccurrences = React.useMemo(
    () => getReminderOccurrences(arrangements, now),
    [arrangements, now]
  );
  const mergeSuggestions = React.useMemo(
    () =>
      findMergeSuggestions(arrangements, now).filter(
        (suggestion) => !dismissedMergeSuggestionIds.includes(suggestion.id)
      ),
    [arrangements, dismissedMergeSuggestionIds, now]
  );
  const mergedChildren = React.useMemo(
    () =>
      detailArrangement
        ? arrangements.filter(
            (arrangement) => arrangement.mergedIntoId === detailArrangement.id
          )
        : [],
    [arrangements, detailArrangement]
  );
  const detailMergeSuggestion = detailArrangement
    ? mergeSuggestions.find(
        (suggestion) => suggestion.primaryArrangementId === detailArrangement.id
      )
    : undefined;
  const monthRange = React.useMemo(
    () => getMonthRange(calendarMonth),
    [calendarMonth]
  );
  const calendarBuckets = React.useMemo(
    () =>
      buildCalendarBuckets(
        arrangements,
        monthRange.startAt,
        monthRange.endAt
      ),
    [arrangements, monthRange.endAt, monthRange.startAt]
  );
  const selectedCalendarArrangements = React.useMemo(
    () =>
      selectedCalendarDate
        ? calendarBuckets.find((bucket) => bucket.dateKey === selectedCalendarDate)
            ?.arrangements ?? []
        : [],
    [calendarBuckets, selectedCalendarDate]
  );
  const toggleCollapsedGroup = React.useCallback((key: CollapsibleGroupKey) => {
    setCollapsedGroups((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const applyArrangementStatus = React.useCallback(
    (id: string, status: ArrangementStatus) => {
      setArrangements((current) => updateArrangementStatus(current, id, status));
    },
    []
  );

  const addReminderRule = React.useCallback(
    (id: string, rule: Omit<ReminderRule, "id" | "createdAt" | "updatedAt">) => {
      const timestamp = Date.now();
      setArrangements((current) =>
        current.map((arrangement) =>
          arrangement.id === id
            ? {
                ...arrangement,
                reminderRules: [
                  ...arrangement.reminderRules,
                  {
                    ...rule,
                    id: `reminder-${timestamp.toString(36)}-${Math.random()
                      .toString(36)
                      .slice(2, 7)}`,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  },
                ],
                updatedAt: timestamp,
              }
            : arrangement
        )
      );
    },
    []
  );

  const toggleReminderRule = React.useCallback((arrangementId: string, ruleId: string) => {
    const timestamp = Date.now();
    setArrangements((current) =>
      current.map((arrangement) =>
        arrangement.id === arrangementId
          ? {
              ...arrangement,
              reminderRules: arrangement.reminderRules.map((rule) =>
                rule.id === ruleId
                  ? { ...rule, enabled: !rule.enabled, updatedAt: timestamp }
                  : rule
              ),
              updatedAt: timestamp,
            }
          : arrangement
      )
    );
  }, []);

  const deleteReminderRule = React.useCallback((arrangementId: string, ruleId: string) => {
    const timestamp = Date.now();
    setArrangements((current) =>
      current.map((arrangement) =>
        arrangement.id === arrangementId
          ? {
              ...arrangement,
              reminderRules: arrangement.reminderRules.filter(
                (rule) => rule.id !== ruleId
              ),
              updatedAt: timestamp,
            }
          : arrangement
      )
    );
  }, []);

  const acceptArrangementMerge = React.useCallback((suggestion: MergeSuggestion) => {
    setArrangements((current) => acceptMergeSuggestion(current, suggestion));
    setDismissedMergeSuggestionIds((current) => [...current, suggestion.id]);
  }, []);

  const dismissMergeSuggestion = React.useCallback((id: string) => {
    setDismissedMergeSuggestionIds((current) =>
      current.includes(id) ? current : [...current, id]
    );
  }, []);

  const handleCreateArrangement = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = formState.title.trim();
    if (!title) return;

    const arrangementInput = toArrangementInput(formState);
    if (editingArrangementId) {
      const updatedAt = Date.now();
      setArrangements((current) =>
        current.map((arrangement) =>
          arrangement.id === editingArrangementId
            ? {
                ...arrangement,
                ...arrangementInput,
                title: title || arrangement.title,
                people: normalizeFormPeople(formState.people),
                updatedAt,
              }
            : arrangement
        )
      );
      setDetailArrangementId(editingArrangementId);
      closeEditor();
      return;
    }

    const nextArrangement = createArrangementItem(arrangementInput);
    setArrangements((current) => upsertArrangement(current, nextArrangement));
    setDetailArrangementId(nextArrangement.id);
    closeEditor();
  };

  const openCreateArrangement = () => {
    setEditingArrangementId(null);
    setFormState(emptyFormState);
    setCreateOpen(true);
  };

  const openEditArrangement = (arrangement: ArrangementItem) => {
    setEditingArrangementId(arrangement.id);
    setFormState(toArrangementFormState(arrangement));
    setDetailArrangementId(null);
    setCreateOpen(true);
  };

  const closeEditor = () => {
    setCreateOpen(false);
    setEditingArrangementId(null);
    setFormState(emptyFormState);
  };

  const deleteArrangement = (id: string) => {
    setArrangements((current) =>
      current.filter((arrangement) => arrangement.id !== id)
    );
    setDetailArrangementId(null);
    if (editingArrangementId === id) {
      closeEditor();
    }
  };

  const openSearchResult = (id: string) => {
    setSearchOpen(false);
    setDetailArrangementId(id);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <header className="shrink-0 bg-bg px-4 pb-3 pt-4">
        <div className="relative h-10">
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            <h1 className="text-[30px] font-semibold leading-9 text-text">安排</h1>
          </div>
          <div className="absolute left-1/2 top-1/2 w-[136px] -translate-x-1/2 -translate-y-1/2">
            <ViewModeSwitch value={viewMode} onChange={setViewMode} compact />
          </div>
          <button
            type="button"
            onClick={openCreateArrangement}
            className="absolute right-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-xl leading-none text-on-primary shadow-sm transition active:scale-[0.96]"
            aria-label="新建安排"
          >
            +
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <ArrangementStat
            label="进行中"
            value={activeCount}
            onOpen={() => setQuickStatusView("active")}
          />
          <ArrangementStat
            label="以后再说"
            value={laterCount}
            onOpen={() => setQuickStatusView("later")}
          />
          <ArrangementStat
            label="已完成"
            value={completedCount}
            onOpen={() => setQuickStatusView("completed")}
          />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 [scrollbar-gutter:stable]">
        <div className="space-y-5">
          {viewMode === "list" && (
            <>
              <ReminderBanner
                occurrences={reminderOccurrences}
                onDismiss={(occurrence) =>
                  deleteReminderRule(occurrence.arrangement.id, occurrence.rule.id)
                }
                onOpen={(id) => setDetailArrangementId(id)}
              />
              <ArrangementSearchLauncher onOpen={() => setSearchOpen(true)} />
            </>
          )}
          {viewMode === "list" ? (
            groupMeta.map((group) => {
              const collapsible = collapsibleGroupKeys.includes(
                group.key as CollapsibleGroupKey
              );
              const collapsed = collapsible
                ? collapsedGroups[group.key as CollapsibleGroupKey]
                : false;

              return (
                <ArrangementGroupSection
                  key={group.key}
                  title={group.title}
                  arrangements={groups[group.key]}
                  now={now}
                  collapsible={collapsible}
                  collapsed={collapsed}
                  onToggle={
                    collapsible
                      ? () => toggleCollapsedGroup(group.key as CollapsibleGroupKey)
                      : undefined
                  }
                  onOpenDetail={setDetailArrangementId}
                  onChangeStatus={applyArrangementStatus}
                />
              );
            })
          ) : (
            <ArrangementCalendarView
              monthStart={calendarMonth}
              buckets={calendarBuckets}
              now={now}
              onPrevMonth={() =>
                setCalendarMonth((current) => addMonths(current, -1))
              }
              onNextMonth={() =>
                setCalendarMonth((current) => addMonths(current, 1))
              }
              onSelectDate={setSelectedCalendarDate}
            />
          )}
        </div>
      </main>

      <CreateArrangementSheet
        open={createOpen}
        mode={editingArrangementId ? "edit" : "create"}
        formState={formState}
        onClose={closeEditor}
        onChange={setFormState}
        onSubmit={handleCreateArrangement}
      />

      <ArrangementDetailSheet
        arrangement={detailArrangement}
        now={now}
        onClose={() => setDetailArrangementId(null)}
        onEdit={openEditArrangement}
        onDelete={deleteArrangement}
        onChangeStatus={applyArrangementStatus}
        mergeSuggestion={detailMergeSuggestion}
        mergedChildren={mergedChildren}
        allArrangements={arrangements}
        onAcceptMerge={acceptArrangementMerge}
        onDismissMerge={dismissMergeSuggestion}
        onAddReminder={addReminderRule}
        onToggleReminder={toggleReminderRule}
        onDeleteReminder={deleteReminderRule}
      />

      <ArrangementSearchSheet
        open={searchOpen}
        query={searchQuery}
        results={searchResults}
        now={now}
        onChangeQuery={setSearchQuery}
        onClose={() => setSearchOpen(false)}
        onOpenDetail={openSearchResult}
        onChangeStatus={applyArrangementStatus}
      />

      <CalendarDaySheet
        dateKey={selectedCalendarDate}
        arrangements={selectedCalendarArrangements}
        now={now}
        onClose={() => setSelectedCalendarDate(null)}
        onOpenDetail={(id) => {
          setSelectedCalendarDate(null);
          setDetailArrangementId(id);
        }}
        onChangeStatus={applyArrangementStatus}
      />

      <QuickStatusSheet
        status={quickStatusView}
        arrangements={quickStatusArrangements}
        now={now}
        onClose={() => setQuickStatusView(null)}
        onOpenDetail={(id) => {
          setQuickStatusView(null);
          setDetailArrangementId(id);
        }}
        onChangeStatus={applyArrangementStatus}
      />
    </div>
  );
}

function ReminderBanner({
  occurrences,
  onDismiss,
  onOpen,
}: {
  occurrences: ReminderOccurrence[];
  onDismiss: (occurrence: ReminderOccurrence) => void;
  onOpen: (arrangementId: string) => void;
}) {
  if (occurrences.length === 0) return null;

  return (
    <section className="rounded-[12px] border border-primary/20 bg-primary-soft px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold leading-5 text-primary">
            提醒
          </p>
          <p className="mt-0.5 text-[12px] leading-5 text-text-muted">
            {occurrences.length} 条安排到了应用内提醒时间
          </p>
        </div>
      </div>
      <div className="mt-2 space-y-2">
        {occurrences.map((occurrence) => (
          <div
            key={occurrence.id}
            className="rounded-[10px] border border-border-light bg-bg px-2.5 py-2 shadow-[var(--mine-card-shadow)]"
          >
            <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onOpen(occurrence.arrangement.id)}
              className="min-w-0 flex-1 text-left text-[13px] font-semibold leading-5 text-text"
            >
              {occurrence.title}
            </button>
            <button
              type="button"
              onClick={() => onDismiss(occurrence)}
              className="h-7 rounded-full bg-surface px-2 text-[11px] font-semibold text-text-muted"
            >
              关闭
            </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ViewModeSwitch({
  value,
  onChange,
  compact,
}: {
  value: "list" | "calendar";
  onChange: (value: "list" | "calendar") => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 rounded-[12px] bg-surface p-1 shadow-[var(--mine-card-shadow)]",
        compact && "rounded-[10px]"
      )}
    >
      {([
        ["list", "列表"],
        ["calendar", "日历"],
      ] as const).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={cn(
            "rounded-[9px] font-semibold transition active:scale-[0.98]",
            compact ? "h-8 text-[12px]" : "h-9 text-[13px]",
            value === mode
              ? "bg-bg text-text shadow-[var(--mine-card-shadow)]"
              : "text-text-tertiary"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ArrangementCalendarView({
  monthStart,
  buckets,
  now,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
}: {
  monthStart: number;
  buckets: CalendarBucket[];
  now: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (dateKey: string) => void;
}) {
  const bucketMap = React.useMemo(
    () => new Map(buckets.map((bucket) => [bucket.dateKey, bucket])),
    [buckets]
  );
  const days = React.useMemo(() => buildMonthGrid(monthStart), [monthStart]);
  const weekStart = startOfLocalDay(now);
  const currentWeekKeys = Array.from({ length: 7 }, (_, index) =>
    formatLocalDateKey(weekStart + index * 24 * 60 * 60 * 1000)
  );

  return (
    <section className="space-y-3">
      <div className="rounded-[12px] bg-surface px-3 py-3 shadow-[var(--mine-card-shadow)]">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onPrevMonth}
            className="h-8 w-8 rounded-full bg-bg text-[16px] text-text-muted"
            aria-label="上个月"
          >
            ‹
          </button>
          <p className="text-[14px] font-semibold text-text">
            {formatMonthTitle(monthStart)}
          </p>
          <button
            type="button"
            onClick={onNextMonth}
            className="h-8 w-8 rounded-full bg-bg text-[16px] text-text-muted"
            aria-label="下个月"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-text-tertiary">
          {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {days.map((day) => {
            const bucket = bucketMap.get(day.dateKey);
            const bucketArrangements = bucket?.arrangements ?? [];
            const isCurrentMonth = day.month === new Date(monthStart).getMonth();
            const isToday = day.dateKey === formatLocalDateKey(now);
            const hasAttentionArrangement = bucketArrangements.some(
              (arrangement) =>
                arrangement.status === "later" ||
                isArrangementOverdue(arrangement, now)
            );
            return (
              <button
                key={day.dateKey}
                type="button"
                onClick={() => onSelectDate(day.dateKey)}
                className={cn(
                  "grid h-[64px] grid-rows-[1fr_2fr] overflow-hidden rounded-[8px] border text-center transition active:scale-[0.98]",
                  isCurrentMonth
                    ? "border-border bg-bg"
                    : "border-transparent bg-transparent opacity-45",
                  isToday &&
                    "border-[#09B83E] bg-[#E6F7EE]/60 shadow-[var(--shadow-focus)]"
                )}
              >
                <span
                  className={cn(
                    "flex h-full w-full items-center justify-center text-[12px] font-semibold leading-none text-text-muted",
                    isToday && "text-[#09B83E]"
                  )}
                >
                  {day.day}
                </span>
                <span className="flex h-full w-full items-start justify-center pt-0.5">
                  {bucketArrangements.length > 0 ? (
                    <span
                      className={cn(
                        "flex h-6 min-w-[30px] items-center justify-center rounded-[7px] px-2 text-[12px] font-semibold leading-none",
                        hasAttentionArrangement
                          ? "bg-[rgba(237,190,9,0.2)] text-warning"
                          : "bg-primary-soft text-primary"
                      )}
                      aria-label={`${bucketArrangements.length} 条安排`}
                    >
                      {bucketArrangements.length}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="rounded-[12px] bg-surface px-3 py-3 shadow-[var(--mine-card-shadow)]">
        <p className="mb-2 text-[13px] font-semibold text-text">本周摘要</p>
        <div className="space-y-2">
          {currentWeekKeys.some((key) => bucketMap.has(key)) ? (
            currentWeekKeys.map((key) => {
              const bucket = bucketMap.get(key);
              if (!bucket) return null;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectDate(key)}
                  className="flex w-full items-center justify-between gap-3 rounded-[8px] bg-bg px-3 py-2 text-left"
                >
                  <span className="text-[12px] font-medium text-text">{key}</span>
                  <span className="text-[11px] text-text-tertiary">
                    {bucket.arrangements.length} 条
                  </span>
                </button>
              );
            })
          ) : (
            <p className="text-[12px] leading-5 text-text-tertiary">
              本周没有明确时间的安排。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function CalendarDaySheet({
  dateKey,
  arrangements,
  now,
  onClose,
  onOpenDetail,
  onChangeStatus,
}: {
  dateKey: string | null;
  arrangements: ArrangementItem[];
  now: number;
  onClose: () => void;
  onOpenDetail: (id: string) => void;
  onChangeStatus: (id: string, status: ArrangementStatus) => void;
}) {
  if (!dateKey) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-overlay-light"
        onClick={onClose}
        aria-label="关闭当天安排"
      />
      <section className="relative z-10 max-h-[calc(100%-12px)] w-full overflow-y-auto rounded-t-[18px] bg-bg px-4 pb-5 pt-4 shadow-lift [scrollbar-gutter:stable]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">{dateKey}</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-full border border-border-light bg-surface px-3 text-[12px] font-semibold text-text-muted"
          >
            关闭
          </button>
        </div>
        <div className="space-y-2">
          {arrangements.length > 0 ? (
            arrangements.map((arrangement) => (
              <ArrangementRow
                key={arrangement.id}
                arrangement={arrangement}
                now={now}
                onOpen={() => onOpenDetail(arrangement.id)}
                onChangeStatus={onChangeStatus}
              />
            ))
          ) : (
            <ArrangementSearchEmpty title="这一天没有明确时间的安排" />
          )}
        </div>
      </section>
    </div>
  );
}

function QuickStatusSheet({
  status,
  arrangements,
  now,
  onClose,
  onOpenDetail,
  onChangeStatus,
}: {
  status: "active" | "later" | "completed" | null;
  arrangements: ArrangementItem[];
  now: number;
  onClose: () => void;
  onOpenDetail: (id: string) => void;
  onChangeStatus: (id: string, status: ArrangementStatus) => void;
}) {
  if (!status) return null;
  const title =
    status === "active" ? "进行中" : status === "later" ? "以后再说" : "已完成";

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-overlay-light"
        onClick={onClose}
        aria-label="关闭快速查看"
      />
      <section className="relative z-10 flex max-h-[calc(100%-12px)] w-full flex-col overflow-hidden rounded-t-[18px] bg-bg shadow-lift">
        <div className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-text">
              {title} · {arrangements.length}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-full border border-border-light bg-surface px-3 text-[12px] font-semibold text-text-muted shadow-[var(--mine-card-shadow)]"
          >
            关闭
          </button>
        </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 [scrollbar-gutter:stable]">
        <div className="space-y-2">
          {arrangements.length > 0 ? (
            arrangements.map((arrangement) => (
              <ArrangementRow
                key={arrangement.id}
                arrangement={arrangement}
                now={now}
                onOpen={() => onOpenDetail(arrangement.id)}
                onChangeStatus={onChangeStatus}
              />
            ))
          ) : (
            <ArrangementSearchEmpty title={`暂无${title}安排`} />
          )}
        </div>
        </div>
      </section>
    </div>
  );
}

function ArrangementStat({
  label,
  value,
  onOpen,
}: {
  label: string;
  value: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-[8px] bg-surface px-3 py-2 text-left shadow-[var(--mine-card-shadow)] transition hover:bg-surface-muted active:scale-[0.98]"
    >
      <p className="text-[18px] font-semibold leading-6 text-text">{value}</p>
      <p className="mt-0.5 flex items-center justify-between gap-1 text-[11px] leading-4 text-text-tertiary">
        <span>{label}</span>
        <span aria-hidden="true">›</span>
      </p>
    </button>
  );
}

function ArrangementSearchLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-11 w-full items-center gap-2 rounded-[12px] border border-border bg-surface px-3 text-left shadow-[var(--mine-card-shadow)] transition hover:bg-surface-muted active:scale-[0.99]"
      aria-label="搜索安排"
    >
      <span
        className="relative h-4 w-4 shrink-0 rounded-full border border-text-tertiary"
        aria-hidden="true"
      >
        <span className="absolute -bottom-0.5 -right-1 h-1.5 w-px rotate-[-45deg] rounded-full bg-text-tertiary" />
      </span>
      <span className="text-[13px] text-text-tertiary">搜索安排</span>
    </button>
  );
}

function ArrangementSearchSheet({
  open,
  query,
  results,
  now,
  onChangeQuery,
  onClose,
  onOpenDetail,
  onChangeStatus,
}: {
  open: boolean;
  query: string;
  results: ArrangementItem[];
  now: number;
  onChangeQuery: (query: string) => void;
  onClose: () => void;
  onOpenDetail: (id: string) => void;
  onChangeStatus: (id: string, status: ArrangementStatus) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const trimmedQuery = query.trim();

  React.useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 bg-overlay-light px-2 py-3">
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] bg-bg shadow-lift">
        <div className="shrink-0 border-b border-border bg-bg px-3 pb-3 pt-3">
          <div className="flex items-center gap-2">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[12px] bg-surface px-3">
              <span
                className="relative h-3.5 w-3.5 shrink-0 rounded-full border border-text-tertiary"
                aria-hidden="true"
              >
                <span className="absolute -bottom-0.5 -right-1 h-1.5 w-px rotate-[-45deg] rounded-full bg-text-tertiary" />
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => onChangeQuery(event.target.value)}
                placeholder="搜索标题、地点、相关人或来源"
                className="min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-text-tertiary"
              />
            </label>
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-[12px] border border-border bg-surface px-3 text-[13px] font-semibold text-text-muted transition hover:bg-surface-muted active:scale-[0.98]"
            >
              关闭
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-gutter:stable]">
          {!trimmedQuery ? (
            <ArrangementSearchEmpty title="输入关键词开始搜索" />
          ) : results.length === 0 ? (
            <ArrangementSearchEmpty title="没有找到相关安排" />
          ) : (
            <div className="space-y-2">
              {results.map((arrangement) => (
                <ArrangementRow
                  key={arrangement.id}
                  arrangement={arrangement}
                  now={now}
                  onOpen={() => onOpenDetail(arrangement.id)}
                  onChangeStatus={onChangeStatus}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ArrangementSearchEmpty({ title }: { title: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-[12px] border border-dashed border-border bg-surface px-4 text-center">
      <p className="text-[13px] leading-5 text-text-tertiary">{title}</p>
    </div>
  );
}

function ArrangementGroupSection({
  title,
  arrangements,
  now,
  collapsible,
  collapsed,
  onToggle,
  onOpenDetail,
  onChangeStatus,
}: {
  title: string;
  arrangements: ArrangementItem[];
  now: number;
  collapsible: boolean;
  collapsed: boolean;
  onToggle?: () => void;
  onOpenDetail: (id: string) => void;
  onChangeStatus: (id: string, status: ArrangementStatus) => void;
}) {
  const showList = !collapsed && arrangements.length > 0;
  const headerContent = (
    <>
      <h2 className="text-[14px] font-semibold leading-5 text-text">{title}</h2>
      <div className="flex items-center gap-2">
        <span className="text-[11px] leading-4 text-text-tertiary">
          {arrangements.length}
        </span>
        {collapsible && <DisclosureIcon collapsed={collapsed} />}
      </div>
    </>
  );

  return (
    <section className="border-t border-border pt-3">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          className="mb-2 flex min-h-8 w-full items-center justify-between gap-3 rounded-[8px] px-1 text-left transition hover:bg-surface-muted active:scale-[0.99]"
          aria-expanded={!collapsed}
        >
          {headerContent}
        </button>
      ) : (
        <div className="mb-2 flex min-h-8 items-center justify-between gap-3 px-1">
          {headerContent}
        </div>
      )}
      {showList && (
        <div className="space-y-2">
          {arrangements.map((arrangement) => (
            <ArrangementRow
              key={arrangement.id}
              arrangement={arrangement}
              now={now}
              onOpen={() => onOpenDetail(arrangement.id)}
              onChangeStatus={onChangeStatus}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DisclosureIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-muted text-text-tertiary transition">
      <span
        className={cn(
          "h-1.5 w-1.5 border-b border-r border-current transition-transform",
          collapsed ? "-rotate-45" : "rotate-45"
        )}
        aria-hidden="true"
      />
    </span>
  );
}

function ArrangementRow({
  arrangement,
  now,
  onOpen,
  onChangeStatus,
}: {
  arrangement: ArrangementItem;
  now: number;
  onOpen: () => void;
  onChangeStatus: (id: string, status: ArrangementStatus) => void;
}) {
  const overdue = isArrangementOverdue(arrangement, now);

  return (
    <article className="rounded-[8px] border border-[var(--record-card-border)] bg-[var(--record-card-bg)] px-3 py-3 shadow-[var(--mine-card-shadow)]">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              className={cn(
                "text-[14px] font-semibold leading-5 text-text",
                arrangement.status === "completed" && "text-text-tertiary line-through"
              )}
            >
              {arrangement.title}
            </h3>
            {arrangement.description && (
              <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-text-muted">
                {arrangement.description}
              </p>
            )}
          </div>
          <StatusPill status={arrangement.status} overdue={overdue} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <MetaPill>{formatArrangementTime(arrangement)}</MetaPill>
          {arrangement.location && <MetaPill>{arrangement.location}</MetaPill>}
          {arrangement.people.length > 0 && (
            <MetaPill>{arrangement.people.join("、")}</MetaPill>
          )}
        </div>
      </button>
      <div className="mt-3 flex gap-2">
        {arrangement.status === "completed" ? (
          <SoftActionButton
            label="恢复"
            onClick={() => onChangeStatus(arrangement.id, "active")}
          />
        ) : (
          <SoftActionButton
            label="完成"
            onClick={() => onChangeStatus(arrangement.id, "completed")}
          />
        )}
        {arrangement.status === "later" ? (
          <SoftActionButton
            label="放回"
            onClick={() => onChangeStatus(arrangement.id, "active")}
          />
        ) : (
          arrangement.status !== "completed" && (
            <SoftActionButton
              label="以后再说"
              onClick={() => onChangeStatus(arrangement.id, "later")}
            />
          )
        )}
      </div>
    </article>
  );
}

function StatusPill({
  status,
  overdue,
}: {
  status: ArrangementStatus;
  overdue: boolean;
}) {
  const label =
    status === "completed"
      ? "已完成"
      : status === "later"
        ? "以后再说"
        : status === "merged"
          ? "已合并"
          : overdue
          ? "已逾期"
          : "进行中";

  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-1 text-[11px] leading-3",
        status === "completed"
          ? "bg-fill-3 text-text-tertiary"
          : status === "later"
            ? "bg-surface-muted text-text-muted"
            : status === "merged"
              ? "bg-fill-3 text-text-tertiary"
              : overdue
              ? "bg-[rgba(237,190,9,0.16)] text-text-muted"
              : "bg-primary-soft text-primary"
      )}
    >
      {label}
    </span>
  );
}

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--overview-entry-tag-bg)] px-2 py-1 text-[11px] leading-3 text-text-muted">
      {children}
    </span>
  );
}

function SoftActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-surface-muted px-3 py-1.5 text-[12px] font-medium text-text transition active:scale-[0.98]"
    >
      {label}
    </button>
  );
}

function CreateArrangementSheet({
  open,
  mode,
  formState,
  onClose,
  onChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  formState: ArrangementFormState;
  onClose: () => void;
  onChange: React.Dispatch<React.SetStateAction<ArrangementFormState>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-overlay-light"
        onClick={onClose}
        aria-label="关闭新建安排"
      />
      <form
        onSubmit={onSubmit}
        className="relative z-10 max-h-[calc(100%-12px)] w-full overflow-y-auto rounded-t-[18px] bg-bg px-4 pb-5 pt-4 shadow-lift [scrollbar-gutter:stable]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">
            {mode === "edit" ? "编辑安排" : "新建安排"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-[13px] text-text-muted transition active:scale-[0.98]"
          >
            取消
          </button>
        </div>

        <div className="space-y-3">
          <ArrangementField
            label="标题"
            value={formState.title}
            placeholder="例如：明天带早餐"
            onChange={(title) => onChange((current) => ({ ...current, title }))}
            required
          />
          <ArrangementTextarea
            label="说明"
            value={formState.description}
            placeholder="补充一下发生背景或注意事项"
            onChange={(description) =>
              onChange((current) => ({ ...current, description }))
            }
          />
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-text-muted">时间</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                ["due", "截止"],
                ["range", "时段"],
                ["none", "不确定"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    onChange((current) => ({ ...current, timeKind: value }))
                  }
                  className={cn(
                    "h-9 rounded-[8px] text-[12px] transition active:scale-[0.98]",
                    formState.timeKind === value
                      ? "bg-primary text-on-primary"
                      : "bg-surface text-text-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {formState.timeKind === "due" && (
            <DateTimeField
              label="截止时间"
              value={formState.dueAt}
              onChange={(dueAt) => onChange((current) => ({ ...current, dueAt }))}
            />
          )}
          {formState.timeKind === "range" && (
            <div className="grid grid-cols-2 gap-2">
              <DateTimeField
                label="开始"
                value={formState.startAt}
                onChange={(startAt) =>
                  onChange((current) => ({ ...current, startAt }))
                }
              />
              <DateTimeField
                label="结束"
                value={formState.endAt}
                onChange={(endAt) => onChange((current) => ({ ...current, endAt }))}
              />
            </div>
          )}
          <ArrangementField
            label="地点"
            value={formState.location}
            placeholder="公司、医院、线上..."
            onChange={(location) => onChange((current) => ({ ...current, location }))}
          />
          <ArrangementField
            label="相关人"
            value={formState.people}
            placeholder="用顿号或逗号分隔"
            onChange={(people) => onChange((current) => ({ ...current, people }))}
          />
          <ArrangementField
            label="提醒备注"
            value={formState.reminderNote}
            placeholder="例如：出门前看一眼"
            onChange={(reminderNote) =>
              onChange((current) => ({ ...current, reminderNote }))
            }
          />
        </div>

        <button
          type="submit"
          disabled={!formState.title.trim()}
          className="mt-5 h-11 w-full rounded-full bg-primary text-[14px] font-semibold text-on-primary transition active:scale-[0.98] disabled:opacity-50"
        >
          {mode === "edit" ? "保存修改" : "保存安排"}
        </button>
      </form>
    </div>
  );
}

function ArrangementDetailSheet({
  arrangement,
  now,
  onClose,
  onEdit,
  onDelete,
  onChangeStatus,
  mergeSuggestion,
  mergedChildren,
  allArrangements,
  onAcceptMerge,
  onDismissMerge,
  onAddReminder,
  onToggleReminder,
  onDeleteReminder,
}: {
  arrangement: ArrangementItem | undefined;
  now: number;
  onClose: () => void;
  onEdit: (arrangement: ArrangementItem) => void;
  onDelete: (id: string) => void;
  onChangeStatus: (id: string, status: ArrangementStatus) => void;
  mergeSuggestion?: MergeSuggestion;
  mergedChildren: ArrangementItem[];
  allArrangements: ArrangementItem[];
  onAcceptMerge: (suggestion: MergeSuggestion) => void;
  onDismissMerge: (id: string) => void;
  onAddReminder: (
    id: string,
    rule: Omit<ReminderRule, "id" | "createdAt" | "updatedAt">
  ) => void;
  onToggleReminder: (arrangementId: string, ruleId: string) => void;
  onDeleteReminder: (arrangementId: string, ruleId: string) => void;
}) {
  const [deleteConfirming, setDeleteConfirming] = React.useState(false);

  React.useEffect(() => {
    setDeleteConfirming(false);
  }, [arrangement?.id]);

  if (!arrangement) return null;

  const overdue = isArrangementOverdue(arrangement, now);

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-overlay-light"
        onClick={onClose}
        aria-label="关闭安排详情"
      />
      <div className="relative z-10 flex max-h-[calc(100%-12px)] w-full flex-col overflow-hidden rounded-t-[18px] bg-bg shadow-lift">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4 [scrollbar-gutter:stable]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] text-text-tertiary">安排详情</p>
            <h2 className="mt-1 break-words text-lg font-semibold leading-6 text-text">
              {arrangement.title}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="inline-flex h-9 items-center gap-1 rounded-full border border-border-light bg-surface px-1 shadow-[var(--mine-card-shadow)]">
              <DetailUtilityButton
                label="编辑"
                tone="edit"
                onClick={() => onEdit(arrangement)}
              />
              <span className="h-3.5 w-px bg-border-light" aria-hidden="true" />
              <DetailUtilityButton
                label="删除"
                tone="delete"
                onClick={() => setDeleteConfirming(true)}
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-full border border-border-light bg-surface px-3 text-[12px] font-semibold text-text-muted shadow-[var(--mine-card-shadow)] transition hover:bg-surface-muted active:scale-[0.98]"
            >
              关闭
            </button>
          </div>
        </div>
        {deleteConfirming && (
          <div className="mb-3 rounded-[8px] bg-surface px-3 py-3 text-[12px] leading-5 text-text-muted shadow-[var(--mine-card-shadow)]">
            <p>删除后无法恢复。确认前，你也可以先改为“以后再说”。</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onDelete(arrangement.id)}
                className="h-9 rounded-full bg-[rgba(244,99,99,0.12)] text-[12px] font-semibold text-danger transition active:scale-[0.98]"
              >
                确认删除
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirming(false)}
                className="h-9 rounded-full bg-surface-muted text-[12px] font-semibold text-text transition active:scale-[0.98]"
              >
                取消删除
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <DetailBlock label="状态">
            <div className="flex items-center gap-2">
              <StatusPill status={arrangement.status} overdue={overdue} />
              {overdue && (
                <span className="text-[12px] text-text-muted">
                  已稍微超过计划时间，可以重新安排。
                </span>
              )}
            </div>
          </DetailBlock>
          {arrangement.description && (
            <DetailBlock label="说明">
              <p className="whitespace-pre-wrap text-[13px] leading-6 text-text">
                {arrangement.description}
              </p>
            </DetailBlock>
          )}
          <DetailBlock label="时间">
            <p className="text-[13px] leading-5 text-text">
              <span className="mr-2 rounded-full bg-primary-soft px-2 py-1 text-[11px] text-primary">
                {getTimeKindLabel(arrangement)}
              </span>
              {formatArrangementTime(arrangement)}
            </p>
          </DetailBlock>
          <ReminderRulesBlock
            arrangement={arrangement}
            onAddReminder={onAddReminder}
            onToggleReminder={onToggleReminder}
            onDeleteReminder={onDeleteReminder}
          />
          {(arrangement.location || arrangement.people.length > 0) && (
            <DetailBlock label="地点与相关人">
              <div className="flex flex-wrap gap-1.5">
                {arrangement.location && <MetaPill>{arrangement.location}</MetaPill>}
                {arrangement.people.map((person) => (
                  <MetaPill key={person}>{person}</MetaPill>
                ))}
              </div>
            </DetailBlock>
          )}
          {arrangement.reminderNote && (
            <DetailBlock label="提醒备注">
              <p className="text-[13px] leading-5 text-text">
                {arrangement.reminderNote}
              </p>
            </DetailBlock>
          )}
          <DetailBlock label="执行方式">
            <p className="text-[13px] leading-5 text-text-muted">
              V1 默认由用户完成。AI 辅助和代办会在后续版本分层呈现。
            </p>
          </DetailBlock>
          {mergeSuggestion && (
            <MergeSuggestionBlock
              suggestion={mergeSuggestion}
              arrangements={allArrangements}
              onAccept={onAcceptMerge}
              onDismiss={onDismissMerge}
            />
          )}
          {mergedChildren.length > 0 && (
            <DetailBlock label="被合并项">
              <div className="space-y-2">
                {mergedChildren.map((child) => (
                  <div
                    key={child.id}
                    className="rounded-[8px] bg-surface-muted px-3 py-2"
                  >
                    <p className="text-[12px] font-medium text-text">
                      {child.title}
                    </p>
                    <p className="mt-1 text-[12px] leading-5 text-text-muted">
                      已保留为可追溯记录，默认不进入列表和日历。
                    </p>
                  </div>
                ))}
              </div>
            </DetailBlock>
          )}
          {arrangement.sourceRefs.length > 0 && (
            <DetailBlock label="来源上下文">
              <div className="space-y-2">
                {arrangement.sourceRefs.map((source) => (
                  <div
                    key={source.id}
                    className="rounded-[8px] bg-surface-muted px-3 py-2"
                  >
                    <p className="text-[12px] font-medium text-text">
                      {source.title}
                    </p>
                    <p className="mt-1 text-[12px] leading-5 text-text-muted">
                      {source.excerpt}
                    </p>
                  </div>
                ))}
              </div>
            </DetailBlock>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {arrangement.status === "completed" ? (
            <DetailActionButton
              label="恢复"
              onClick={() => onChangeStatus(arrangement.id, "active")}
            />
          ) : (
            <DetailActionButton
              label="完成"
              onClick={() => onChangeStatus(arrangement.id, "completed")}
            />
          )}
          {arrangement.status === "later" ? (
            <DetailActionButton
              label="放回关注"
              onClick={() => onChangeStatus(arrangement.id, "active")}
            />
          ) : (
            <DetailActionButton
              label="以后再说"
              onClick={() => onChangeStatus(arrangement.id, "later")}
            />
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[8px] bg-surface px-3 py-3 shadow-[var(--mine-card-shadow)]">
      <p className="mb-1.5 text-[12px] font-medium text-text-tertiary">{label}</p>
      {children}
    </section>
  );
}

function ReminderRulesBlock({
  arrangement,
  onAddReminder,
  onToggleReminder,
  onDeleteReminder,
}: {
  arrangement: ArrangementItem;
  onAddReminder: (
    id: string,
    rule: Omit<ReminderRule, "id" | "createdAt" | "updatedAt">
  ) => void;
  onToggleReminder: (arrangementId: string, ruleId: string) => void;
  onDeleteReminder: (arrangementId: string, ruleId: string) => void;
}) {
  const canUseTimeBasedReminder = arrangement.timeKind !== "none";
  const defaultSameDayMinutes = getArrangementDefaultReminderMinutes(arrangement);
  const [manualTimeInput, setManualTimeInput] = React.useState(() =>
    formatMinutesOfDay(defaultSameDayMinutes)
  );
  const [manualSettingOpen, setManualSettingOpen] = React.useState(false);

  React.useEffect(() => {
    setManualTimeInput(formatMinutesOfDay(defaultSameDayMinutes));
    setManualSettingOpen(false);
  }, [arrangement.id, defaultSameDayMinutes]);

  const manualMinutes = parseTimeInputToMinutes(manualTimeInput);
  const displayedSameDayMinutes = manualMinutes ?? defaultSameDayMinutes;

  return (
    <DetailBlock label="提醒">
      {arrangement.reminderRules.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {arrangement.reminderRules.map((rule) => (
            <div
              key={rule.id}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-left text-[12px]",
                rule.enabled
                  ? "bg-primary-soft text-primary"
                  : "bg-surface-muted text-text-tertiary"
              )}
            >
              <span className="min-w-0 flex-1 truncate font-semibold">
                {formatReminderRuleLabel(rule)}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggleReminder(arrangement.id, rule.id)}
                  className={cn(
                    "h-7 rounded-full px-2.5 text-[11px] font-semibold transition active:scale-[0.98]",
                    rule.enabled
                      ? "bg-bg text-primary"
                      : "bg-bg text-text-muted"
                  )}
                >
                  {rule.enabled ? "关闭" : "开启"}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteReminder(arrangement.id, rule.id)}
                  className="h-7 rounded-full bg-[rgba(244,99,99,0.1)] px-2.5 text-[11px] font-semibold text-danger transition active:scale-[0.98]"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <ReminderQuickButton
          label="提前30分钟"
          disabled={!canUseTimeBasedReminder}
          onClick={() =>
            onAddReminder(arrangement.id, {
              type: "before",
              enabled: true,
              offsetMinutes: 30,
            })
          }
        />
        <ReminderQuickButton
          label="提前1小时"
          disabled={!canUseTimeBasedReminder}
          onClick={() =>
            onAddReminder(arrangement.id, {
              type: "before",
              enabled: true,
              offsetMinutes: 60,
            })
          }
        />
        <ReminderQuickButton
          label={`手动设定：当天${formatMinutesOfDay(displayedSameDayMinutes)}`}
          disabled={!canUseTimeBasedReminder}
          className="col-span-2"
          onClick={() => setManualSettingOpen((open) => !open)}
        />
      </div>
      {manualSettingOpen && (
        <div className="mt-2 flex items-center gap-2 rounded-[8px] bg-surface-muted px-2 py-2">
          <input
            type="time"
            value={manualTimeInput}
            onChange={(event) => setManualTimeInput(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-[8px] border border-transparent bg-bg px-2 text-[13px] text-text outline-none focus:border-primary/30"
          />
          <button
            type="button"
            disabled={manualMinutes === null}
            onClick={() => {
              if (manualMinutes === null) return;
              onAddReminder(arrangement.id, {
                type: "same-day",
                enabled: true,
                timeOfDayMinutes: manualMinutes,
              });
              setManualSettingOpen(false);
            }}
            className="h-9 rounded-full bg-primary px-3 text-[12px] font-semibold text-on-primary disabled:opacity-50"
          >
            保存
          </button>
        </div>
      )}
    </DetailBlock>
  );
}

function ReminderQuickButton({
  label,
  disabled,
  className,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full bg-surface-muted px-2 text-[12px] font-semibold text-text transition active:scale-[0.98] disabled:text-text-tertiary disabled:opacity-60",
        className
      )}
    >
      {label}
    </button>
  );
}

function MergeSuggestionBlock({
  suggestion,
  arrangements,
  onAccept,
  onDismiss,
}: {
  suggestion: MergeSuggestion;
  arrangements: ArrangementItem[];
  onAccept: (suggestion: MergeSuggestion) => void;
  onDismiss: (id: string) => void;
}) {
  const candidateItems = suggestion.candidateArrangementIds
    .map((id) => arrangements.find((arrangement) => arrangement.id === id))
    .filter((arrangement): arrangement is ArrangementItem => Boolean(arrangement));

  if (candidateItems.length === 0) return null;

  return (
    <DetailBlock label="相似安排">
      <p className="text-[12px] leading-5 text-text-muted">{suggestion.reason}</p>
      <div className="mt-2 space-y-1.5">
        {candidateItems.map((arrangement) => (
          <div
            key={arrangement.id}
            className="rounded-[8px] bg-surface-muted px-3 py-2"
          >
            <p className="text-[12px] font-medium text-text">{arrangement.title}</p>
            <p className="mt-1 text-[11px] text-text-tertiary">
              {formatArrangementTime(arrangement)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onAccept(suggestion)}
          className="h-9 rounded-full bg-primary text-[12px] font-semibold text-on-primary"
        >
          合并
        </button>
        <button
          type="button"
          onClick={() => onDismiss(suggestion.id)}
          className="h-9 rounded-full bg-surface-muted text-[12px] font-semibold text-text-muted"
        >
          忽略
        </button>
      </div>
    </DetailBlock>
  );
}

function DetailActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 rounded-full bg-surface text-[13px] font-semibold text-text shadow-[var(--mine-card-shadow)] transition active:scale-[0.98]"
    >
      {label}
    </button>
  );
}

function DetailUtilityButton({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: "edit" | "delete";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-7 rounded-full px-2.5 text-[12px] font-semibold transition active:scale-[0.98]",
        tone === "edit"
          ? "text-warning hover:bg-[rgba(237,190,9,0.12)]"
          : "text-danger hover:bg-[rgba(244,99,99,0.1)]"
      )}
    >
      {label}
    </button>
  );
}

function ArrangementField({
  label,
  value,
  placeholder,
  required,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-text-muted">
        {label}
      </span>
      <input
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-[8px] border border-transparent bg-surface px-3 text-[14px] text-text outline-none transition placeholder:text-text-tertiary focus:border-primary/30 focus:shadow-[var(--shadow-focus)]"
      />
    </label>
  );
}

function ArrangementTextarea({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-text-muted">
        {label}
      </span>
      <textarea
        value={value}
        rows={3}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded-[8px] border border-transparent bg-surface px-3 py-2.5 text-[14px] leading-5 text-text outline-none transition placeholder:text-text-tertiary focus:border-primary/30 focus:shadow-[var(--shadow-focus)]"
      />
    </label>
  );
}

function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-text-muted">
        {label}
      </span>
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-[8px] border border-transparent bg-surface px-3 text-[13px] text-text outline-none transition focus:border-primary/30 focus:shadow-[var(--shadow-focus)]"
      />
    </label>
  );
}

function toArrangementInput(formState: ArrangementFormState): ArrangementInput {
  return {
    title: formState.title,
    description: formState.description,
    timeKind: formState.timeKind,
    dueAt: formState.timeKind === "due" ? parseDateTime(formState.dueAt) : null,
    startAt:
      formState.timeKind === "range" ? parseDateTime(formState.startAt) : null,
    endAt: formState.timeKind === "range" ? parseDateTime(formState.endAt) : null,
    location: formState.location,
    people: formState.people,
    reminderNote: formState.reminderNote,
  };
}

function toArrangementFormState(arrangement: ArrangementItem): ArrangementFormState {
  return {
    title: arrangement.title,
    description: arrangement.description,
    timeKind: arrangement.timeKind,
    dueAt: toDateTimeInputValue(arrangement.dueAt),
    startAt: toDateTimeInputValue(arrangement.startAt),
    endAt: toDateTimeInputValue(arrangement.endAt),
    location: arrangement.location,
    people: arrangement.people.join("、"),
    reminderNote: arrangement.reminderNote,
  };
}

function normalizeFormPeople(value: string) {
  return value
    .split(/[,，、\n]/)
    .map((person) => person.trim())
    .filter((person) => person.length > 0);
}

function parseDateTime(value: string) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function toDateTimeInputValue(timestamp: number | null) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function getTimeKindLabel(arrangement: ArrangementItem) {
  if (arrangement.timeKind === "range") return "时间段";
  if (arrangement.timeKind === "due") return "截止时间";
  return "无明确时间";
}

function formatReminderRuleLabel(rule: ReminderRule) {
  if (rule.type === "before") {
    return `提前${rule.offsetMinutes ?? 0}分钟`;
  }
  if (rule.type === "same-day") {
    return `当天${formatMinutesOfDay(rule.timeOfDayMinutes ?? 9 * 60)}`;
  }
  return `${rule.recurrence === "weekly" ? "每周" : "每天"}${formatMinutesOfDay(
    rule.timeOfDayMinutes ?? 9 * 60
  )}`;
}

function getArrangementDefaultReminderMinutes(arrangement: ArrangementItem) {
  const timestamp =
    arrangement.timeKind === "range"
      ? arrangement.startAt
      : arrangement.timeKind === "due"
        ? arrangement.dueAt
        : null;
  if (!timestamp) return 9 * 60;
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
}

function parseTimeInputToMinutes(value: string) {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return hour * 60 + minute;
}

function formatMinutesOfDay(minutes: number) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

function startOfMonthTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getMonthRange(monthStart: number) {
  const start = new Date(monthStart);
  const end = new Date(monthStart);
  end.setMonth(end.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return {
    startAt: start.getTime(),
    endAt: end.getTime(),
  };
}

function addMonths(timestamp: number, amount: number) {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() + amount);
  return startOfMonthTimestamp(date.getTime());
}

function buildMonthGrid(monthStart: number) {
  const firstDay = new Date(monthStart);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const gridStart = startOfLocalDay(monthStart - startWeekday * 24 * 60 * 60 * 1000);
  return Array.from({ length: 42 }, (_, index) => {
    const timestamp = gridStart + index * 24 * 60 * 60 * 1000;
    const date = new Date(timestamp);
    return {
      timestamp,
      dateKey: formatLocalDateKey(timestamp),
      day: date.getDate(),
      month: date.getMonth(),
    };
  });
}

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatLocalDateKey(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthTitle(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(timestamp);
}
