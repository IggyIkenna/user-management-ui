import { apiClient } from "@/lib/api/client";
import type { FirebaseAuthUser } from "@/lib/api/types";

export async function listFirebaseUsers() {
  return apiClient.get<{ users: FirebaseAuthUser[] }>("/firebase-users");
}
