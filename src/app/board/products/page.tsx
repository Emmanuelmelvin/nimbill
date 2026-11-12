"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BoardPage } from "@/components/BoardPage";
import { ProductImage } from "@/components/ProductImage";
import { Alert, Badge, Card, EmptyState, LinkButton, Loader } from "@/components/ui";
import { api } from "@/lib/client/api";
import { formatFiat } from "@/lib/currencies";
import type { ProductView } from "@/lib/products";
import { MAX_PRODUCTS } from "@/lib/schemas";

export default function Products() {
  return (
    <BoardPage title="Products" description="What you sell on your board. Buyers get a ready-made invoice.">
      <ProductList />
    </BoardPage>
  );
}

function ProductList() {
  const [products, setProducts] = useState<(ProductView & { sold: number })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ products: (ProductView & { sold: number })[] }>("/api/products")
      .then((r) => setProducts(r.products))
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!products) return <Loader compact />;
  if (products.length === 0) {
    return (
      <EmptyState
        title="Add your first product"
        description="A name, a price and a picture. Visitors to your board can buy it in a few taps."
        action={
          <LinkButton href="/board/products/new" size="sm">
            + Add product
          </LinkButton>
        }
      />
    );
  }

  const live = products.filter((p) => p.active).length;
  return (
    <div className="space-y-4">
      <p className="font-mono text-[11px] tracking-wider text-muted uppercase">
        {live} on your board{products.length > live && ` · ${products.length - live} hidden`}
      </p>
      <Card as="div" padding="none">
        <ul className="divide-y divide-line">
          {products.map((p) => (
            <li key={p.id}>
              <Link href={`/board/products/${p.id}`} className="flex items-center gap-3 p-3 transition-colors hover:bg-subtle">
                <ProductImage src={p.imageUrl} alt="" className="w-14" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="font-mono text-sm tabular-nums">
                    {formatFiat(p.price, p.currency)}
                    {p.sold > 0 && <span className="text-muted"> · {p.sold} sold</span>}
                  </p>
                </div>
                {!p.active && <Badge variant="muted">Hidden</Badge>}
                <span aria-hidden className="font-mono text-muted">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      {products.length < MAX_PRODUCTS ? (
        <LinkButton href="/board/products/new" size="lg" block>
          + Add product
        </LinkButton>
      ) : (
        <p className="text-center text-sm text-muted">You&apos;ve reached {MAX_PRODUCTS} products. Delete one to add another.</p>
      )}
    </div>
  );
}
