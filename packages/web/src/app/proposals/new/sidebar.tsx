import { motion, AnimatePresence } from "framer-motion";

import { PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DEFAULT_ANIMATION_DURATION } from "@/config/base";

import { NewProposalAction } from "./action";

import type { Action, AddAction } from "./type";

interface SidebarProps {
  actions: Action[];
  actionUuid: string | null;
  tab: string;
  validationState: Map<string, boolean>;
  onSwitchAction: (id: string) => void;
  onAddAction: () => void;
  onSetTab: (tab: "edit" | "preview") => void;
}

export const Sidebar = ({
  actions,
  actionUuid,
  tab,
  validationState,
  onSwitchAction,
  onAddAction,
  onSetTab,
}: SidebarProps) => {
  const isNotAddAction = (a: Action): a is Exclude<Action, AddAction> => a.type !== "add";
  return (
    <aside className="flex w-[300px] flex-shrink-0 flex-col gap-[10px] rounded-[14px]">
      <AnimatePresence initial={false}>
        {actions.filter(isNotAddAction).map((action) => (
          <motion.div
            key={action.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{
              duration: DEFAULT_ANIMATION_DURATION,
              ease: "easeInOut",
            }}
          >
            <NewProposalAction
              type={action.type}
              onSwitch={() => onSwitchAction(action.id)}
              active={action.id === actionUuid && tab === "edit"}
              error={!validationState.get(action.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        transition={{ duration: DEFAULT_ANIMATION_DURATION }}
      >
        <NewProposalAction
          type="preview"
          onSwitch={() => onSetTab("preview")}
          active={tab === "preview"}
        />
      </motion.div>

      <motion.div
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: DEFAULT_ANIMATION_DURATION }}
      >
        <Button
          className="gap-[5px] rounded-[100px] w-full"
          onClick={onAddAction}
        >
          <PlusIcon
            width={16}
            height={16}
            className="text-current"
          />
          <span>Add Action</span>
        </Button>
      </motion.div>
    </aside>
  );
};
