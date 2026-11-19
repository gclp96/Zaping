export interface SupplierOption {
    id: string;
    name: string;
    email?: string | null;
    contactName?: string | null;
}

export interface SupplierSelectorProps {
    options: SupplierOption[];
    value: string;
    onChange: (supplierId: string) => void;
    label?: string;
    name?: string;
    placeholder?: string;
    loading?: boolean;
    disabled?: boolean;
    required?: boolean;
    error?: string;
    helperText?: string;
    searchable?: boolean;
}