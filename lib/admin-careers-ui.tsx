import {
  applicationStatusValues,
  formatJobTypeLabel,
  jobTypeValues,
} from "@/lib/careers-schemas";
import {
  CURRENCY_LABELS,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/lib/currency";

export type JobType = (typeof jobTypeValues)[number];
export type ApplicationStatus = (typeof applicationStatusValues)[number];
export type ScoreBand = "all" | "low" | "mid" | "high";
export type ShortlistedScore = "all" | "5" | "6" | "7" | "8" | "9" | "10";

export type PostingForm = {
  title: string;
  description: string;
  type: JobType;
  isRemote: boolean;
  salaryRange: string;
  salaryCurrency: SupportedCurrency;
  isActive: boolean;
};

export const emptyPostingForm: PostingForm = {
  title: "",
  description: "",
  type: "FULL_TIME",
  isRemote: false,
  salaryRange: "",
  salaryCurrency: "USD",
  isActive: true,
};

export function postingFormsEqual(a: PostingForm, b: PostingForm): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.type === b.type &&
    a.isRemote === b.isRemote &&
    a.salaryRange.trim() === b.salaryRange.trim() &&
    a.salaryCurrency === b.salaryCurrency &&
    a.isActive === b.isActive
  );
}

export const SELECT_CHEVRON =
  'appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%23333333%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")] bg-[length:1rem_1rem] bg-[position:right_0.75rem_center] bg-no-repeat';

export function jobTypeBadgeClass(type: JobType) {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-1 font-montserrat text-xs font-medium";
  if (type === "FULL_TIME") return `${base} border-[#d7e4ff] bg-[#eef3ff] text-[#2555F3]`;
  if (type === "PART_TIME") return `${base} border-[#ffe7b8] bg-[#fff8eb] text-[#9a6700]`;
  return `${base} border-[#e5e5e5] bg-[#f5f5f5] text-[#5e5e5e]`;
}

export function activeBadgeClass(isActive: boolean) {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-1 font-montserrat text-xs font-medium";
  if (isActive) return `${base} border-[#d7f2d9] bg-[#effcf0] text-[#1f7a36]`;
  return `${base} border-[#e5e5e5] bg-[#f5f5f5] text-[#5e5e5e]`;
}

export function statusBadgeClass(status: ApplicationStatus) {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-1 font-montserrat text-xs font-medium";
  switch (status) {
    case "SHORTLISTED":
      return `${base} border-[#d7e4ff] bg-[#eef3ff] text-[#2555F3]`;
    case "REJECTED":
      return `${base} border-[#ffd0d0] bg-[#fff6f6] text-[#b42318]`;
    case "HIRED":
      return `${base} border-[#d7f2d9] bg-[#effcf0] text-[#1f7a36]`;
    default:
      return `${base} border-[#e5e5e5] bg-[#f5f5f5] text-[#5e5e5e]`;
  }
}

export function aiScoreBadgeClass(score: number | null) {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-1 font-montserrat text-xs font-semibold";
  if (score === null) return `${base} border-[#e5e5e5] bg-[#fafafa] text-[#5e5e5e]`;
  if (score >= 8) return `${base} border-[#d7f2d9] bg-[#effcf0] text-[#1f7a36]`;
  if (score >= 5) return `${base} border-[#ffe7b8] bg-[#fff8eb] text-[#9a6700]`;
  return `${base} border-[#ffd0d0] bg-[#fff6f6] text-[#b42318]`;
}

export function scoreBandParams(band: ScoreBand): {
  scoreMin?: string;
  scoreMax?: string;
} {
  if (band === "low") return { scoreMin: "1", scoreMax: "4" };
  if (band === "mid") return { scoreMin: "5", scoreMax: "7" };
  if (band === "high") return { scoreMin: "8", scoreMax: "10" };
  return {};
}

export function shortlistedScoreParams(score: ShortlistedScore): {
  scoreMin?: string;
  scoreMax?: string;
} {
  if (score === "all") return {};
  return { scoreMin: score, scoreMax: score };
}

export function formatCreatedDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function PostingFormFields({
  form,
  onChange,
  idPrefix,
}: {
  form: PostingForm;
  onChange: (next: PostingForm) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor={`${idPrefix}-title`}
          className="mb-1 block font-montserrat text-sm font-medium text-[#333333]"
        >
          Title
        </label>
        <input
          id={`${idPrefix}-title`}
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
          className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
        />
      </div>
      <div>
        <label
          htmlFor={`${idPrefix}-description`}
          className="mb-1 block font-montserrat text-sm font-medium text-[#333333]"
        >
          Description
        </label>
        <textarea
          id={`${idPrefix}-description`}
          rows={5}
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`${idPrefix}-type`}
            className="mb-1 block font-montserrat text-sm font-medium text-[#333333]"
          >
            Type
          </label>
          <select
            id={`${idPrefix}-type`}
            value={form.type}
            onChange={(e) =>
              onChange({ ...form, type: e.target.value as JobType })
            }
            className={`w-full cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 pr-10 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 ${SELECT_CHEVRON}`}
          >
            {jobTypeValues.map((t) => (
              <option key={t} value={t}>
                {formatJobTypeLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor={`${idPrefix}-currency`}
            className="mb-1 block font-montserrat text-sm font-medium text-[#333333]"
          >
            Salary currency
          </label>
          <select
            id={`${idPrefix}-currency`}
            value={form.salaryCurrency}
            onChange={(e) =>
              onChange({
                ...form,
                salaryCurrency: e.target.value as SupportedCurrency,
              })
            }
            className={`w-full cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 pr-10 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 ${SELECT_CHEVRON}`}
          >
            {SUPPORTED_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {CURRENCY_LABELS[code]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor={`${idPrefix}-salary`}
            className="mb-1 block font-montserrat text-sm font-medium text-[#333333]"
          >
            Salary range (optional)
          </label>
          <input
            id={`${idPrefix}-salary`}
            value={form.salaryRange}
            onChange={(e) => onChange({ ...form, salaryRange: e.target.value })}
            placeholder="e.g. 80k–100k"
            className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        <label className="flex cursor-pointer items-center gap-2 font-montserrat text-sm text-[#333333]">
          <input
            type="checkbox"
            checked={form.isRemote}
            onChange={(e) => onChange({ ...form, isRemote: e.target.checked })}
            className="size-4 rounded border-[#e5e5e5]"
          />
          Remote
        </label>
        <label className="flex cursor-pointer items-center gap-2 font-montserrat text-sm text-[#333333]">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => onChange({ ...form, isActive: e.target.checked })}
            className="size-4 rounded border-[#e5e5e5]"
          />
          Active (visible on public careers page)
        </label>
      </div>
    </div>
  );
}
