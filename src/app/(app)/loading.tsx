import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b border-border/80 bg-surface px-6 py-3">
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-2 h-4 w-96" />
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    </div>
  );
}
