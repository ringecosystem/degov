export interface ProfileData {
  /** 用户ID */
  id: string;
  /** 用户地址 */
  address: string;
  /** 用户名称 */
  name: string | null;
  /** 用户头像URL */
  avatar: string | null;
  /** 电子邮箱 */
  email: string | null;
  /** Twitter用户名 */
  twitter: string | null;
  /** GitHub用户名 */
  github: string | null;
  /** Discord用户名 */
  discord: string | null;
  /** Telegram用户名 */
  telegram: string | null;
  /** Medium用户名 */
  medium: string | null;
  /** 附加信息 */
  additional: string | null;
  /** 最后登录时间 */
  last_login_time: string;
  /** 创建时间 */
  ctime: string;
  /** 更新时间 */
  utime: string;
}

export type ProfileResponse = {
  profile: ProfileData;
};

export type UpdateProfileResponse = {
  profile: Profile;
};

export type UpdateProfile = {
  address: string;
  profile: Profile;
};
