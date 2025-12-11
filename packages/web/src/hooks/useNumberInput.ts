import { useCallback, useState } from 'react';

import type { ChangeEvent} from 'react';

interface UseNumberInputProps {
  maxDecimals?: number;
  initialValue?: string;
  onChange?: (value: string) => void;
}

interface UseNumberInputReturn {
  value: string;
  setValue: (value: string) => void;
  handleChangeValue: (value: string) => void;
  handleChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleBlur: () => void;
  handleReset: () => void;
  isValid: boolean;
  error?: string;
}

export function useNumberInput({
  maxDecimals = 6,
  initialValue = '',
  onChange
}: UseNumberInputProps): UseNumberInputReturn {
  const [value, setInternalValue] = useState(initialValue);
  const [error, setError] = useState<string>();

  const setValue = useCallback(
    (newValue: string) => {
      setInternalValue(newValue);
      onChange?.(newValue);
    },
    [onChange]
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;

      if (!newValue) {
        setValue('');
        return;
      }

      const regex = new RegExp(`^\\d*\\.?\\d{0,${maxDecimals}}$`);
      if (!regex.test(newValue)) return;

      let formattedValue = newValue;
      if (newValue.startsWith('0') && newValue.length > 1 && !newValue.startsWith('0.'))
        formattedValue = newValue.replace(/^0+/, '');

      const numValue = parseFloat(formattedValue);
      if (!Number.isNaN(numValue)) setValue(formattedValue);
    },
    [setValue, maxDecimals]
  );

  const handleBlur = useCallback(() => {
    if (!value) return;
    const numValue = parseFloat(value);
    if (!Number.isNaN(numValue)) {
      const decimalParts = value.split('.');
      if (decimalParts.length === 2 && decimalParts[1].length > maxDecimals) {
        setValue(numValue.toFixed(maxDecimals));
        return;
      }
      setValue(value);
    }
  }, [setValue, maxDecimals, value]);

  const handleReset = useCallback(() => {
    setValue('');
    setError(undefined);
  }, [setValue]);

  const handleChangeValue = useCallback(
    (value: string) => {
      setValue(value);
    },
    [setValue]
  );

  return {
    value,
    setValue,
    handleChange,
    handleBlur,
    handleReset,
    handleChangeValue,
    isValid: !error,
    error
  };
}

export const numberUtils = {
  formatWithCommas(value: string): string {
    if (!value) return value;
    const parts = value.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  },

  removeCommas(value: string): string {
    return value.replace(/,/g, '');
  },

  formatDecimals(value: string, decimals: number): string {
    const num = parseFloat(value);
    return Number.isNaN(num) ? '' : num.toFixed(decimals);
  }
};
