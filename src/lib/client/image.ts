"use client";
import { AppError } from "@/lib/errors";
import { IMAGE_MAX_SIDE, MAX_IMAGE_BYTES } from "@/lib/schemas";

const bytesOf = (dataUrl: string) => Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

/**
 * Turn a picture the person picked into a small JPEG data URL: at most `maxSide` pixels on its
 * longest side and under MAX_IMAGE_BYTES, so it uploads fast and fits the database.
 * `square` crops it to the centre square first (for avatars). Transparent areas become white.
 */
export async function shrinkImage(file: File, { maxSide = IMAGE_MAX_SIDE, square = false } = {}): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AppError("VALIDATION", "Couldn't read that picture. Try a JPEG or PNG.");
  }
  // The part of the picture to keep: all of it, or the biggest centred square.
  const side = Math.min(bitmap.width, bitmap.height);
  const src = square
    ? { x: (bitmap.width - side) / 2, y: (bitmap.height - side) / 2, w: side, h: side }
    : { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
  const scale = Math.min(1, maxSide / Math.max(src.w, src.h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(src.w * scale));
  canvas.height = Math.max(1, Math.round(src.h * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, src.x, src.y, src.w, src.h, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // Lower the quality step by step until it fits.
  for (const quality of [0.85, 0.75, 0.65, 0.5]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (bytesOf(url) <= MAX_IMAGE_BYTES) return url;
  }
  throw new AppError("VALIDATION", "That picture is too detailed to upload. Try a simpler one.");
}
