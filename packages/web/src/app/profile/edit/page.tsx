import { useAccount } from "wagmi";
import { ProfileForm } from "./profile-form";
import { ProfileAvatar } from "./profile-avatar";
import NotFound from "@/components/not-found";

export default function Edit() {
  const { address } = useAccount();

  if (!address) {
    return <NotFound />;
  }
  return (
    <div className="mx-auto w-full max-w-[820px] space-y-[20px] p-[30px]">
      <h3 className="text-[18px] font-semibold">Edit Profile</h3>
      <div className="grid w-full grid-cols-[600px_200px] gap-[20px]">
        <ProfileForm />
        <ProfileAvatar address={address} />
      </div>
    </div>
  );
}
