"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ProductForm } from "@/components/ProductForm";
import { ProductScreen } from "@/components/ProductScreen";
import { Alert, Loader } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { ProductView } from "@/lib/products";

export default function EditProduct() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<ProductView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ product: ProductView }>(`/api/products/${id}`)
      .then((r) => setProduct(r.product))
      .catch((e) => setError((e as Error).message));
  }, [id]);
  return (
    <ProductScreen title="Edit product">
      {error ? <Alert kind="error">{error}</Alert> : product ? <ProductForm product={product} /> : <Loader compact />}
    </ProductScreen>
  );
}
