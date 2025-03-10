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
const FormSchema = z.object({
  name: z
    .string()
    .min(2, "Display name must be at least 2 characters")
    .max(50, "Display name cannot exceed 50 characters")
    .trim(),

  additional: z
    .string()
    .min(20, "Statement must be at least 20 characters")
    .max(1000, "Statement cannot exceed 1000 characters")
    .trim(),

  email: z
    .string()
    .email("Please enter a valid email address")
    .trim()
    .toLowerCase(),

  twitter: z
    .string()
    .regex(/^[A-Za-z0-9_]{4,15}$/, "Please enter a valid X/Twitter handle")
    .transform((val) => val.replace("@", ""))
    .optional()
    .or(z.literal("")),

  telegram: z
    .string()
    .regex(/^[A-Za-z0-9_]{5,32}$/, "Please enter a valid Telegram username")
    .transform((val) => val.replace("@", ""))
    .optional()
    .or(z.literal("")),

  github: z
    .string()
    .regex(
      /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/,
      "Please enter a valid GitHub username"
    )
    .optional()
    .or(z.literal("")),

  discord: z
    .string()
    .regex(
      /^.{2,32}#[0-9]{4}$/,
      "Please enter a valid Discord tag (e.g. username#1234)"
    )
    .optional()
    .or(z.literal("")),
});

type FormData = z.infer<typeof FormSchema>;

export function ProfileForm({
  onSubmitForm,
  isLoading,
}: {
  onSubmitForm: (data: FormData) => void;
  isLoading: boolean;
}) {
  const router = useRouter();
  const form = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: "",
      additional: "",
      email: "",
      twitter: "",
      github: "",
      discord: "",
      telegram: "",
    },
  });

  async function onSubmit(data: FormData) {
    try {
      console.log(data);
      onSubmitForm({
        ...data,
        avatar: "",
      });
      // TODO: Add API call to save data
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    return () => {
      form.reset();
    };
  }, [form]);

  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="w-full space-y-[20px]"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-row items-center justify-between gap-[10px]">
                  <FormLabel className="w-[140px] shrink-0">
                    Display Name
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Display Name"
                      {...field}
                      className="w-full border-border bg-transparent"
                    />
                  </FormControl>
                </div>
                <FormMessage className="ml-[150px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="additional"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-row items-center justify-between gap-[10px]">
                  <FormLabel className="w-[140px] shrink-0">
                    Delegate Statement
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Your statement that shows your commitment to the community and what you will do for the community."
                      {...field}
                      className="w-full border-border bg-transparent"
                    />
                  </FormControl>
                </div>
                <FormMessage className="ml-[150px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-row items-center justify-between gap-[10px]">
                  <FormLabel className="w-[140px] shrink-0">Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      {...field}
                      className="w-full border-border bg-transparent"
                    />
                  </FormControl>
                </div>
                <FormMessage className="ml-[150px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="twitter"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-row items-center justify-between gap-[10px]">
                  <FormLabel className="w-[140px] shrink-0">X</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="@username"
                      {...field}
                      className="w-full border-border bg-transparent"
                    />
                  </FormControl>
                </div>
                <FormMessage className="ml-[150px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="telegram"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-row items-center justify-between gap-[10px]">
                  <FormLabel className="w-[140px] shrink-0">Telegram</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="@username"
                      {...field}
                      className="w-full border-border bg-transparent"
                    />
                  </FormControl>
                </div>
                <FormMessage className="ml-[150px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="github"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-row items-center justify-between gap-[10px]">
                  <FormLabel className="w-[140px] shrink-0">Github</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="username"
                      {...field}
                      className="w-full border-border bg-transparent"
                    />
                  </FormControl>
                </div>
                <FormMessage className="ml-[150px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="discord"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-row items-center justify-between gap-[10px]">
                  <FormLabel className="w-[140px] shrink-0">Discord</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="username#1234"
                      {...field}
                      className="w-full border-border bg-transparent"
                    />
                  </FormControl>
                </div>
                <FormMessage className="ml-[150px]" />
              </FormItem>
            )}
          />

          <Separator className="my-[20px] bg-border/40" />

          <div className="flex flex-row items-center justify-center gap-[20px]">
            <Button
              type="button"
              variant="outline"
              className="w-[155px] rounded-[100px] border-border bg-card"
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
              disabled={form.formState.isSubmitting || isLoading}
            >
              {form.formState.isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
