"use client";

import * as React from "react";
import * as RDialog from "@radix-ui/react-dialog";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * Floating layer: rounded-xl surface over a scrim, shadow-lg (allowed — it
 * genuinely floats). Replaces window.confirm() via the useConfirm() hook.
 */

export const Dialog = RDialog.Root;
export const DialogTrigger = RDialog.Trigger;
export const DialogClose = RDialog.Close;

export function DialogContent({
  children,
  className,
  size = "md",
}: {
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const widthClass = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" }[size];

  return (
    <RDialog.Portal>
      <RDialog.Overlay className="fixed inset-0 z-50 bg-zinc-950/45 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <RDialog.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-lg)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          widthClass,
          className,
        )}
      >
        {children}
        <RDialog.Close
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-ink"
        >
          <X className="h-4 w-4" />
        </RDialog.Close>
      </RDialog.Content>
    </RDialog.Portal>
  );
}

export function DialogHeader({
  title,
  description,
  icon,
  tone = "default",
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  tone?: "default" | "destructive";
}) {
  const ringClass =
    tone === "destructive"
      ? "bg-danger-soft text-danger"
      : "bg-surface-sunken text-muted";
  return (
    <div className="px-5 pt-5">
      {icon && (
        <div
          className={cn(
            "mb-3 inline-flex size-10 items-center justify-center rounded-full",
            ringClass,
          )}
        >
          {icon}
        </div>
      )}
      <RDialog.Title className="text-[15px] font-semibold text-ink">
        {title}
      </RDialog.Title>
      {description && (
        <RDialog.Description className="mt-1 text-sm leading-relaxed text-ink-secondary">
          {description}
        </RDialog.Description>
      )}
    </div>
  );
}

export function DialogBody({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-4">{children}</div>;
}

export function DialogFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-row-reverse items-center gap-2 border-t border-border bg-surface-sunken px-5 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ===================================================================== */
/* Imperative confirm() replacement                                      */
/* ===================================================================== */

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmContextType = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmContextType | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = React.useState<ConfirmOptions | null>(null);
  const resolverRef = React.useRef<((v: boolean) => void) | null>(null);

  const confirm = React.useCallback<ConfirmContextType>((options) => {
    setOpts(options);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  function handleClose(value: boolean) {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpts(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!opts} onOpenChange={(v) => !v && handleClose(false)}>
        {opts && (
          <DialogContent size="sm">
            <DialogHeader
              title={opts.title}
              description={opts.description}
              icon={
                opts.destructive ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : undefined
              }
              tone={opts.destructive ? "destructive" : "default"}
            />
            <DialogFooter>
              <Button
                variant={opts.destructive ? "destructive" : "primary"}
                size="sm"
                onClick={() => handleClose(true)}
              >
                {opts.confirmLabel ?? "Confirm"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleClose(false)}
              >
                {opts.cancelLabel ?? "Batal"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextType {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside ConfirmProvider");
  }
  return ctx;
}
