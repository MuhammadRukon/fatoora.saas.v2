import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

import { CustomCheckboxProps } from './custom-checkbox.types';

export function CustomCheckbox({ label, id, checked, onChange }: CustomCheckboxProps) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      {label && <Label htmlFor={id}>{label}</Label>}
    </div>
  );
}
