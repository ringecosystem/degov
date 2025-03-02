import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => {
  return (
    <div className="flex flex-col h-[200px] w-full  gap-2">
      <Skeleton className="h-[20px] w-full" />
      <Skeleton className="h-[20px] w-full" />
      <Skeleton className="h-[20px] w-full" />
      <Skeleton className="h-[20px] w-full" />
      <Skeleton className="h-[20px] w-full" />
    </div>
  );
};
export const Description = ({
  description,
  isLoading,
}: {
  description?: string;
  isLoading: boolean;
}) => {
  return isLoading ? (
    <Loading />
  ) : (
    <div className="prose">
      <div
        dangerouslySetInnerHTML={{
          __html: description ?? "",
        }}
      ></div>
    </div>
  );
};
