import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

interface UserActionGroupProps {
  isOwnProfile: boolean;
  isDelegate?: boolean;
  buttonText: string;
  onEditProfile: () => void;
  onDelegate: () => void;
}
export const UserActionGroup = ({
  isOwnProfile,
  isDelegate,
  buttonText,
  onEditProfile,
  onDelegate,
}: UserActionGroupProps) => {
  const t = useTranslations("profile.actions");

  return (
    <div className="flex items-center gap-[10px]">
      {isOwnProfile ? (
        <Button
          className="rounded-full"
          variant="outline"
          size="sm"
          onClick={onEditProfile}
        >
          {t("editProfile")}
        </Button>
      ) : null}
      <Button className="rounded-full" onClick={onDelegate} size="sm">
        {isDelegate ? t("delegate") : buttonText}
      </Button>
    </div>
  );
};
