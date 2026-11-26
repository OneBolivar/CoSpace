import type { PricingModel as PrismaPricingModel } from "@prisma/client";

export type PricingModel = PrismaPricingModel;

export interface Space {
  id: string;
  name: string;
  description: string;
  type: string;
  capacity: number;
  pricingModel: PricingModel;
  pricePerHour: number;
  pricePerPerson: number | null;
  imageUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SpaceFilters {
  type: string;
  minCapacity: string;
  maxPrice: string;
}