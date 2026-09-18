'use client';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'NZD', 'AUD', 'CAD', 'JPY', 'CHF', 'SEK', 'INR', 'BRL', 'SGD'];

export function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Revenue is reported per currency, as sent with the events. */
export function CurrencySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-28" aria-label="Currency">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {CURRENCIES.map(code => (
            <SelectItem key={code} value={code}>
              {code}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
