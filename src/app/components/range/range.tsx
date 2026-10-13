import { Input } from '@/components/ui/input';

import { Slider } from '@/components/ui/slider';
import { RangeProps } from './range.types';
import { FilterLayout } from '../layout/filter-layout';

export function Range({ priceRange, setPriceRange, max, min, step = 1 }: RangeProps) {
  return (
    <FilterLayout title="Price Range">
      <Slider
        value={priceRange}
        max={max}
        min={min}
        step={step}
        className="my-4"
        onValueChange={(value) => setPriceRange(value)}
      />
      <div className="flex justify-between">
        <Input
          type="number"
          className="w-full"
          value={priceRange[0]}
          onChange={(e) => {
            if (Number(e.target.value) >= min && Number(e.target.value) <= max) {
              setPriceRange([Number(e.target.value), priceRange[1]]);
            }
          }}
        />
        <Input
          type="number"
          value={priceRange[1]}
          className="w-full"
          onChange={(e) => {
            if (Number(e.target.value) >= min && Number(e.target.value) <= max) {
              setPriceRange([priceRange[0], Number(e.target.value)]);
            }
          }}
        />
      </div>
    </FilterLayout>
  );
}
