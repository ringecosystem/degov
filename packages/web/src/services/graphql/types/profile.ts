import type { ProfileFormData } from "@/app/profile/edit/profile-form";

export type ProfileData = ProfileFormData & {
  avatar: string;
  medium: string;
  additional: string;
};

export type Member = {
  id: string;
  address: string;
  ctime: string;
  utime: string;
  last_login_time: string;
} & ProfileData;

export type MemberResponse = {
  code: number;
  data: Member[];
  message: string;
};
