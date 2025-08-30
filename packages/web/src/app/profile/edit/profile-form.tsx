"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileData } from "@/services/graphql/types/profile";

// Social platform URL parsers
function parseTwitterUrl(value: string): string {
  const trimmed = value.trim();

  if (trimmed.startsWith("https://x.com/")) {
    return trimmed.substring("https://x.com/".length);
  }
  if (trimmed.startsWith("https://twitter.com/")) {
    return trimmed.substring("https://twitter.com/".length);
  }
  if (trimmed.startsWith("x.com/")) {
    return trimmed.substring("x.com/".length);
  }
  if (trimmed.startsWith("twitter.com/")) {
    return trimmed.substring("twitter.com/".length);
  }
  if (trimmed.startsWith("@")) {
    return trimmed.substring(1);
  }
  return trimmed;
}

function parseTelegramUrl(value: string): string {
  const trimmed = value.trim();

  if (trimmed.startsWith("https://t.me/")) {
    return trimmed.substring("https://t.me/".length);
  }
  if (trimmed.startsWith("t.me/")) {
    return trimmed.substring("t.me/".length);
  }
  if (trimmed.startsWith("@")) {
    return trimmed.substring(1);
  }
  return trimmed;
}

function parseGithubUrl(value: string): string {
  const trimmed = value.trim();

  if (trimmed.startsWith("https://github.com/")) {
    return trimmed.substring("https://github.com/".length);
  }
  if (trimmed.startsWith("github.com/")) {
    return trimmed.substring("github.com/".length);
  }
  if (trimmed.startsWith("@")) {
    return trimmed.substring(1);
  }
  return trimmed;
}

function parseDiscordUrl(value: string): string {
  const trimmed = value.trim();

  if (trimmed.startsWith("https://discordapp.com/users/")) {
    return trimmed.substring("https://discordapp.com/users/".length);
  }
  if (trimmed.startsWith("https://discord.com/users/")) {
    return trimmed.substring("https://discord.com/users/".length);
  }
  return trimmed;
}

const FormSchema = z.object({
  name: z
    .string()
    .min(5, "Display name must be at least 5 characters")
    .max(50, "Display name cannot exceed 50 characters")
    .regex(
      /^[A-Za-z0-9\s\-_]+$/,
      "Display name can only contain letters, numbers, spaces, hyphens, underscores"
    )
    .trim()
    .optional()
    .or(z.literal("")),

  delegate_statement: z
    .string()
    .max(1000, "Delegate statement cannot exceed 1000 characters")
    .trim(),

  email: z
    .string()
    .email("Invalid email address")
    .trim()
    .toLowerCase()
    .optional()
    .or(z.literal("")),

  twitter: z
    .string()
    .transform(parseTwitterUrl)
    .refine(
      (val) => {
        if (val === "") return true;
        return /^[A-Za-z0-9_]{1,15}$/.test(val);
      },
      {
        message: "Invalid X username",
      }
    )
    .optional()
    .or(z.literal("")),

  telegram: z
    .string()
    .transform(parseTelegramUrl)
    .refine(
      (val) => {
        if (val === "") return true;
        return /^[A-Za-z0-9_]{5,32}$/.test(val);
      },
      {
        message: "Invalid Telegram username",
      }
    )
    .optional()
    .or(z.literal("")),

  github: z
    .string()
    .transform(parseGithubUrl)
    .refine(
      (val) => {
        if (val === "") return true;
        return /^[A-Za-z0-9](?!.*--)([A-Za-z0-9-]){0,37}[A-Za-z0-9]$/.test(val);
      },
      {
        message: "Invalid GitHub username",
      }
    )
    .optional()
    .or(z.literal("")),

  discord: z
    .string()
    .transform(parseDiscordUrl)
    .refine(
      (val) => {
        if (val === "") return true;
        const newFormat = /^[a-z0-9._]{2,32}$/.test(val) && !/\.\./.test(val);
        const userIdFormat = /^[0-9]{17,19}$/.test(val);
        const legacyFormat = /^.{2,32}#[0-9]{4}$/.test(val);

        return newFormat || userIdFormat || legacyFormat;
      },
      {
        message: "Invalid Discord username",
      }
    )
    .optional()
    .or(z.literal("")),
});

export type ProfileFormData = z.infer<typeof FormSchema>;

