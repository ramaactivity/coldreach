import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({
  className,
  size = "md",
}: {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const sizeClass = {
    xs: "h-3 w-3",
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  }[size];
  return (
    <Loader2
      className={cn("animate-spin text-current", sizeClass, className)}
      aria-hidden="true"
    />
  );
}
