export type ProductPriceMode =
  | 'cost'
  | 'price'
  | 'none';

export type ProductStockFilter =
  | 'all'
  | 'in-stock'
  | 'low-stock'
  | 'out-of-stock';

export interface ProductOption {
  id: string;
  sku: string;
  name: string;

  barcode?: string | null;
  brand?: string | null;

  category?: {
    id: string;
    name: string;
  } | null;

  cost: number;
  price: number;

  stock: number;
  minStock: number;

  isActive?: boolean;
}

export interface ProductSelectorProps {
  options: ProductOption[];

  value: string;
  onChange: (productId: string) => void;

  excludedProductIds?: string[];

  priceMode?: ProductPriceMode;

  label?: string;
  name?: string;
  placeholder?: string;

  loading?: boolean;
  disabled?: boolean;
  required?: boolean;

  error?: string;
  helperText?: string;

  enableStockFilter?: boolean;
  collapseSearchOnSelection?: boolean;
}