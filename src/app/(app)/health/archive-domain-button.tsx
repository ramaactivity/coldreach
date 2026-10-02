"use client";

import { useTransition } from "react";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast-provider";
import { archiveDomain } from "./actions";

export function ArchiveDomainButton({ domain, count }: { domain: string; count: number }) {
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="destructive"
      loading={pending}
      onClick={async () => {
        const ok = await confirm({
          title: `Arsipkan ${count} kontak @${domain}?`,
          description:
            "Semua kontak aktif di domain ini tidak akan dikirimi lagi dari workspace mana pun. Kontaknya tetap tersimpan dan bisa dikembalikan dari halaman Kontak.",
          confirmLabel: "Arsipkan",
          destructive: true,
        });
        if (!ok) return;
        start(async () => {
          const r = await archiveDomain(domain);
          if (r.ok) toast.success(`${r.count} kontak @${domain} diarsipkan`);
          else toast.error(r.error);
        });
      }}
    >
      <Archive className="h-3.5 w-3.5" />
      Arsipkan {count}
    </Button>
  );
}
