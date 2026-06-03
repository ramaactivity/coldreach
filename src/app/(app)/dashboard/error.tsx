"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <ErrorState
        onRetry={reset}
        description="Gagal ngambil ringkasan workspace. Coba lagi — kalau masih, refresh halaman."
      />
    </div>
  );
}
