import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect } from "react";
import { Controller } from "react-hook-form";
import { useForm } from "react-hook-form";

import { Editor } from "@/components/editor";
import { ErrorMessage } from "@/components/error-message";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { proposalSchema } from "./schema";

import type { ProposalContent } from "./schema";

interface ProposalPanelProps {
  visible: boolean;
  ref: (instance: HTMLFormElement | null) => void;
  content: ProposalContent;
  onChange: (content: ProposalContent) => void;
}

export const ProposalPanel = ({
  visible,
  ref,
  content,
  onChange,
}: ProposalPanelProps) => {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<ProposalContent>({
    resolver: zodResolver(proposalSchema),
    defaultValues: {
      title: content.title || "",
      markdown: content.markdown || "",
      discussion: content.discussion || "",
    },
    mode: "onChange",
  });

  useEffect(() => {
    const subscription = watch((value) => {
      onChange(value as ProposalContent);
    });
    return () => subscription.unsubscribe();
  }, [watch, onChange]);

  const onSubmit = useCallback(
    (data: ProposalContent) => {
      onChange(data);
    },
    [onChange]
  );

  return (
    <form
      ref={ref}
      className={cn(
        "flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px] shadow-card",
        visible ? "animate-in fade-in duration-300" : "hidden"
      )}
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="flex flex-col gap-[10px]">
        <label className="text-[14px] text-foreground" htmlFor="title">
          Title
        </label>
        <Input
          id="title"
          {...register("title")}
          aria-invalid={errors.title ? "true" : "false"}
          placeholder="Enter the title of your proposal"
          className={cn(
            "border-border/20 bg-card",
            errors.title && "border-red-500"
          )}
        />
        {errors.title && <ErrorMessage message={errors.title.message} />}
      </div>
      <div className="flex flex-col gap-[10px]">
        <label className="text-[14px] text-foreground" htmlFor="description">
          Description
        </label>
        <Controller
          name="markdown"
          control={control}
          render={({ field }) => (
            <>
              <Editor
                value={field.value}
                onChange={(newValue) => {
                  field.onChange(newValue);
                }}
                placeholder="Enter the description of your proposal"
                className={cn(
                  "border border-border/20 bg-card",
                  errors.markdown && "border-red-500"
                )}
              />
              {errors.markdown && (
                <ErrorMessage message={errors.markdown.message} />
              )}
            </>
          )}
        />
      </div>
      <div className="flex flex-col gap-[10px]">
        <label className="text-[14px] text-foreground" htmlFor="discussion">
          Offchain discussion (Optional)
        </label>
        <Input
          id="discussion"
          {...register("discussion")}
          aria-invalid={errors.discussion ? "true" : "false"}
          placeholder="eg, http://forum.example.com/t/1234"
          className={cn(
            "border-border/20 bg-card",
            errors.discussion && "border-red-500"
          )}
        />
        {errors.discussion && (
          <ErrorMessage message={errors.discussion.message} />
        )}
      </div>
    </form>
  );
};
