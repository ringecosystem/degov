import { LoadingState } from "@/components/ui/loading-spinner";

export default function Loading() {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <LoadingState
        title="Loading..."
        description="Please wait while we load the content"
        className="-mt-[100px]"
      />
    </div>
  );
}
