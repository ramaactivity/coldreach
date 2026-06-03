"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";

/**
 * Crop + zoom + aspect-ratio picker, modelled after the Instagram /
 * Facebook profile-picture flow. User selects a file (handled by the
 * parent), modal opens with the image, user adjusts, hits Apply →
 * onCrop receives the cropped Blob ready for upload. The original file
 * is discarded — only the cropped output gets persisted.
 */

type AspectOption = { label: string; value: number | undefined };
const ASPECT_OPTIONS: AspectOption[] = [
  { label: "Square 1:1", value: 1 },
  { label: "Landscape 16:9", value: 16 / 9 },
  { label: "Landscape 3:2", value: 3 / 2 },
  { label: "Bebas", value: undefined },
];

export function LogoCropModal({
  open,
  file,
  onClose,
  onCrop,
}: {
  open: boolean;
  /** The raw file the user picked. null when modal is closed. */
  file: File | null;
  onClose: () => void;
  /** Receives the cropped image as a PNG Blob plus a derived File for upload. */
  onCrop: (cropped: { blob: Blob; file: File }) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | undefined>(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [applying, setApplying] = useState(false);

  // Derive object URL straight from the file — pure read, no setState in
  // effect. Cleanup-only effect revokes on file change / unmount.
  const imageSrc = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    if (!imageSrc) return;
    return () => URL.revokeObjectURL(imageSrc);
  }, [imageSrc]);

  const onCropComplete = useCallback(
    (_: Area, areaPixels: Area) => setCroppedArea(areaPixels),
    [],
  );

  async function handleApply() {
    if (!imageSrc || !croppedArea || !file) return;
    setApplying(true);
    try {
      const { blob, mime } = await cropImageToBlob(imageSrc, croppedArea);
      // Filename gets the right extension so the server-side MIME validator
      // (which keys off the File type, not the name) and downstream cache
      // headers stay in sync.
      const ext = mime === "image/png" ? "png" : "jpg";
      const base = file.name.replace(/\.[^.]+$/, "");
      const cropped = new File([blob], `${base}.${ext}`, { type: mime });
      onCrop({ blob, file: cropped });
      onClose();
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader title="Adjust logo" description="Drag, zoom, dan crop biar logo pas frame signature. Hasil otomatis di-resize ke 800px & di-compress agar pas batas 512 KB tanpa lo perlu mikir." />
        <DialogBody>
          {/* Crop canvas */}
          <div className="relative h-[340px] w-full overflow-hidden rounded-xl bg-action">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                cropShape="rect"
                showGrid
                restrictPosition
                objectFit="contain"
              />
            )}
          </div>

          {/* Controls */}
          <div className="mt-4 space-y-3">
            {/* Zoom slider */}
            <div className="flex items-center gap-3">
              <ZoomOut className="h-3.5 w-3.5 shrink-0 text-muted" />
              <input
                type="range"
                min={1}
                max={4}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-hover accent-action"
                aria-label="Zoom"
              />
              <ZoomIn className="h-3.5 w-3.5 shrink-0 text-muted" />
              <span className="w-10 shrink-0 text-right text-[11px] font-mono text-muted">
                {zoom.toFixed(2)}×
              </span>
            </div>

            {/* Aspect ratio chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                <Maximize2 className="h-3 w-3" />
                Aspect
              </span>
              {ASPECT_OPTIONS.map((opt) => {
                const active = aspect === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setAspect(opt.value)}
                    className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-action bg-action text-on-action"
                        : "border-border bg-surface text-ink-secondary hover:border-border-strong hover:bg-surface-sunken"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </DialogBody>
        <DialogFooter className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            loading={applying}
            disabled={!imageSrc || !croppedArea || applying}
          >
            Apply &amp; Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Server cap is 512 KB; aim under 460 KB to leave headroom for HTTP overhead
// and let the bucket validator never reject. Logos display at most ~160 px
// in the signature, so 800 px on the longest side is ~5x retina headroom
// while keeping byte counts low.
const TARGET_MAX_BYTES = 460 * 1024;
const MAX_OUTPUT_DIMENSION = 800;
// Cascade through these qualities for JPEG until we land under TARGET.
const JPEG_QUALITY_LADDER = [0.92, 0.85, 0.78, 0.7];

/**
 * Crop the source down to the user-selected region, downscale to fit
 * MAX_OUTPUT_DIMENSION, then encode into the smallest blob possible:
 *
 *   - PNG first if the cropped region has any transparent pixels (lossless
 *     wins over JPEG for transparency).
 *   - PNG first when opaque too, but if PNG > TARGET we fall back to JPEG
 *     and walk the quality ladder until the blob fits.
 *
 * Returns the chosen blob + its MIME so the caller can name the file
 * correctly.
 */
async function cropImageToBlob(
  imageSrc: string,
  area: Area,
): Promise<{ blob: Blob; mime: "image/png" | "image/jpeg" }> {
  const image = await loadImage(imageSrc);

  // 1. Downscale: cap the longest output dimension at MAX_OUTPUT_DIMENSION
  //    while preserving the crop's aspect ratio. No upscaling.
  const longest = Math.max(area.width, area.height);
  const scale = longest > MAX_OUTPUT_DIMENSION ? MAX_OUTPUT_DIMENSION / longest : 1;
  const outW = Math.max(1, Math.round(area.width * scale));
  const outH = Math.max(1, Math.round(area.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  // Better resampling for the downscale.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, outW, outH);

  // 2. Detect transparency so we never accidentally JPEG-ify a logo that
  //    needs an alpha channel.
  const hasAlpha = canvasHasTransparency(ctx, outW, outH);

  // 3. Try PNG first.
  const png = await canvasToBlob(canvas, "image/png", 1);
  if (png && png.size <= TARGET_MAX_BYTES) {
    return { blob: png, mime: "image/png" };
  }

  // 4. PNG too big. If the image has alpha we can't drop to JPEG without
  //    losing transparency — return the PNG anyway and let the user know
  //    via the server-side limit (very rare with 800px logos).
  if (hasAlpha) {
    if (!png) throw new Error("PNG encoding failed");
    return { blob: png, mime: "image/png" };
  }

  // 5. Opaque + too big → JPEG cascade.
  for (const q of JPEG_QUALITY_LADDER) {
    const jpg = await canvasToBlob(canvas, "image/jpeg", q);
    if (jpg && jpg.size <= TARGET_MAX_BYTES) {
      return { blob: jpg, mime: "image/jpeg" };
    }
  }

  // 6. Last resort: return the lowest-quality JPEG we produced even if
  //    over budget. Upload will fail with a clear error, beats silently
  //    returning nothing.
  const fallback = await canvasToBlob(canvas, "image/jpeg", 0.6);
  if (!fallback) throw new Error("JPEG encoding failed");
  return { blob: fallback, mime: "image/jpeg" };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: "image/png" | "image/jpeg",
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

/** Sample every Nth pixel's alpha channel — cheap enough at canvas sizes
 *  under ~1MP, accurate enough for "did the user crop into a transparent
 *  region" since transparent areas are usually contiguous. */
function canvasHasTransparency(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): boolean {
  const { data } = ctx.getImageData(0, 0, w, h);
  // Step over 16-pixel chunks (~6% of pixels sampled) for speed.
  const step = 64;
  for (let i = 3; i < data.length; i += step) {
    if (data[i] < 255) return true;
  }
  return false;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}
