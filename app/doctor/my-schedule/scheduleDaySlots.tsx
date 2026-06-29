"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type SlotDetail = {
  startTime: string;
  consultationType: "CLINIC" | "ONLINE" | "BOTH";
  booked: boolean;
  slotDurationMinutes: number;
};

export type ScheduleListDay = {
  date: string;
  slotStarts: string[];
  slotDetails?: SlotDetail[];
};

export function bookedConsultationAbbrev(
  type: SlotDetail["consultationType"],
): string {
  if (type === "CLINIC") return "(C)";
  if (type === "ONLINE") return "(O)";
  return "(C/O)";
}

/** Lexicographic sort works for "HH:MM" / "H:MM" style slot starts used in scheduling. */
export function compareSlotStart(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

export function normalizeDaySlots(day: ScheduleListDay): SlotDetail[] {
  return (
    day.slotDetails ??
    day.slotStarts.map((startTime) => ({
      startTime,
      consultationType: "BOTH" as const,
      booked: false,
      slotDurationMinutes: 30,
    }))
  );
}

export function groupScheduleDaySlots(slots: SlotDetail[]) {
  const clinicOnlyAvail: string[] = [];
  const onlineOnlyAvail: string[] = [];
  const clinicOnlineAvail: string[] = [];
  const booked: {
    startTime: string;
    consultationType: SlotDetail["consultationType"];
  }[] = [];

  for (const s of slots) {
    if (s.booked) {
      booked.push({
        startTime: s.startTime,
        consultationType: s.consultationType,
      });
      continue;
    }
    if (s.consultationType === "CLINIC") clinicOnlyAvail.push(s.startTime);
    else if (s.consultationType === "ONLINE") onlineOnlyAvail.push(s.startTime);
    else clinicOnlineAvail.push(s.startTime);
  }

  clinicOnlyAvail.sort(compareSlotStart);
  onlineOnlyAvail.sort(compareSlotStart);
  clinicOnlineAvail.sort(compareSlotStart);
  booked.sort((x, y) => compareSlotStart(x.startTime, y.startTime));

  return { clinicOnlyAvail, onlineOnlyAvail, clinicOnlineAvail, booked };
}

type DurationBucket = {
  durationMinutes: number;
  startTimes: string[];
};

type ConsultationTypeGroup = {
  consultationType: SlotDetail["consultationType"];
  label: string;
  durations: DurationBucket[];
};

type BookedSlot = {
  startTime: string;
  consultationType: SlotDetail["consultationType"];
  slotDurationMinutes: number;
};

export type GroupedSlotSummary = {
  available: ConsultationTypeGroup[];
  booked: BookedSlot[];
};

const CONSULT_TYPE_ORDER: SlotDetail["consultationType"][] = [
  "CLINIC",
  "ONLINE",
  "BOTH",
];
const CONSULT_TYPE_LABEL: Record<SlotDetail["consultationType"], string> = {
  CLINIC: "Clinic",
  ONLINE: "Online",
  BOTH: "Clinic/Online",
};

export function groupSlotsByTypeAndDuration(
  slots: SlotDetail[],
): GroupedSlotSummary {
  const booked: BookedSlot[] = [];
  const byType = new Map<
    SlotDetail["consultationType"],
    Map<number, string[]>
  >();

  for (const s of slots) {
    if (s.booked) {
      booked.push({
        startTime: s.startTime,
        consultationType: s.consultationType,
        slotDurationMinutes: s.slotDurationMinutes,
      });
      continue;
    }
    let durMap = byType.get(s.consultationType);
    if (!durMap) {
      durMap = new Map();
      byType.set(s.consultationType, durMap);
    }
    const list = durMap.get(s.slotDurationMinutes) ?? [];
    list.push(s.startTime);
    durMap.set(s.slotDurationMinutes, list);
  }

  booked.sort((a, b) => compareSlotStart(a.startTime, b.startTime));

  const available: ConsultationTypeGroup[] = [];
  for (const ct of CONSULT_TYPE_ORDER) {
    const durMap = byType.get(ct);
    if (!durMap || durMap.size === 0) continue;
    const durations: DurationBucket[] = [...durMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([dur, times]) => ({
        durationMinutes: dur,
        startTimes: times.sort(compareSlotStart),
      }));
    available.push({
      consultationType: ct,
      label: CONSULT_TYPE_LABEL[ct],
      durations,
    });
  }

  return { available, booked };
}

type SlotSummaryFromDetailsProps = {
  slots: SlotDetail[];
  /** When true, only render the "Booked" line — used by the Booked-only filter on View Schedule. */
  bookedOnly?: boolean;
};

export function SlotSummaryFromDetails({
  slots,
  bookedOnly = false,
}: SlotSummaryFromDetailsProps) {
  const { available, booked } = groupSlotsByTypeAndDuration(slots);

  const bookedByDuration = (() => {
    const byDur = new Map<number, BookedSlot[]>();
    for (const b of booked) {
      const list = byDur.get(b.slotDurationMinutes) ?? [];
      list.push(b);
      byDur.set(b.slotDurationMinutes, list);
    }
    return [...byDur.entries()].sort(([a], [b]) => a - b);
  })();

  const showAvailability = !bookedOnly;
  const hasAny = bookedOnly
    ? booked.length > 0
    : available.length > 0 || booked.length > 0;

  if (!hasAny) {
    return (
      <span className="text-[#5E5E5E]">
        {bookedOnly ? "No booked slots" : "No slots"}
      </span>
    );
  }

  return (
    <div className="mt-1 space-y-1 font-montserrat text-sm text-[#333333]">
      {showAvailability &&
        available.map((group) => (
          <div key={group.consultationType}>
            <p className="font-semibold">{group.label}:</p>
            {group.durations.map((dur) => (
              <p key={dur.durationMinutes}>
                <span className="font-medium">{dur.durationMinutes} min:</span>{" "}
                <span className="text-[#333333]">
                  {dur.startTimes.join(", ")}
                </span>
              </p>
            ))}
          </div>
        ))}
      {booked.length > 0 ? (
        <div>
          <p className="font-semibold">Booked:</p>
          {bookedByDuration.map(([dur, items]) => (
            <p key={dur}>
              <span className="font-medium">{dur} min:</span>{" "}
              <span className="text-[#333333]">
                {items
                  .map(
                    (b) =>
                      `${b.startTime} ${bookedConsultationAbbrev(b.consultationType)}`,
                  )
                  .join(", ")}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ScheduleDaySlotSummary({
  day,
  bookedOnly = false,
}: {
  day: ScheduleListDay;
  bookedOnly?: boolean;
}) {
  const slots = normalizeDaySlots(day);
  if (slots.length === 0) {
    return (
      <span className="text-[#5E5E5E]">
        {bookedOnly ? "No booked slots" : "No slots"}
      </span>
    );
  }
  return <SlotSummaryFromDetails slots={slots} bookedOnly={bookedOnly} />;
}

function getGroupStartTimes(group: ConsultationTypeGroup): string[] {
  return group.durations.flatMap((dur) => dur.startTimes);
}

function GroupSelectAllRow({
  groupStartTimes,
  selectedStarts,
  onSetGroupSelection,
}: {
  groupStartTimes: string[];
  selectedStarts: Set<string>;
  onSetGroupSelection: (startTimes: string[], selected: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedCount = groupStartTimes.filter((t) =>
    selectedStarts.has(t),
  ).length;
  const allSelected =
    groupStartTimes.length > 0 && selectedCount === groupStartTimes.length;
  const someSelected = selectedCount > 0 && !allSelected;

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  if (groupStartTimes.length === 0) return null;

  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 font-montserrat text-xs text-[#5E5E5E]">
      <input
        ref={inputRef}
        type="checkbox"
        checked={allSelected}
        onChange={() => onSetGroupSelection(groupStartTimes, !allSelected)}
        className="cursor-pointer accent-red-600"
      />
      Select all
    </label>
  );
}

function DeletableSlotChip({
  startTime,
  selected,
  onToggle,
}: {
  startTime: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 font-montserrat text-xs transition-colors",
        selected
          ? "border-red-300 bg-red-50 text-red-700"
          : "border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#f5f5f5]",
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="accent-red-600"
      />
      <span>{startTime}</span>
    </label>
  );
}

function BookedSlotChip({
  startTime,
  consultationType,
}: {
  startTime: string;
  consultationType: SlotDetail["consultationType"];
}) {
  return (
    <label className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 font-montserrat text-xs text-amber-700 opacity-90">
      <input
        type="checkbox"
        disabled
        checked={false}
        className="accent-amber-600"
        aria-label={`${startTime} booked`}
      />
      <span>
        {startTime} {bookedConsultationAbbrev(consultationType)}
      </span>
    </label>
  );
}

export type SlotSummaryDeletePickerProps = {
  slots: SlotDetail[];
  selectedStarts: Set<string>;
  onToggleSlot: (startTime: string) => void;
  onSetGroupSelection: (startTimes: string[], selected: boolean) => void;
};

export function SlotSummaryDeletePicker({
  slots,
  selectedStarts,
  onToggleSlot,
  onSetGroupSelection,
}: SlotSummaryDeletePickerProps) {
  const { available, booked } = groupSlotsByTypeAndDuration(slots);

  const hasAny = available.length > 0 || booked.length > 0;
  if (!hasAny) {
    return (
      <span className="font-montserrat text-sm text-[#5E5E5E]">No slots</span>
    );
  }

  const bookedByDuration = (() => {
    const byDur = new Map<number, BookedSlot[]>();
    for (const b of booked) {
      const list = byDur.get(b.slotDurationMinutes) ?? [];
      list.push(b);
      byDur.set(b.slotDurationMinutes, list);
    }
    return [...byDur.entries()].sort(([a], [b]) => a - b);
  })();

  return (
    <div className="mt-1 space-y-3 font-montserrat text-sm text-[#333333]">
      {available.map((group) => {
        const groupStartTimes = getGroupStartTimes(group);
        return (
          <div key={group.consultationType}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="font-semibold">{group.label}:</p>
              <GroupSelectAllRow
                groupStartTimes={groupStartTimes}
                selectedStarts={selectedStarts}
                onSetGroupSelection={onSetGroupSelection}
              />
            </div>
            {group.durations.map((dur) => (
              <div key={dur.durationMinutes} className="mt-2">
                <p className="font-medium text-xs text-[#333333]">
                  {dur.durationMinutes} min:
                </p>

                <div className="mt-1 flex flex-wrap gap-2">
                  {dur.startTimes.map((startTime) => (
                    <DeletableSlotChip
                      key={startTime}
                      startTime={startTime}
                      selected={selectedStarts.has(startTime)}
                      onToggle={() => onToggleSlot(startTime)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {booked.length > 0 ? (
        <div>
          <p className="font-semibold">Booked:</p>
          {bookedByDuration.map(([dur, items]) => (
            <div key={dur} className="mt-2">
              <p className="font-medium text-xs text-[#333333]">{dur} min:</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {items.map((b) => (
                  <BookedSlotChip
                    key={b.startTime}
                    startTime={b.startTime}
                    consultationType={b.consultationType}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
