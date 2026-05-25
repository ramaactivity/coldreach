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
      const blob = await cropImageToBlob(imageSrc, croppedArea);
      // Always emit PNG so transparency from the source is preserved.
      const cropped = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", {
        type: "image/png",
      });
      onCrop({ blob, file: cropped });
      onClose();
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader title="Adjust logo" description="Drag, zoom, dan crop biar logo pas frame signature. Yang disimpan cuma hasil crop." />
        <DialogBody>
          {/* Crop canvas */}
          <div className="relative h-[340px] w-full overflow-hidden rounded-xl bg-zinc-900">
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
              <ZoomOut className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <input
                type="range"
                min={1}
                max={4}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-900 dark:bg-zinc-800 dark:accent-zinc-100"
                aria-label="Zoom"
              />
              <ZoomIn className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <span className="w-10 shrink-0 text-right text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                {zoom.toFixed(2)}×
              </span>
            </div>

            {/* Aspect ratio chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
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
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </DialogBody>
        <DialogFooter className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
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

/**
 * Run the actual pixel-level crop in a hidden canvas, returning a PNG Blob.
 * Browser-only — relies on Image() and HTMLCanvasElement.
 */
async function cropImageToBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    area.width,
    area.height,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode crop"))),
      "image/png",
      0.95,
    );
  });
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
