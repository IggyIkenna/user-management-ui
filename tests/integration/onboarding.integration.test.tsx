import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import OnboardUserPage from "@/pages/OnboardUserPage";
import { renderWithProviders } from "./test-utils";

const mockCheckOnboardQuota = vi.fn();
const mockOnboardUser = vi.fn();
const mockListAccessTemplates = vi.fn();

vi.mock("@/api/users", () => ({
  checkOnboardQuota: (...args: unknown[]) => mockCheckOnboardQuota(...args),
  onboardUser: (...args: unknown[]) => mockOnboardUser(...args),
}));

vi.mock("@/api/accessTemplates", () => ({
  listAccessTemplates: (...args: unknown[]) => mockListAccessTemplates(...args),
}));

describe("OnboardUserPage integration", () => {
  beforeEach(() => {
    mockCheckOnboardQuota.mockReset();
    mockOnboardUser.mockReset();
    mockListAccessTemplates.mockReset();
    mockListAccessTemplates.mockResolvedValue({
      data: {
        templates: [],
        total: 0,
      },
    });
  });

  it("submits onboarding when quota allows", async () => {
    mockCheckOnboardQuota.mockResolvedValue({
      data: { quota: { ok: true, checks: [] } },
    });
    mockOnboardUser.mockResolvedValue({
      data: {
        user: { id: "usr-1" },
        provisioning_steps: [
          { service: "firebase", label: "Firebase", status: "success" },
        ],
      },
    });

    renderWithProviders(<OnboardUserPage />, "/onboard", "/onboard");

    fireEvent.change(screen.getByPlaceholderText("Jane Doe"), {
      target: { value: "Jane Test" },
    });
    fireEvent.change(screen.getByPlaceholderText("jane@odum-research.com"), {
      target: { value: "jane@test.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "elysium" }));
    fireEvent.click(screen.getByRole("button", { name: "Onboard User" }));

    await waitFor(() => {
      expect(mockCheckOnboardQuota).toHaveBeenCalled();
      expect(mockOnboardUser).toHaveBeenCalled();
    });
    expect(
      await screen.findByText("Provisioning Complete"),
    ).toBeInTheDocument();
  });

  it("shows failure when quota blocks onboarding", async () => {
    mockCheckOnboardQuota.mockResolvedValue({
      data: {
        quota: {
          ok: false,
          checks: [],
          message: "Provisioning blocked: required service quota is exhausted.",
        },
      },
    });

    renderWithProviders(<OnboardUserPage />, "/onboard", "/onboard");

    fireEvent.change(screen.getByPlaceholderText("Jane Doe"), {
      target: { value: "Quota User" },
    });
    fireEvent.change(screen.getByPlaceholderText("jane@odum-research.com"), {
      target: { value: "quota@test.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "elysium" }));
    fireEvent.click(screen.getByRole("button", { name: "Onboard User" }));

    expect(
      await screen.findByText(
        "Provisioning blocked: required service quota is exhausted.",
      ),
    ).toBeInTheDocument();
    expect(mockOnboardUser).not.toHaveBeenCalled();
  });
});
