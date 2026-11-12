"use client";
import { AppError } from "@/lib/errors";
import { IMAGE_MAX_SIDE, MAX_IMAGE_BYTES } from "@/lib/schemas";

const bytesOf = (dataUrl: string) => Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

/**
 * Turn a picture the person picked into a small JPEG data URL: at most IMAGE_MAX_SIDE pixels on
 * its longest side and under MAX_IMAGE_BYTES, so it uploads fast and fits the database.
 * Transparent areas become white.
 */
export async function shrinkImage(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AppError("VALIDATION", "Couldn't read that picture. Try a JPEG or PNG.");
  }
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // Lower the quality step by step until it fits.
  for (const quality of [0.85, 0.75, 0.65, 0.5]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (bytesOf(url) <= MAX_IMAGE_BYTES) return url;
  }
  throw new AppError("VALIDATION", "That picture is too detailed to upload. Try a simpler one.");
}
