export type MemberSortField = "lastVoted" | "power" | "delegators";
export type MemberSortDirection = "asc" | "desc";

export interface MemberSortState {
  field: MemberSortField;
  direction: MemberSortDirection;
}

export const DEFAULT_SORT_STATE: MemberSortState = {
  field: "lastVoted",
  direction: "desc",
};
