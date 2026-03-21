export interface ShippingAddress {
  name: string;
  phone?: string;
  email?: string;
  street: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface PackageDimensions {
  weightLbs?: number;
  weightOz?: number;
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
}

export interface ShippingRate {
  rateId: string;
  carrier: string;
  service: string;
  estimatedDays: number;
  amount: number; // cents
  currency: string;
}

export interface ShippingLabel {
  labelUrl: string;
  trackingNumber: string;
  trackingUrl: string;
  carrier: string;
  externalTransactionId: string;
}

export interface CreateShipmentParams {
  from: ShippingAddress;
  to: ShippingAddress;
  parcel: PackageDimensions;
  declaredValue?: number; // cents — for insurance
  requireSignature?: boolean;
  isFragile?: boolean;
}

export interface TrackingEvent {
  status: string;
  description: string;
  location?: string;
  timestamp: string;
}

export interface TrackingInfo {
  trackingNumber: string;
  carrier: string;
  status: string;
  estimatedDelivery?: string;
  events: TrackingEvent[];
}