export function ProfileForm({
  onSubmitForm,
  data,
  isLoading,
  onChange,
}: {
  onSubmitForm: (data: ProfileFormData) => void;
  data?: ProfileData;
  isLoading: boolean;
  onChange?: () => void;
}) {
  const router = useRouter();
  const form = useForm<ProfileFormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: "",
      delegate_statement: "",
      email: "",
      twitter: "",
      github: "",
      discord: "",
      telegram: "",
    },
    mode: "onChange",
  });

  useEffect(() => {
    const subscription = form.watch(() => {
      if (onChange) onChange();
    });
    return () => subscription.unsubscribe();
  }, [form, onChange]);

  async function onSubmit({
    data,
  }: {
    data: ProfileFormData;
    extra: { avatar: string; medium: string };
  }) {
    try {
      onSubmitForm(data);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    if (data) {
      form.reset({
        name: data.name || "",
        delegate_statement: data.delegate_statement || "",
        email: data.email || "",
        twitter: data.twitter || "",
        github: data.github || "",
        discord: data.discord || "",
        telegram: data.telegram || "",
      });
    }
  }, [data, form]);

  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px] shadow-card">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((data) =>
            onSubmit({ data, extra: { avatar: "", medium: "" } })
          )}
          className="w-full space-y-[20px]"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-[10px]">
                  <FormLabel className="w-[140px] shrink-0">
                    Display Name
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter your name"
                      {...field}
                      className="w-full border-border bg-transparent placeholder:text-foreground/50 placeholder:text-[14px] placeholder:font-normal"
                    />
                  </FormControl>
                </div>
                <FormMessage className="ml-[150px] text-red-500" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="delegate_statement"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-[10px]">
                  <FormLabel className="w-[140px] shrink-0">
                    Delegate Statement
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="You statement that shows your commitment to the community and what you will do for the community."
                      {...field}
                      className="w-full border-border bg-transparent placeholder:text-foreground/50 placeholder:text-[14px] placeholder:font-normal"
                    />
                  </FormControl>
                </div>
                <FormMessage className="ml-[150px] text-red-500" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-[10px]">
                  <FormLabel className="w-[140px] shrink-0">Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      {...field}
                      className="w-full border-border bg-transparent placeholder:text-foreground/50 placeholder:text-[14px] placeholder:font-normal"
                    />
                  </FormControl>
                </div>
                <FormMessage className="ml-[150px] text-red-500" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="twitter"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-[10px]">
                  <FormLabel className="w-[140px] shrink-0">X</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="username or https://x.com/username"
                      {...field}
                      className="w-full border-border bg-transparent placeholder:text-foreground/50 placeholder:text-[14px] placeholder:font-normal"
                    />
                  </FormControl>
                </div>
                <FormMessage className="ml-[150px] text-red-500" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="telegram"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-[10px]">
                  <FormLabel className="w-[140px] shrink-0">Telegram</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="username or https://t.me/username"
                      {...field}
                      className="w-full border-border bg-transparent placeholder:text-foreground/50 placeholder:text-[14px] placeholder:font-normal"
                    />
                  </FormControl>
                </div>
                <FormMessage className="ml-[150px] text-red-500" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="github"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-[10px]">
                  <FormLabel className="w-[140px] shrink-0">Github</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="username or https://github.com/username"
                      {...field}
                      className="w-full border-border bg-transparent"
                    />
                  </FormControl>
                </div>
                <FormMessage className="ml-[150px] text-red-500" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="discord"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-[10px]">
                  <FormLabel className="w-[140px] shrink-0">Discord</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="userid or https://discordapp.com/users/userid"
                      {...field}
                      className="w-full border-border bg-transparent placeholder:text-foreground/50 placeholder:text-[14px] placeholder:font-normal"
                    />
                  </FormControl>
                </div>
                <FormMessage className="ml-[150px] text-red-500" />
              </FormItem>
            )}
          />

          <Separator className="my-[20px] bg-border/40" />

          <div className="flex flex-row items-center justify-center gap-[20px]">
            <Button
              type="button"
              variant="outline"
              className="w-[155px] rounded-[100px]"
              onClick={() => {
                form.reset();
                router.push("/profile");
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="w-[155px] rounded-[100px]"
              isLoading={form.formState.isSubmitting || isLoading}
            >
              {form.formState.isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
