import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";

import { ErrorMessage } from "@/components/error-message";
import { Input } from "@/components/ui/input";

import { calldataSchema } from "./schema";

import type { Calldata, CalldataItem } from "./schema";
import type { FieldError, FieldErrors } from "react-hook-form";

interface CallDataInputFormProps {
  calldata: CalldataItem[];
  onChange: (calldata: CalldataItem[]) => void;
  parentErrors?: FieldErrors<{ calldataItems: CalldataItem[] }>;
  onFieldTouch?: (index: number, arrayIndex?: number) => void;
  onFieldUntouchArray?: (index: number, removedArrayIndex: number) => void;
  touchedFields?: Set<string>;
}

export function CallDataInputForm({
  calldata,
  onChange,
  parentErrors,
  onFieldTouch,
  onFieldUntouchArray,
  touchedFields,
}: CallDataInputFormProps) {
  const prevCalldataRef = useRef<CalldataItem[]>(calldata);

  const {
    control,
    formState: { errors },
    watch,
    setValue,
    trigger,
    reset,
  } = useForm<Calldata>({
    resolver: zodResolver(calldataSchema),
    defaultValues: {
      calldataItems: calldata,
    },
    mode: "onChange",
    reValidateMode: "onChange",
  });

  const isArrayType = useCallback((type: string) => {
    return type.endsWith("[]");
  }, []);

  const getBaseType = useCallback((type: string) => {
    return type.replace("[]", "");
  }, []);

  // Reset form when calldata changes from parent
  useEffect(() => {
    if (JSON.stringify(prevCalldataRef.current) !== JSON.stringify(calldata)) {
      reset({
        calldataItems: calldata,
      });
      prevCalldataRef.current = calldata;
    }
  }, [calldata, reset]);

  useEffect(() => {
    const subscription = watch((data) => {
      onChange(data.calldataItems as CalldataItem[]);
    });
    return () => subscription.unsubscribe();
  }, [watch, onChange]);

  const { fields, update } = useFieldArray({
    control,
    name: "calldataItems",
  });

  const getFieldError = useCallback((
    index: number,
    arrayIndex?: number
  ): FieldError | undefined => {
    const errorSource = parentErrors || errors;

    if (arrayIndex !== undefined) {
      return (
        errorSource.calldataItems?.[index]?.value as unknown as FieldErrors
      )?.[arrayIndex] as FieldError;
    }
    return errorSource.calldataItems?.[index]?.value as FieldError;
  }, [parentErrors, errors]);

  const shouldShowError = useCallback(
    (index: number, arrayIndex?: number): boolean => {
      if (!touchedFields) return !!getFieldError(index, arrayIndex);

      const fieldKey =
        arrayIndex !== undefined ? `${index}-${arrayIndex}` : `${index}`;
      return touchedFields.has(fieldKey) && !!getFieldError(index, arrayIndex);
    },
    [touchedFields, getFieldError]
  );

  const addArrayItem = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();

      const values = watch("calldataItems");
      if (!values?.[index]) return;

      const currentValue = values[index].value;

      const newValues = [...values];
      newValues[index] = {
        ...newValues[index],
        value: Array.isArray(currentValue) ? [...currentValue, ""] : [""],
      };

      setValue("calldataItems", newValues);
    },
    [watch, setValue]
  );

  const removeArrayItem = useCallback(
    (index: number, arrayIndex: number) => {
      const values = watch("calldataItems");
      if (!values?.[index]) return;

      // Remove array item and update values
      const newValues = [...values];
      const currentValue = [...(values[index].value as string[])];
      currentValue.splice(arrayIndex, 1);
      newValues[index] = {
        ...newValues[index],
        value: currentValue,
      };

      setValue("calldataItems", newValues);
    },
    [watch, setValue]
  );

  return (
    <div className="flex flex-col gap-[10px]">
      {fields.map((input, index) => (
        <div key={input.name} className="flex flex-col gap-[5px]">
          <div className="flex flex-row gap-[10px]">
            <span className="inline-flex h-[37px] w-[200px] items-center justify-start truncate rounded-[4px] border border-border bg-card-background px-[10px] text-[14px] text-foreground">
              {input.name}
            </span>
            <div className="flex flex-1 flex-col gap-[10px]">
              {isArrayType(input.type) ? (
                <div className="flex flex-col gap-[10px]">
                  {Array.isArray(input.value) &&
                    input.value.map((arrayValue, arrayIndex) => (
                      <div
                        key={arrayIndex}
                        className="flex flex-row items-center justify-between gap-[20px]"
                      >
                        <Input
                          placeholder={`${getBaseType(
                            input.type
                          )}[${arrayIndex}]`}
                          className={`h-[37px] border-border bg-card ${
                            shouldShowError(index, arrayIndex)
                              ? "border-danger"
                              : ""
                          }`}
                          value={arrayValue}
                          onChange={(e) => {
                            const newVal = e.target.value;
                            onFieldTouch?.(index, arrayIndex);
                            update(index, {
                              name: fields[index].name,
                              type: fields[index].type,
                              isArray: fields[index].isArray,
                              value: fields[index].isArray
                                ? [...(fields[index].value as string[])].map(
                                    (v, i) => (i === arrayIndex ? newVal : v)
                                  )
                                : newVal,
                            });
                            trigger(`calldataItems.${index}`);
                          }}
                        />
                        <Trash2
                          className="h-[18px] w-[18px] cursor-pointer transition-opacity hover:opacity-80"
                          onClick={() => {
                            onFieldUntouchArray?.(index, arrayIndex);
                            removeArrayItem(index, arrayIndex);
                          }}
                        />
                      </div>
                    ))}
                  <button
                    type="button"
                    className="flex h-[37px] w-[100px] items-center justify-center rounded-[4px] border border-border text-[14px]"
                    onClick={(e) => addArrayItem(index, e)}
                  >
                    <Plus className="h-[18px] w-[18px]" />
                    Add Item
                  </button>
                </div>
              ) : (
                <Input
                  placeholder={`${input.type}`}
                  value={input.value as string}
                  className={`h-[37px] border-border bg-card  ${
                    shouldShowError(index) ? "border-danger" : ""
                  }`}
                  onChange={(e) => {
                    const newVal = e.target.value;
                    onFieldTouch?.(index);
                    update(index, {
                      name: fields[index].name,
                      type: fields[index].type,
                      isArray: fields[index].isArray,
                      value: newVal,
                    });
                    trigger(`calldataItems.${index}`);
                  }}
                />
              )}
            </div>
          </div>
          {shouldShowError(index) && (
            <ErrorMessage message={getFieldError(index)?.message} />
          )}
        </div>
      ))}
    </div>
  );
}
