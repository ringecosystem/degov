import type { ProfileFormData } from "@/app/profile/edit/profile-form";

export type ProfileData = ProfileFormData & {
  avatar: string;
  medium: string;
  additional: string;
};
