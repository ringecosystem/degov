import { DaoHeader } from './dao-header';
import { Overview } from './overview';

export const HomePage = () => {
  return (
    <div className="flex flex-col gap-[30px] p-[20px]">
      <DaoHeader />
      <Overview />
    </div>
  );
};
