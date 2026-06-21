import { Container } from "@/components/layout/Container";
import { Skeleton } from "@/components/ui/skeleton";

export function PrescriptionPageSkeleton() {
  return (
    <div className="w-full bg-[#fafafa] py-6 md:py-8">
      <Container>
        <section className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
          <Skeleton className="h-8 w-40 bg-[#e5e5e5] md:h-9" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full bg-[#e5e5e5]" />
          <div className="mt-6 space-y-4">
            <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-[#fafafa]">
              <div className="space-y-4 bg-white p-4 sm:p-6 md:hidden">
                <Skeleton className="h-20 w-full rounded-lg bg-[#e5e5e5]" />
                <Skeleton className="h-24 w-full rounded-lg bg-[#e5e5e5]" />
                <Skeleton className="h-32 w-full rounded-lg bg-[#e5e5e5]" />
                <Skeleton className="h-28 w-full rounded-lg bg-[#e5e5e5]" />
              </div>
              <Skeleton className="hidden h-[70vh] w-full rounded-none bg-[#e5e5e5] md:block" />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Skeleton className="h-10 w-full rounded-xl bg-[#e5e5e5] sm:w-52" />
              <Skeleton className="h-10 w-full rounded-xl bg-[#e5e5e5] sm:w-44" />
            </div>
          </div>
        </section>
      </Container>
    </div>
  );
}
