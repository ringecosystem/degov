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
}

export function CallDataInputForm({
  calldata,
  onChange,
}: CallDataInputFormProps) {
  const prevCalldataRef = useRef<CalldataItem[]>(calldata);
  
  const {
    control,
    formState: { errors },
    handleSubmit,
    watch,
    setValue,
    trigger,
    reset,
  } = useForm<Calldata>({
    resolver: zodResolver(calldataSchema),
    defaultValues: {
      calldataItems: calldata,
    },
    mode: "onBlur",
  });

  const isArrayType = useCallback((type: string) => {
    return type.endsWith("[]");
  }, []);

  const getBaseType = useCallback((type: string) => {
    return type.replace("[]", "");
  }, []);

  // Reset form when calldata changes from parent (but avoid infinite loops)
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

  const getFieldError = (
    index: number,
    arrayIndex?: number
  ): FieldError | undefined => {
    if (arrayIndex !== undefined) {
      return (errors.calldataItems?.[index]?.value as unknown as FieldErrors)?.[
        arrayIndex
      ] as FieldError;
    }
    return errors.calldataItems?.[index]?.value as FieldError;
  };
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

      // Create new values array with the item removed
      const newValues = [...values];
      const currentValue = [...(values[index].value as string[])];
      currentValue.splice(arrayIndex, 1);
      newValues[index] = {
        ...newValues[index],
        value: currentValue,
      };

      // Update both form and parent
      setValue("calldataItems", newValues);
    },
    [watch, setValue]
  );

  const onSubmit = useCallback((data: Calldata) => {
    console.log("data", data);
  }, []);

  return (
    <form
      className="flex flex-col gap-[10px]"
      onSubmit={handleSubmit(onSubmit)}
    >
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
                            getFieldError(index) ? "border-danger" : ""
                          }`}
                          value={arrayValue}
                          onBlur={(e) => {
                            const newVal = e.target.value;
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
                            trigger(`calldataItems.${index}.value`);
                          }}
                        />
                        <Trash2
                          className="h-[18px] w-[18px] cursor-pointer transition-opacity hover:opacity-80"
                          onClick={() => removeArrayItem(index, arrayIndex)}
                        />
                      </div>
                    ))}
                  {getFieldError(index) && (
                    <ErrorMessage message={getFieldError(index)?.message} />
                  )}
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
                <div className="flex flex-col gap-[10px]">
                  <Input
                    placeholder={`${input.type}`}
                    className={`h-[37px] border-border bg-card  ${
                      getFieldError(index) ? "border-danger" : ""
                    }`}
                    onBlur={(e) => {
                      const newVal = e.target.value;
                      update(index, {
                        name: fields[index].name,
                        type: fields[index].type,
                        isArray: fields[index].isArray,
                        value: newVal,
                      });
                      trigger(`calldataItems.${index}.value`);
                    }}
                  />
                  {getFieldError(index) && (
                    <ErrorMessage message={getFieldError(index)?.message} />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </form>
  );
}
