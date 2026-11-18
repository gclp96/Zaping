export type CustomerFormCustomer = {
  id: string;
  name: string;
  legalName?: string | null;
  type: string;
  email: string | null;
  phone: string | null;
  address?: string | null;
  postalCode?: string | null;
  neighborhood?: string | null;
  municipality?: string | null;
  city?: string | null;
  state?: string | null;
  countryCode?: string | null;
  contactName?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

export type CustomerFormValues = {
  name: string;
  legalName: string;
  type: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  neighborhood: string;
  municipality: string;
  city: string;
  state: string;
  countryCode: string;
  contactName: string;
  notes: string;
};

export type CustomerFormModalProps = {
  isOpen: boolean;

  customer?: CustomerFormCustomer | null;

  onClose: () => void;

  onSaved: (
    customer: CustomerFormCustomer,
  ) => void | Promise<void>;
};