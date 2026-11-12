"use client";
import { useState } from "react";
import { api, type MerchantInfo } from "@/lib/client/api";
import { shrinkImage } from "@/lib/client/image";
import { useSession } from "@/lib/client/session";
import { avatarUrl } from "@/lib/tags";
import { Avatar } from "./Avatar";
import { Alert, Button, Card } from "./ui";

/** Add, change or remove the public photo. Saves straight away (no separate Save button). */
export function AvatarField({ merchant }: { merchant: MerchantInfo }) {
  const { setMerchant } = useSession();
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const src = merchant.tag && merchant.avatarVersion ? avatarUrl(merchant.tag, merchant.avatarVersion) : null;

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy("upload");
    setError(null);
    try {
      // Cropped to the middle square and shrunk, so it's small and looks the same everywhere.
      const dataUrl = await shrinkImage(file, { maxSide: 400, square: true });
      const r = await api<{ merchant: MerchantInfo }>("/api/me/avatar", { method: "PUT", body: { dataUrl } });
      setMerchant(r.merchant);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    setError(null);
    try {
      const r = await api<{ merchant: MerchantInfo }>("/api/me/avatar", { method: "DELETE" });
      setMerchant(r.merchant);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-4">
        <Avatar src={src} name={merchant.name || "You"} className="w-20 text-5xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold">
            Photo <span className="font-normal text-muted">(optional)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-10 cursor-pointer items-center border border-ink bg-ink px-3 text-sm font-semibold text-paper transition-colors hover:bg-ink-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink">
              {busy === "upload" ? "Uploading…" : src ? "Change photo" : "Add a photo"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={!!busy}
                onChange={(e) => {
                  void upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {src && (
              <Button variant="secondary" size="sm" className="min-h-10" loading={busy === "remove"} disabled={!!busy} onClick={remove}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted">
        Shown on your public page and to people sending you money, so they know it&apos;s you. Anyone with your link can see it.
      </p>
      {error && <Alert kind="error">{error}</Alert>}
    </Card>
  );
}
