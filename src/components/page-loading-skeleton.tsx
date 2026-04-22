import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PageLoadingSkeleton({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      className={cn(
        "w-full",
        fullScreen ? "flex min-h-screen items-center justify-center bg-white px-6" : "p-6"
      )}
    >
      <div className={cn("w-full max-w-7xl space-y-6", fullScreen && "animate-pulse")}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-5 w-80" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-4 rounded-2xl border bg-white p-5 xl:col-span-2">
            <Skeleton className="h-6 w-48" />
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border bg-white p-5">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
