"use client";

import { useActionState, useState } from "react";
import { Calendar, Clock, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  FieldLabel,
  FieldError,
  FieldDescription,
  Input,
} from "@/components/ui/input";
import { TimePicker } from "@/components/ui/time-picker";
import { updateWorkspaceSchedule, type FormState } from "./actions";

const INITIAL: FormState = {};

const DAYS = [
  { num: 1, label: "Sen" },
  { num: 2, label: "Sel" },
  { num: 3, label: "Rab" },
  { num: 4, label: "Kam" },
  { num: 5, label: "Jum" },
  { num: 6, label: "Sab" },
  { num: 7, label: "Min" },
];

export function ScheduleForm({
  slug,
  initial,
}: {
  slug: string;
  initial: {
    schedule_days: number[];
    schedule_start_time: string;
    schedule_end_time: string;
    daily_target: number;
  };
}) {
  const [state, action, pending] = useActionState(
    updateWorkspaceSchedule.bind(null, slug),
    INITIAL,
  );
  const [days, setDays] = useState<number[]>(initial.schedule_days);

  function toggleDay(d: number) {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Default Schedule
        </h3>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Schedule default untuk send queues di workspace ini. Bisa di-override
          per queue.
        </p>
      </div>
      <form action={action} className="space-y-5 p-5">
        <input type="hidden" name="schedule_days" value={days.join(",")} />

        <div>
          <FieldLabel>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-zinc-500" /> Hari Aktif
            </span>
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => {
              const active = days.includes(d.num);
              return (
                <button
                  type="button"
                  key={d.num}
                  onClick={() => toggleDay(d.num)}
                  className={`inline-flex h-9 w-12 items-center justify-center rounded-lg text-xs font-semibold transition-all ${
                    active
                      ? "bg-zinc-900 text-zinc-50 shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                      : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <FieldError>{state.fieldErrors?.schedule_days}</FieldError>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-zinc-500" /> Mulai jam
              </span>
            </FieldLabel>
            <TimePicker
              name="schedule_start_time"
              value={initial.schedule_start_time.slice(0, 5)}
              required
              step={30}
            />
          </div>
          <div>
            <FieldLabel>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-zinc-500" /> Sampai jam
              </span>
            </FieldLabel>
            <TimePicker
              name="schedule_end_time"
              value={initial.schedule_end_time.slice(0, 5)}
              required
              step={30}
            />
            <FieldError>{state.fieldErrors?.schedule_end_time}</FieldError>
          </div>
          <div>
            <FieldLabel htmlFor="ws-target">
              <span className="inline-flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-zinc-500" /> Target/hari
              </span>
            </FieldLabel>
            <Input
              id="ws-target"
              name="daily_target"
              type="number"
              min={1}
              max={500}
              defaultValue={initial.daily_target}
              required
            />
          </div>
        </div>
        <FieldDescription>
          Target/hari adalah default. Quota Gmail-mu (di card atas) menentukan
          batas keras pengiriman per hari.
        </FieldDescription>

        {state.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400">
            ✓ Saved
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" loading={pending} disabled={pending} size="sm">
            {pending ? "Menyimpan..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
