import { apiClient } from "@/api/client";
import type { FirebaseAuthUser } from "@/api/types";

export async function listFirebaseUsers() {
  return apiClient.get<{ users: FirebaseAuthUser[]; total: number }>(
    "/firebase-auth/users",
  );
}
