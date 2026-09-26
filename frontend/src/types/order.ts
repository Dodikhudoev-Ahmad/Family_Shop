export type DeliveryMethod = 'courier' | 'pickup';

export interface DeliveryDetails {
  phone: string;
  address: string;
  method: DeliveryMethod;
}
