"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { shrinkImage } from "@/lib/client/image";
import { useSession } from "@/lib/client/session";
import { formatFiat } from "@/lib/currencies";
import type { ProductView } from "@/lib/products";
import { CurrencySelect } from "./CurrencySelect";
import { ProductImage } from "./ProductImage";
import { Alert, Button, Card, Checkbox, Field, Input, Textarea } from "./ui";

// The picture as it will be after saving: unchanged, a new one (data URL), or removed.
type Picture = { k: "keep" } | { k: "new"; dataUrl: string } | { k: "remove" };

/** Add a product (no `product`) or edit one. Saves, then goes back to the list. */
export function ProductForm({ product }: { product?: ProductView }) {
  const router = useRouter();
  const { merchant } = useSession();
  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(product ? String(Number(product.price)) : "");
  const [currency, setCurrency] = useState(product?.currency ?? merchant?.displayCurrency ?? "USD");
  const [description, setDescription] = useState(product?.description ?? "");
  const [active, setActive] = useState(product?.active ?? true);
  const [picture, setPicture] = useState<Picture>({ k: "keep" });
  const [busy, setBusy] = useState<"save" | "delete" | "picture" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = picture.k === "new" ? picture.dataUrl : picture.k === "remove" ? null : (product?.imageUrl ?? null);
  const priceValue = Number(price);
  const valid = name.trim() !== "" && price.trim() !== "" && priceValue > 0;

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy("picture");
    try {
      setPicture({ k: "new", dataUrl: await shrinkImage(file) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const body = { name: name.trim(), price: priceValue, currency, description: description.trim(), active };
      const { product: saved } = product
        ? await api<{ product: ProductView }>(`/api/products/${product.id}`, { method: "PATCH", body })
        : await api<{ product: ProductView }>("/api/products", { body });
      if (picture.k === "new") await api(`/api/products/${saved.id}/image`, { method: "PUT", body: { dataUrl: picture.dataUrl } });
      if (picture.k === "remove" && product?.imageUrl) await api(`/api/products/${saved.id}/image`, { method: "DELETE" });
      router.push("/board/products");
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function remove() {
    if (!product) return;
    setBusy("delete");
    setError(null);
    try {
      await api(`/api/products/${product.id}`, { method: "DELETE" });
      router.push("/board/products");
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) void save();
      }}
    >
      <Card className="space-y-4">
        <div className="flex items-center gap-4">
          <ProductImage src={shown} alt={name ? `Picture of ${name}` : "Product picture"} className="w-28" />
          <div className="min-w-0 flex-1 space-y-2">
            <label className="flex min-h-11 cursor-pointer items-center justify-center border border-ink px-3 text-sm font-semibold transition-colors hover:bg-subtle has-focus-visible:outline-2 has-focus-visible:outline-ink">
              {busy === "picture" ? "Preparing…" : shown ? "Change picture" : "Add a picture"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  void pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {shown && (
              <Button variant="ghost" size="sm" block onClick={() => setPicture({ k: "remove" })}>
                Remove picture
              </Button>
            )}
            <p className="text-xs text-muted">Square pictures look best. It&apos;s shrunk before upload.</p>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <Field label="Name" htmlFor="product-name">
          <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Logo pack" maxLength={80} required />
        </Field>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field label="Price" htmlFor="product-price">
            <Input
              id="product-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
              className="font-bold tabular-nums"
              required
            />
          </Field>
          <div className="w-36">
            <CurrencySelect value={currency} onChange={setCurrency} />
          </div>
        </div>
        {valid && (
          <p className="-mt-2 text-xs text-muted">Buyers pay {formatFiat(priceValue, currency)} in NIM or USDT at the live rate.</p>
        )}
        <Field label="Description" htmlFor="product-description" optional>
          <Textarea
            id="product-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="3 logo concepts, 2 rounds of changes, all source files."
            maxLength={500}
          />
        </Field>
        <Checkbox
          label="Show on my board"
          description="Turn it off to hide the product without deleting it."
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
      </Card>

      {error && <Alert kind="error">{error}</Alert>}
      <Button type="submit" size="lg" block loading={busy === "save"} disabled={!valid || (!!busy && busy !== "save")}>
        {product ? "Save changes" : "Add product"}
      </Button>

      {product &&
        (confirmDelete ? (
          <Card tone="strong" padding="sm" className="space-y-3">
            <p className="text-sm">
              Delete <span className="font-semibold">{product.name}</span> for good? Invoices already paid for it keep their details.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button variant="danger" loading={busy === "delete"} onClick={remove}>
                Delete
              </Button>
            </div>
          </Card>
        ) : (
          <Button variant="danger" block onClick={() => setConfirmDelete(true)} disabled={!!busy}>
            Delete product
          </Button>
        ))}
    </form>
  );
}
