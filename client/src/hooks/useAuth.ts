import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";

export type AuthUser = User & {
  companyId: string;
  ownCompanyId: string;
  activeCompanyName: string | null;
};

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}
