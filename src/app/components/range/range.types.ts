export type RangeProps = {
  priceRange: number[];
  setPriceRange: (value: number[]) => void;
  max: number;
  min: number;
  step: number;
};
