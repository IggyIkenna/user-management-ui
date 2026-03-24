import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import OffboardUserPage from "@/pages/OffboardUserPage";
import { renderWithProviders } from "./test-utils";

const mockGetUser = vi.fn();
const mockOffboardUser = vi.fn();

vi.mock("@/api/users", () => ({
  getUser: (...args: unknown[]) => mockGetUser(...args),
  offboardUser: (...args: unknown[]) => mockOffboardUser(...args),
}));

describe("OffboardUserPage integration", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockOffboardUser.mockReset();
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "usr-1",
          firebase_uid: "fb-1",
          name: "Jane Offboard",
          email: "jane@test.com",
          role: "admin",
          product_slugs: [],
          status: "active",
          provisioned_at: new Date().toISOString(),
          last_modified: new Date().toISOString(),
          services: {
            github: "provisioned",
            slack: "provisioned",
            microsoft365: "provisioned",
            gcp: "provisioned",
            aws: "provisioned",
            portal: "provisioned",
          },
        },
      },
    });
    mockOffboardUser.mockResolvedValue({
      data: {
        user: { id: "usr-1" },
        revocation_steps: [],
      },
    });
  });

  it("sends provider actions including firebase delete/deactivate choices", async () => {
    renderWithProviders(
      <OffboardUserPage />,
      "/users/usr-1/offboard",
      "/users/:id/offboard",
    );

    await screen.findByText("Offboard Jane Offboard");
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "delete" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Offboard" }));

    await waitFor(() => {
      expect(mockOffboardUser).toHaveBeenCalled();
    });
    const payload = mockOffboardUser.mock.calls[0][1];
    expect(payload.actions.firebase).toBe("delete");
    expect(payload.actions.github).toBe("deactivate");
  });
});
