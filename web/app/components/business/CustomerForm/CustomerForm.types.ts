export type CustomerFormCustomer = {
  id: string;
  name: string;
  type: string;
  email: string;
  phone: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  countryCode?: string | null;
  contactName?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

export type CustomerFormValues = {
  name: string;
  type: string;
  email: string;
  phone: string;
  address: string;
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