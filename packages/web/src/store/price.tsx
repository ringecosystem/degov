import { create } from "zustand";

export interface PriceState {
  priceIds: string[];
  prices: Record<string, number>;
  setPriceIds: (ids: string[]) => void;
  setPrices: (prices: Record<string, number>) => void;
}

export const usePriceStore = create<PriceState>()((set) => ({
  priceIds: [],
  prices: {},
  setPriceIds: (ids) => {
    set({ priceIds: ids });
  },
  setPrices: (prices) => {
    set({ prices });
  },
}));
