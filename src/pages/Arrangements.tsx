import React from "react";
import {
  arrangementsStorageKey,
  applyAutomaticArrangementRules,
  createArrangementItem,
  formatArrangementTime,
  getInitialArrangements,
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
  const [collapsedGroups, setCollapsedGroups] = React.useState<
    Record<CollapsibleGroupKey, boolean>
  >({
    focus: false,
    upcoming: false,
    noTime: false,
    later: true,
    completed: true,
  });

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
  const searchResults = React.useMemo(
    () => searchArrangementItems(arrangements, searchQuery),
    [arrangements, searchQuery]
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold leading-7 text-text">安排</h1>
          </div>
          <button
            type="button"
            onClick={openCreateArrangement}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-xl leading-none text-on-primary shadow-sm transition active:scale-[0.96]"
            aria-label="新建安排"
          >
            +
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <ArrangementStat label="进行中" value={activeCount} />
          <ArrangementStat label="以后再说" value={laterCount} />
          <ArrangementStat label="已完成" value={completedCount} />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="space-y-5">
          <ArrangementSearchLauncher onOpen={() => setSearchOpen(true)} />
          {groupMeta.map((group) => {
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
          })}
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
    </div>
  );
}

function ArrangementStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[8px] bg-surface px-3 py-2 shadow-[var(--mine-card-shadow)]">
      <p className="text-[18px] font-semibold leading-6 text-text">{value}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-text-tertiary">{label}</p>
    </div>
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

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
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
        className="relative z-10 max-h-[calc(100%-12px)] w-full overflow-y-auto rounded-t-[18px] bg-bg px-4 pb-5 pt-4 shadow-lift"
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
}: {
  arrangement: ArrangementItem | undefined;
  now: number;
  onClose: () => void;
  onEdit: (arrangement: ArrangementItem) => void;
  onDelete: (id: string) => void;
  onChangeStatus: (id: string, status: ArrangementStatus) => void;
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
      <div className="relative z-10 max-h-[calc(100%-12px)] w-full overflow-y-auto rounded-t-[18px] bg-bg px-4 pb-5 pt-4 shadow-lift">
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
              {formatArrangementTime(arrangement)}
            </p>
          </DetailBlock>
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
