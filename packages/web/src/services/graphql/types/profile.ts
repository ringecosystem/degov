export type Profile = {
  address: string;
  name: string;
  email: string;
  avatar: string;
};

export type ProfileResponse = {
  profile: Profile;
};

export type UpdateProfileResponse = {
  profile: Profile;
};

export type UpdateProfile = {
  address: string;
  profile: Profile;
};
