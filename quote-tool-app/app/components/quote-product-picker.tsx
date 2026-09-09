"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Cable,
  ExternalLink,
  Package,
  Plus,
  RadioTower,
  Router,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  quoteLibraryProducts,
  validateProductSelection,
  type LibraryProduct,
  type ProductSelection,
} from "@/app/lib/quote-product-library";
import { QuoteExperienceDialog } from "./quote-experience-dialog";

export function QuoteProductPicker({
  currency,
  needsCost,
  onAdd,
  onClose,
}: {
  currency: string;
  needsCost: boolean;
  onAdd: (selection: ProductSelection) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<"catalog" | "starlink_oem">(
    "starlink_oem",
  );
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("All terminals");
  const [selected, setSelected] = useState<LibraryProduct | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [optional, setOptional] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const money = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      amount,
    );
  const families = useMemo(
    () => [
      ...new Set(
        quoteLibraryProducts
          .filter((item) => item.source === source)
          .map((item) => item.family),
      ),
    ],
    [source],
  );
  const results = quoteLibraryProducts.filter(
    (item) =>
      item.source === source &&
      (family === "All terminals" || item.family === family) &&
      `${item.label} ${item.category} ${item.family} ${item.partNumber ?? ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const choose = (product: LibraryProduct) => {
    const startingPrice =
      product.configuredPrice ?? product.onlineReferencePrice?.amount;
    setSelected(product);
    setQuantity("1");
    setPrice(
      currency === "USD" && startingPrice != null ? String(startingPrice) : "",
    );
    setCost("");
    setPartNumber(product.partNumber ?? "");
    setOptional(false);
    setError(null);
  };
  return (
    <QuoteExperienceDialog title="Product library" onClose={onClose}>
      <div className="qx-library" data-detail={Boolean(selected)}>
        <div className="qx-library-browser">
          <div className="qx-tabs" aria-label="Product source">
            {(["starlink_oem", "catalog"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={source === value}
                onClick={() => {
                  setSource(value);
                  setFamily("All terminals");
                  setSelected(null);
                }}
              >
                {value === "starlink_oem" ? (
                  <ShieldCheck size={16} />
                ) : (
                  <Package size={16} />
                )}
                {value === "starlink_oem" ? "Starlink OEM" : "Existing catalog"}
              </button>
            ))}
          </div>
          <div className="qx-filters">
            <label className="qx-search">
              <Search size={17} />
              <input
                autoFocus
                aria-label="Search products"
                placeholder="Search products"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="Terminal family"
              value={family}
              onChange={(e) => setFamily(e.target.value)}
            >
              <option>All terminals</option>
              {families.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
          <div className="qx-result-count" role="status">
            {results.length} product{results.length === 1 ? "" : "s"}
            {source === "starlink_oem"
              ? " / OEM accessories"
              : " / Existing configured prices"}
          </div>
          <div className="qx-products">
            {results.map((product) => {
              const Icon =
                product.category === "Cable"
                  ? Cable
                  : product.category === "Networking"
                    ? Router
                    : product.category === "Mount"
                      ? RadioTower
                      : Package;
              return (
                <button
                  type="button"
                  className="qx-product"
                  key={product.id}
                  aria-pressed={selected?.id === product.id}
                  onClick={() => choose(product)}
                >
                  <span className="qx-product-visual">
                    {product.thumbnailUrl || product.imageUrl ? (
                      <img
                        src={product.thumbnailUrl || product.imageUrl}
                        alt=""
                        width={48}
                        height={48}
                        loading="lazy"
                      />
                    ) : (
                      <Icon size={24} strokeWidth={1.5} />
                    )}
                  </span>
                  <span className="qx-product-copy">
                    <small>
                      {product.family} / {product.category}
                    </small>
                    <strong>{product.label}</strong>
                    <span>
                      {currency === "USD" && product.configuredPrice != null
                        ? money(product.configuredPrice)
                        : currency === "USD" && product.onlineReferencePrice
                          ? `${money(product.onlineReferencePrice.amount)} reference`
                          : "Price required"}
                    </span>
                  </span>
                  <Plus size={16} />
                </button>
              );
            })}
            {!results.length && (
              <div className="qx-empty">
                <Search size={28} />
                <p>No products match.</p>
                <button
                  type="button"
                  className="qx-button"
                  onClick={() => {
                    setSearch("");
                    setFamily("All terminals");
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="qx-product-detail">
          {!selected ? (
            <div className="qx-empty">
              <Package size={36} strokeWidth={1.25} />
              <p>No product selected</p>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const validation = validateProductSelection({
                  product: selected,
                  quantity,
                  unitPrice: price,
                  unitCost: cost,
                  partNumber,
                  needsCost,
                });
                setError(validation);
                if (validation) return;
                try {
                  onAdd({
                    product: selected,
                    quantity: Number(quantity),
                    unitPrice: Number(price),
                    unitCost: needsCost ? Number(cost) : undefined,
                    partNumber,
                    optional,
                  });
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Could not add product.",
                  );
                }
              }}
            >
              <div className="qx-detail-content">
                <button
                  className="qx-button qx-mobile-back"
                  type="button"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft size={16} />
                  Products
                </button>
                <span className="qx-kicker">
                  {selected.source === "starlink_oem"
                    ? "Starlink OEM"
                    : "Quote catalog"}
                </span>
                <h3>{selected.label}</h3>
                <p>{selected.family}</p>
                {selected.thumbnailUrl && (
                  <img
                    className="qx-detail-image"
                    src={selected.thumbnailUrl}
                    alt={selected.label}
                  />
                )}
                {selected.description && <p>{selected.description}</p>}
                {selected.referenceUrl && (
                  <a
                    className="qx-reference"
                    href={selected.referenceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Starlink accessory guide
                    <ExternalLink size={14} />
                  </a>
                )}
                <div className="qx-form-fields">
                  {selected.source === "starlink_oem" && (
                    <div className="qx-price-status">
                      {selected.onlineReferencePrice ? (
                        <>
                          Online reference: $
                          {selected.onlineReferencePrice.amount.toFixed(2)} USD
                          <br />
                          Checked {selected.onlineReferencePrice.checkedAt}.
                          Starlink-direct price unconfirmed. Tax and shipping
                          excluded.
                        </>
                      ) : (
                        "Starlink-direct price unconfirmed."
                      )}
                    </div>
                  )}
                  <label>
                    Part number
                    {selected.source === "starlink_oem"
                      ? " (confirmed OEM)"
                      : ""}
                    <input
                      value={partNumber}
                      onChange={(e) => setPartNumber(e.target.value)}
                    />
                  </label>
                  <label>
                    Quantity
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </label>
                  <label>
                    Selling price / unit ({currency})
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Price required"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </label>
                  {needsCost && (
                    <label>
                      Our cost / unit ({currency})
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Cost required"
                        value={cost}
                        onChange={(e) => setCost(e.target.value)}
                      />
                    </label>
                  )}
                  <label className="qx-checkbox">
                    <input
                      type="checkbox"
                      checked={optional}
                      onChange={(e) => setOptional(e.target.checked)}
                    />
                    Optional item
                  </label>
                </div>
              </div>
              <footer className="qx-detail-footer">
                <div className="qx-selection-total">
                  <span>Line total</span>
                  <strong>
                    {price.trim() &&
                    quantity.trim() &&
                    Number.isFinite(Number(price) * Number(quantity)) &&
                    Number(price) > 0 &&
                    Number(quantity) > 0
                      ? money(Number(price) * Number(quantity))
                      : "Not priced"}
                  </strong>
                </div>
                {error && (
                  <p className="qx-error" role="alert">
                    {error}
                  </p>
                )}
                <button type="submit" className="qx-button qx-primary">
                  <Plus size={16} />
                  Add to quote
                </button>
              </footer>
            </form>
          )}
        </div>
      </div>
    </QuoteExperienceDialog>
  );
}
