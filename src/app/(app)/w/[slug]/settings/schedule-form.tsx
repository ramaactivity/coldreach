"use client";

import { useActionState, useState } from "react";
import { Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  FieldLabel,
  FieldError,
  FieldDescription,
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
  dailyVolume,
}: {
  slug: string;
  initial: {
    schedule_days: number[];
    schedule_start_time: string;
    schedule_end_time: string;
  };
  dailyVolume: number;
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
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-[15px] font-semibold text-ink">Default Schedule</h3>
        <p className="mt-0.5 text-xs text-muted">
          Schedule default untuk send queues di workspace ini. Bisa di-override
          per queue.
        </p>
      </div>
      <form action={action} className="space-y-5 p-5">
        <input type="hidden" name="schedule_days" value={days.join(",")} />

        <div>
          <FieldLabel>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted" /> Hari Aktif
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
                  className={`inline-flex h-9 w-12 items-center justify-center rounded-md text-xs font-semibold transition-colors ${
                    active
                      ? "bg-action text-on-action"
                      : "border border-border bg-surface text-ink-secondary hover:bg-surface-hover"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <FieldError>{state.fieldErrors?.schedule_days}</FieldError>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted" /> Mulai jam
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
                <Clock className="h-3.5 w-3.5 text-muted" /> Sampai jam
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
        </div>
        <FieldDescription>
          Target kirim <strong className="text-ink-secondary">{dailyVolume}/hari</strong>{" "}
          mengikuti Gmail quota — ubah di kartu <em>Gmail Account</em> di atas.
          Menyimpan jadwal ini langsung diterapkan ke semua queue aktif di
          workspace ini.
        </FieldDescription>

        {state.error && (
          <p className="rounded-md border border-danger-soft bg-danger-soft p-3 text-[13px] font-medium text-danger-text">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="rounded-md border border-success-soft bg-success-soft p-3 text-[13px] font-medium text-success-text">
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
