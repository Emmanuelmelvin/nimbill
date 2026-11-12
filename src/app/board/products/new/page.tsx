"use client";
import { ProductForm } from "@/components/ProductForm";
import { ProductScreen } from "@/components/ProductScreen";

export default function NewProduct() {
  return (
    <ProductScreen title="Add a product">
      <ProductForm />
    </ProductScreen>
  );
}
