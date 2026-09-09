export type DeliveryMethod = 'courier' | 'pickup';

export interface DeliveryDetails {
  fullName: string;
  phone: string;
  city: string;
  address: string;
  method: DeliveryMethod;
}
