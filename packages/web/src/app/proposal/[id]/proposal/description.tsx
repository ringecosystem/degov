import { Skeleton } from "@/components/ui/skeleton";
const Loading = () => {
  return (
    <div className="flex flex-col h-[200px] w-full  gap-4">
      <Skeleton className="h-[28px] w-full" />
      <Skeleton className="h-[28px] w-full" />
      <Skeleton className="h-[28px] w-full" />
      <Skeleton className="h-[28px] w-full" />
      <Skeleton className="h-[28px] w-full" />
    </div>
  );
};
export const Description = ({
  description,
  isFetching,
}: {
  description?: string;
  isFetching: boolean;
}) => {
  return isFetching ? (
    <Loading />
  ) : (
    <div className="prose">
      <div
        style={{
          whiteSpace: "wrap",
          wordWrap: "break-word",
        }}
        className="text-balance"
        dangerouslySetInnerHTML={{
          __html: description ?? "",
        }}
      ></div>
    </div>
  );
};
