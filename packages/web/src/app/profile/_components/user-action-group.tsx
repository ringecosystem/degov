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
  return (
    <div className="flex items-center gap-[10px]">
      {isOwnProfile ? (
        <Button
          className="rounded-full"
          variant="outline"
          size="sm"
          onClick={onEditProfile}
        >
          Edit Profile
        </Button>
      ) : null}
      <Button className="rounded-full" onClick={onDelegate} size="sm">
        {isDelegate ? "Delegate" : buttonText}
      </Button>
    </div>
  );
};
