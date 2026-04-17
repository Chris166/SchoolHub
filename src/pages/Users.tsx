import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UserCog, Shield } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface UserRow {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  role: "admin" | "teacher" | "student";
  email?: string;
}

export default function UsersPage() {
  const { t } = useLanguage();
  const { role: myRole } = useAuth();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Change role dialog
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // Fetch roles for all users — batch
    const profilesList = profiles ?? [];
    if (profilesList.length > 0) {
      const userIds = profilesList.map((p) => p.user_id);
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);
      const roleMap: Record<string, string> = {};
      (roleData ?? []).forEach((r) => { roleMap[r.user_id] = r.role; });
      setUsers(profilesList.map((p) => ({
        ...p,
        role: (roleMap[p.user_id] as UserRow["role"]) ?? "student",
      })));
    } else {
      setUsers([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openChangeRole = (u: UserRow) => {
    setRoleTarget(u);
    setNewRole(u.role);
    setRoleDialogOpen(true);
  };

  const handleChangeRole = async () => {
    if (!roleTarget || !newRole) return;
    setSaving(true);

    // Update user_roles
    const { data: existingRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", roleTarget.user_id)
      .limit(1);

    if (existingRole && existingRole.length > 0) {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole as "admin" | "teacher" | "student" })
        .eq("id", existingRole[0].id);
      if (error) toast.error(error.message);
      else toast.success(t.users.changeRole + " ✓");
    } else {
      const { error } = await supabase.from("user_roles").insert({
        user_id: roleTarget.user_id,
        role: newRole as "admin" | "teacher" | "student",
      });
      if (error) toast.error(error.message);
      else toast.success(t.users.changeRole + " ✓");
    }

    setSaving(false);
    setRoleDialogOpen(false);
    fetchUsers();
  };

  const roleBadgeVariant = (r: string): "default" | "secondary" | "destructive" => {
    if (r === "admin") return "destructive";
    if (r === "teacher") return "default";
    return "secondary";
  };

  if (myRole !== "admin") {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">{t.users.title}</h1>
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">Access denied</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{t.users.title}</h1>
        <Badge variant="secondary">{users.length}</Badge>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">{t.users.noUsers}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.common.name}</TableHead>
                <TableHead>{t.common.role}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead className="w-[100px]">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.user_id}>
                  <TableCell className="font-medium">
                    {u.full_name || u.user_id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={roleBadgeVariant(u.role)}>
                      <Shield className="h-3 w-3 mr-1" />
                      {t.roles[u.role]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(u.created_at), "dd.MM.yyyy")}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => openChangeRole(u)}>
                      <UserCog className="h-3.5 w-3.5" />
                      {t.users.changeRole}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Change Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.users.changeRole}</DialogTitle>
            <DialogDescription>{roleTarget?.full_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t.common.name}</Label>
              <p className="text-sm font-medium">{roleTarget?.full_name || "—"}</p>
            </div>
            <div className="space-y-2">
              <Label>{t.common.role}</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">{t.roles.student}</SelectItem>
                  <SelectItem value="teacher">{t.roles.teacher}</SelectItem>
                  <SelectItem value="admin">{t.roles.admin}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>{t.common.cancel}</Button>
            <Button onClick={handleChangeRole} disabled={saving || newRole === roleTarget?.role}>
              {saving ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
