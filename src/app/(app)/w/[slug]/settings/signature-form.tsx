"use client";

import {
  useActionState,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Upload,
  Trash2,
  Plus,
  X,
  Image as ImageIcon,
  Loader2,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import {
  type SignatureData,
  type SignatureSocial,
  type SocialPlatform,
  SOCIAL_OPTIONS,
  renderSignatureHtml,
  socialMeta,
  isSignatureEmpty,
} from "@/lib/signature";
import {
  updateWorkspaceSignature,
  uploadWorkspaceLogo,
  removeWorkspaceLogo,
  type FormState,
} from "./actions";

const INITIAL: FormState = {};

const PRESETS: { label: string; data: SignatureData }[] = [
  {
    label: "Tiska Catering",
    data: {
      name: "Muhamad Ramadan Saputra",
      title: "Sales Manager",
      company: "Tiska Catering Bogor",
      email: "workwithrama98@gmail.com",
      phone: "+62 812-XXXX-XXXX",
      whatsapp: "628120000000",
      website: "tiskacatering.com",
      socials: [
        { platform: "instagram", url: "https://instagram.com/tiskacatering", label: "@tiskacatering" },
      ],
    },
  },
  {
    label: "Tetra Photobooth",
    data: {
      name: "Tetra Photobooth Team",
      title: "Studio",
      company: "Tetra Photobooth",
      email: "workwithrama98@gmail.com",
      whatsapp: "628120000000",
      socials: [
        { platform: "instagram", url: "https://instagram.com/tetraphotobooth", label: "@tetraphotobooth" },
      ],
    },
  },
  {
    label: "Visual Tetra",
    data: {
      name: "Visual Tetra",
      title: "Design Studio",
      email: "workwithrama98@gmail.com",
      socials: [
        { platform: "instagram", url: "https://instagram.com/visualtetra", label: "@visualtetra" },
      ],
    },
  },
];

export function SignatureForm({
  slug,
  initial,
  workspaceColorTheme,
}: {
  slug: string;
  initial: { signature_data: SignatureData | null };
  workspaceColorTheme: string;
}) {
  const [state, action, saving] = useActionState(
    updateWorkspaceSignature.bind(null, slug),
    INITIAL,
  );

  const [data, setData] = useState<SignatureData>(initial.signature_data ?? {});
  const [uploadPending, startUpload] = useTransition();
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveBrandColor = data.brand_color || workspaceColorTheme;

  // The preview HTML is rendered by the same code that runs at send time —
  // ensures editor and inbox stay byte-equivalent.
  const previewHtml = useMemo(
    () =>
      renderSignatureHtml(data, { fallbackBrandColor: workspaceColorTheme }),
    [data, workspaceColorTheme],
  );

  function setField<K extends keyof SignatureData>(key: K, value: SignatureData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(p: typeof PRESETS[number]) {
    setData(p.data);
  }

  function clearAll() {
    setData({});
  }

  function addSocial() {
    const next: SignatureSocial = { platform: "instagram", url: "", label: "" };
    setData((prev) => ({ ...prev, socials: [...(prev.socials ?? []), next] }));
  }

  function updateSocial(i: number, patch: Partial<SignatureSocial>) {
    setData((prev) => {
      const socials = [...(prev.socials ?? [])];
      socials[i] = { ...socials[i], ...patch };
      return { ...prev, socials };
    });
  }

  function removeSocial(i: number) {
    setData((prev) => {
      const socials = [...(prev.socials ?? [])];
      socials.splice(i, 1);
      return { ...prev, socials };
    });
  }

  function moveSocial(i: number, dir: -1 | 1) {
    setData((prev) => {
      const socials = [...(prev.socials ?? [])];
      const j = i + dir;
      if (j < 0 || j >= socials.length) return prev;
      [socials[i], socials[j]] = [socials[j], socials[i]];
      return { ...prev, socials };
    });
  }

  function handleLogoFile(file: File) {
    setLogoError(null);
    const fd = new FormData();
    fd.append("file", file);
    startUpload(async () => {
      const res = await uploadWorkspaceLogo(slug, fd);
      if (!res.ok) {
        setLogoError(res.error);
        return;
      }
      setField("logo_url", res.url);
    });
  }

  function handleRemoveLogo() {
    setLogoError(null);
    startUpload(async () => {
      await removeWorkspaceLogo(slug);
      setField("logo_url", undefined);
    });
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Default Signature
        </h3>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Otomatis di-append ke setiap email. Sistem render dua versi —
          HTML (untuk preview cantik di Gmail) + plain text (untuk client
          yang block HTML).
        </p>
      </div>

      <form action={action} className="p-5">
        {/* JSON payload — keeps socials array intact through FormData */}
        <input type="hidden" name="payload" value={JSON.stringify(data)} />

        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(280px,360px)]">
          {/* LEFT: structured editor */}
          <div className="space-y-5">
            {/* Logo upload */}
            <div>
              <FieldLabel htmlFor="logo-file" hint="PNG / JPG / WebP · max 512KB">
                Logo
              </FieldLabel>
              <div className="flex items-start gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                  {data.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.logo_url}
                      alt="Logo"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-zinc-400" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploadPending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {data.logo_url ? "Replace" : "Upload"}
                  </Button>
                  {data.logo_url && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={uploadPending}
                      onClick={handleRemoveLogo}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <input
                ref={fileInputRef}
                id="logo-file"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoFile(f);
                  e.target.value = ""; // allow re-selecting same file
                }}
              />
              {logoError && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                  {logoError}
                </p>
              )}
            </div>

            {/* Identity */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Nama"
                placeholder="Muhamad Ramadan Saputra"
                value={data.name ?? ""}
                onChange={(v) => setField("name", v)}
              />
              <Field
                label="Title"
                placeholder="Sales Manager"
                value={data.title ?? ""}
                onChange={(v) => setField("title", v)}
              />
              <Field
                label="Company"
                placeholder="Tiska Catering Bogor"
                value={data.company ?? ""}
                onChange={(v) => setField("company", v)}
              />
              <Field
                label="Website"
                placeholder="tiskacatering.com"
                value={data.website ?? ""}
                onChange={(v) => setField("website", v)}
              />
            </div>

            {/* Contact */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Email"
                type="email"
                placeholder="rama@tiska.com"
                value={data.email ?? ""}
                onChange={(v) => setField("email", v)}
              />
              <Field
                label="Phone"
                placeholder="+62 812 0000 0000"
                value={data.phone ?? ""}
                onChange={(v) => setField("phone", v)}
              />
              <Field
                label="WhatsApp"
                hint="Angka saja (with country code)"
                placeholder="628120000000"
                value={data.whatsapp ?? ""}
                onChange={(v) => setField("whatsapp", v.replace(/[^0-9]/g, ""))}
              />
              <ColorField
                label="Brand color"
                value={data.brand_color}
                fallback={workspaceColorTheme}
                onChange={(v) => setField("brand_color", v)}
              />
            </div>

            {/* Socials */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <FieldLabel hint={`${(data.socials ?? []).length}/10 ditambahkan`}>
                  Sosial media
                </FieldLabel>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addSocial}
                  disabled={(data.socials ?? []).length >= 10}
                >
                  <Plus className="h-3.5 w-3.5" /> Tambah
                </Button>
              </div>
              {(data.socials ?? []).length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  Belum ada sosial media. Klik &ldquo;Tambah&rdquo; untuk
                  Instagram / LinkedIn / dll.
                </p>
              ) : (
                <ul className="space-y-2">
                  {(data.socials ?? []).map((s, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => moveSocial(i, -1)}
                          disabled={i === 0}
                          className="h-4 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <GripVertical className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="w-32">
                        <Select
                          value={s.platform}
                          onValueChange={(v) =>
                            updateSocial(i, { platform: v as SocialPlatform })
                          }
                          size="sm"
                        >
                          {SOCIAL_OPTIONS.map((opt) => (
                            <SelectItem
                              key={opt.value}
                              value={opt.value}
                              dotColor={opt.color}
                            >
                              {opt.label}
                            </SelectItem>
                          ))}
                        </Select>
                      </div>
                      <Input
                        placeholder="https://instagram.com/handle"
                        value={s.url}
                        onChange={(e) => updateSocial(i, { url: e.target.value })}
                        className="h-8 text-xs"
                      />
                      <Input
                        placeholder="@label (opsional)"
                        value={s.label ?? ""}
                        onChange={(e) =>
                          updateSocial(i, { label: e.target.value })
                        }
                        className="hidden h-8 w-36 text-xs sm:block"
                      />
                      <button
                        type="button"
                        onClick={() => removeSocial(i)}
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                        aria-label="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* RIGHT: live preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Live preview
              </p>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                muncul setelah body email
              </span>
            </div>
            <div
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              style={{
                ["--accent" as string]: effectiveBrandColor,
              }}
            >
              <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
                [body email…]
              </p>
              {isSignatureEmpty(data) ? (
                <p className="italic text-xs text-zinc-400 dark:text-zinc-500">
                  Isi field di kiri untuk lihat preview.
                </p>
              ) : (
                <div
                  // The renderer output is already sanitized (esc all user
                  // strings) — safe for preview.
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </div>

            {/* Preset chips */}
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/40 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Quick start
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="inline-flex h-7 items-center rounded-full border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    {p.label}
                  </button>
                ))}
                {!isSignatureEmpty(data) && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Status + save */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="min-w-0 text-xs">
            {state.error && (
              <span className="text-red-600 dark:text-red-400">{state.error}</span>
            )}
            {state.fieldErrors && Object.keys(state.fieldErrors).length > 0 && (
              <span className="text-red-600 dark:text-red-400">
                {Object.entries(state.fieldErrors)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </span>
            )}
            {state.success && (
              <span className="text-emerald-600 dark:text-emerald-400">
                ✓ Tersimpan — email berikutnya pakai signature ini
              </span>
            )}
          </div>
          <Button type="submit" loading={saving} disabled={saving} size="sm">
            Save Signature
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
}) {
  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value?: string;
  fallback: string;
  onChange: (v: string | undefined) => void;
}) {
  const effective = value || fallback;
  const usingFallback = !value;
  return (
    <div>
      <FieldLabel hint={usingFallback ? "pakai warna workspace" : "kustom"}>
        {label}
      </FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={effective}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-lg border border-zinc-200/80 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900"
        />
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder={fallback}
          className="font-mono text-xs"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
            aria-label="Reset"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// Re-export for callers that need the meta lookup elsewhere.
export { socialMeta };
