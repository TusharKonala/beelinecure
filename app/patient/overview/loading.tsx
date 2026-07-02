import { Container } from "@/components/layout/Container";
import { Skeleton } from "@/components/ui/skeleton";

const SNAPSHOT_PAIR_GRID =
  "mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 md:items-stretch";
const SNAPSHOT_CARD =
  "flex h-full min-h-0 flex-col rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-5 shadow-sm";
const SNAPSHOT_CARD_HEADER =
  "flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4";
const SNAPSHOT_CARD_TITLE_BLOCK = "flex min-w-0 flex-1 gap-3";
const SNAPSHOT_CARD_BODY = "mt-4 flex min-h-[148px] flex-1 flex-col";
const SNAPSHOT_LIST_ITEM =
  "rounded-lg border border-[#e5e5e5] bg-white px-4 py-3";

function SnapshotCardSkeleton() {
  return (
    <div className={SNAPSHOT_CARD}>
      <div className={SNAPSHOT_CARD_HEADER}>
        <div className={SNAPSHOT_CARD_TITLE_BLOCK}>
          <Skeleton className="h-11 w-11 shrink-0 rounded-2xl bg-[#e5e5e5]" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-40 bg-[#e5e5e5]" />
            <Skeleton className="mt-1.5 h-3 w-32 bg-[#e5e5e5]" />
          </div>
        </div>
        <Skeleton className="h-4 w-14 shrink-0 bg-[#e5e5e5]" />
      </div>
      <div className={SNAPSHOT_CARD_BODY}>
        <ul className="flex flex-1 flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <li key={i} className={SNAPSHOT_LIST_ITEM}>
              <Skeleton className="h-4 w-36 bg-[#e5e5e5]" />
              <Skeleton className="mt-2 h-3 w-48 bg-[#e5e5e5]" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function PatientOverviewLoading() {
  return (
    <div className="w-full bg-[#fafafa] py-6 md:py-8">
      <Container>
        <section className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
          <Skeleton className="h-8 w-32 bg-[#e5e5e5] md:h-9" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full bg-[#e5e5e5]" />

          <div className={SNAPSHOT_PAIR_GRID}>
            <SnapshotCardSkeleton />
            <SnapshotCardSkeleton />
          </div>

          <div className="mt-8">
            <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 gap-3">
                  <Skeleton className="h-11 w-11 shrink-0 rounded-2xl bg-[#e5e5e5]" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-32 bg-[#e5e5e5]" />
                    <Skeleton className="mt-1.5 h-3 w-56 max-w-full bg-[#e5e5e5]" />
                    <div className="mt-3 space-y-2">
                      <Skeleton className="h-4 w-full max-w-xs bg-[#e5e5e5]" />
                      <Skeleton className="h-4 w-24 bg-[#e5e5e5]" />
                    </div>
                  </div>
                </div>
                <Skeleton className="h-10 w-36 shrink-0 rounded-xl bg-[#e5e5e5]" />
              </div>
            </div>
          </div>
        </section>
      </Container>
    </div>
  );
}
