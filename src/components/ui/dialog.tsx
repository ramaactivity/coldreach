"use client";

import * as React from "react";
import * as RDialog from "@radix-ui/react-dialog";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * Replaces window.confirm() with a styled, async-friendly modal.
 * Use either declaratively (open/onOpenChange) or imperatively via
 * the useConfirm() hook.
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
  const widthClass = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
  }[size];

  return (
    <RDialog.Portal>
      <RDialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <RDialog.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl ring-1 ring-black/5 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/5",
          widthClass,
          className,
        )}
      >
        {children}
        <RDialog.Close
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
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
      ? "bg-red-50 ring-red-100 text-red-600 dark:bg-red-950/30 dark:ring-red-900/50 dark:text-red-400"
      : "bg-zinc-100 ring-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:ring-zinc-700 dark:text-zinc-300";
  return (
    <div className="px-5 pt-5">
      {icon && (
        <div
          className={cn(
            "mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full ring-4",
            ringClass,
          )}
        >
          {icon}
        </div>
      )}
      <RDialog.Title className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </RDialog.Title>
      {description && (
        <RDialog.Description className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
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
        "flex flex-row-reverse items-center gap-2 border-t border-zinc-100 bg-zinc-50/50 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900/40",
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
              icon={opts.destructive ? <AlertTriangle className="h-5 w-5" /> : undefined}
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
                variant="outline"
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
