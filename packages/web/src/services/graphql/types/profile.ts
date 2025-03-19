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
  rn?: number;
} & ProfileData;

export type MemberResponse = {
  code: number;
  data: Member[];
  message: string;
};

export type MemberTotalResponse = {
  code: number;
  data: {
    member_count: number;
  };
  message: string;
};

export type ProfilePullResponse = {
  code: number;
  data: Member[];
  message: string;
};
