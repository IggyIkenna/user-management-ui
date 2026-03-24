"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, Mail, Shield, Key, Pencil, Lock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ServiceTabs, ADMIN_TABS } from "@/components/shell/service-tabs";
import { useAuth } from "@/hooks/use-auth";
import { updateProfile, changePassword } from "@/lib/api/settings";
import { getEffectiveAccess } from "@/lib/api/users";
import type { EffectiveAccessEntry } from "@/lib/api/types";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  const [editingName, setEditingName] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [nameSaving, setNameSaving] = React.useState(false);
  const [nameSuccess, setNameSuccess] = React.useState(false);

  const [changingPassword, setChangingPassword] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [passwordSaving, setPasswordSaving] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState("");
  const [passwordSuccess, setPasswordSuccess] = React.useState(false);

  const [effectiveAccess, setEffectiveAccess] = React.useState<EffectiveAccessEntry[]>([]);
  const [accessLoading, setAccessLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user) return;
    setNewName(user.displayName || "");
    (async () => {
      try {
        setAccessLoading(true);
        const res = await getEffectiveAccess(user.firebase_uid);
        setEffectiveAccess(res.data.effective_access);
      } catch {
        /* non-critical */
      } finally {
        setAccessLoading(false);
      }
    })();
  }, [user]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  async function handleNameSave() {
    if (!user || !newName.trim()) return;
    setNameSaving(true);
    setNameSuccess(false);
    try {
      await updateProfile(user.firebase_uid, newName.trim());
      setNameSuccess(true);
      setEditingName(false);
    } catch {
      /* show inline */
    } finally {
      setNameSaving(false);
    }
  }

  async function handlePasswordChange() {
    if (!user) return;
    setPasswordError("");
    setPasswordSuccess(false);
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setPasswordSaving(true);
    try {
      await changePassword(user.firebase_uid, newPassword);
      setPasswordSuccess(true);
      setChangingPassword(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPasswordSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  const ROLE_COLORS: Record<string, string> = {
    viewer: "bg-zinc-600/15 text-zinc-400",
    editor: "bg-blue-600/15 text-blue-400 border-blue-600/20",
    admin: "bg-amber-600/15 text-amber-400 border-amber-600/20",
    owner: "bg-red-600/15 text-red-400 border-red-600/20",
  };

  return (
    <div className="space-y-6">
      <ServiceTabs tabs={ADMIN_TABS} />

      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Account information, security, and app access
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Profile</CardTitle>
          <CardDescription>
            Your account details from Firebase Auth
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                    <User className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Name</p>
                    {editingName ? (
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="h-7 text-sm"
                        />
                        <Button size="sm" className="h-7" onClick={handleNameSave} disabled={nameSaving}>
                          {nameSaving ? <Spinner className="size-3" /> : <Check className="size-3" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingName(false)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{nameSuccess ? newName : user.displayName}</p>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-5"
                          onClick={() => setEditingName(true)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                    <Mail className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                    <Shield className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Role</p>
                    <p className="text-sm font-medium capitalize">{user.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                    <Key className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Firebase UID</p>
                    <p className="text-sm font-mono text-muted-foreground">
                      {user.firebase_uid}
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Unable to load profile information.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="size-4" />
            Security
          </CardTitle>
          <CardDescription>
            Change your password
          </CardDescription>
        </CardHeader>
        <CardContent>
          {changingPassword ? (
            <div className="space-y-3 max-w-sm">
              <div className="space-y-1.5">
                <Label className="text-xs">New Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Confirm Password</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                />
              </div>
              {passwordError && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  {passwordError}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handlePasswordChange} disabled={passwordSaving}>
                  {passwordSaving ? "Saving..." : "Update Password"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setChangingPassword(false);
                    setPasswordError("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" onClick={() => setChangingPassword(true)}>
                <Lock className="mr-2 size-3.5" />
                Change Password
              </Button>
              {passwordSuccess && (
                <p className="text-sm text-emerald-400">Password updated.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your App Access</CardTitle>
          <CardDescription>
            Applications you have access to (direct + via groups)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accessLoading ? (
            <Spinner className="size-5" />
          ) : effectiveAccess.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No app access assigned. Contact an admin.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {effectiveAccess.map((entry) => (
                <div
                  key={entry.app_id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{entry.app_name}</p>
                    <p className="text-xs text-muted-foreground">{entry.app_category}</p>
                  </div>
                  <Badge className={ROLE_COLORS[entry.effective_role] || "bg-muted"}>
                    {entry.effective_role}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session</CardTitle>
          <CardDescription>
            Manage your current session
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <LogOut className="mr-2 size-4" />
                Logout
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm logout</AlertDialogTitle>
                <AlertDialogDescription>
                  You will be signed out and redirected to the login page.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout}>Logout</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
