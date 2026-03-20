import { useQuery } from "@tanstack/react-query";
import { listFirebaseUsers } from "@/api/firebaseAuth";

export default function FirebaseUsersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["firebase-users"],
    queryFn: listFirebaseUsers,
  });

  const users = data?.data.users || [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-100">Firebase Users</h1>
      <p className="text-sm text-zinc-400">
        Canonical identities from Firebase Auth (`central-element-323112`).
      </p>
      {isLoading ? (
        <div className="py-8 text-center text-zinc-500">Loading Firebase users...</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-700">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-700 bg-zinc-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-zinc-400">
                  UID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-zinc-400">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-zinc-400">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-zinc-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {users.map((user) => (
                <tr key={user.uid}>
                  <td className="px-4 py-3 text-zinc-300">{user.uid}</td>
                  <td className="px-4 py-3 text-zinc-300">{user.email}</td>
                  <td className="px-4 py-3 text-zinc-200">{user.display_name || "-"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        user.disabled
                          ? "bg-red-500/20 text-red-300"
                          : "bg-green-500/20 text-green-300"
                      }`}
                    >
                      {user.disabled ? "disabled" : "active"}
                    </span>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                    No Firebase users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
