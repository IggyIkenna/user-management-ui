import { apiClient } from "@/lib/api/client";

export interface OnboardingRequest {
  id: string;
  firebase_uid: string;
  applicant_name: string;
  applicant_email: string;
  company: string | null;
  phone: string | null;
  service_type: string;
  selected_options: string[];
  expected_aum: string | null;
  status: "pending" | "approved" | "rejected";
  reviewer_uid: string | null;
  review_note: string;
  created_at: string;
  updated_at: string;
}

export interface UserDocument {
  id: string;
  firebase_uid: string;
  onboarding_request_id: string | null;
  doc_type: string;
  file_name: string;
  storage_path: string;
  content_type: string;
  review_status: "pending" | "approved" | "rejected";
  review_note: string;
  reviewed_by?: string;
  uploaded_at: string;
  updated_at: string;
}

export async function listOnboardingRequests(status?: string) {
  const params = status ? { status } : undefined;
  return apiClient.get<{ requests: OnboardingRequest[]; total: number }>(
    "/onboarding-requests",
    { params },
  );
}

export async function getOnboardingRequest(id: string) {
  return apiClient.get<{ request: OnboardingRequest; documents: UserDocument[] }>(
    `/onboarding-requests/${id}`,
  );
}

export async function approveRequest(id: string, note?: string, role?: string) {
  return apiClient.post<{ request: OnboardingRequest; user_status: string }>(
    `/onboarding-requests/${id}/approve`,
    { note, role },
  );
}

export async function rejectRequest(id: string, note?: string, deleteUser?: boolean) {
  return apiClient.post<{ request: OnboardingRequest }>(
    `/onboarding-requests/${id}/reject`,
    { note, delete_user: deleteUser },
  );
}

export async function listUserDocuments(uid: string) {
  return apiClient.get<{ documents: UserDocument[]; total: number }>(
    `/users/${uid}/documents`,
  );
}

export async function reviewDocument(
  uid: string,
  docId: string,
  status: "approved" | "rejected" | "pending",
  note?: string,
) {
  return apiClient.put<{ document: UserDocument }>(
    `/users/${uid}/documents/${docId}/review`,
    { status, note },
  );
}
