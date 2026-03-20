import { create } from "zustand";
import type { Person, UserRole } from "@/api/types";

interface UserFilters {
  search: string;
  role: UserRole | "all";
  status: "all" | "active" | "offboarded" | "pending";
}

interface UserStore {
  filters: UserFilters;
  selectedUserId: string | null;
  setSearch: (search: string) => void;
  setRoleFilter: (role: UserRole | "all") => void;
  setStatusFilter: (status: UserFilters["status"]) => void;
  setSelectedUser: (id: string | null) => void;
  filterUsers: (users: Person[]) => Person[];
}

export const useUserStore = create<UserStore>((set, get) => ({
  filters: {
    search: "",
    role: "all",
    status: "all",
  },
  selectedUserId: null,

  setSearch: (search) =>
    set((state) => ({ filters: { ...state.filters, search } })),

  setRoleFilter: (role) =>
    set((state) => ({ filters: { ...state.filters, role } })),

  setStatusFilter: (status) =>
    set((state) => ({ filters: { ...state.filters, status } })),

  setSelectedUser: (id) => set({ selectedUserId: id }),

  filterUsers: (users) => {
    const { filters } = get();
    return users.filter((user) => {
      const matchesSearch =
        !filters.search ||
        user.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        user.email.toLowerCase().includes(filters.search.toLowerCase());
      const matchesRole = filters.role === "all" || user.role === filters.role;
      const matchesStatus =
        filters.status === "all" || user.status === filters.status;
      return matchesSearch && matchesRole && matchesStatus;
    });
  },
}));
