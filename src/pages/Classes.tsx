import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Users, UserPlus, UserMinus, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface ClassRow {
  id: string;
  name: string;
  description: string | null;
  teacher_id: string;
  created_at: string;
}

interface MemberRow {
  id: string;
  student_id: string;
  joined_at: string;
  profile?: { full_name: string } | null;
}

interface StudentOption {
  user_id: string;
  full_name: string;
}

export default function Classes() {
  const { t } = useLanguage();
  const { user, role } = useAuth();

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<ClassRow | null>(null);

  // Expanded class members
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Add student dialog
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [availableStudents, setAvailableStudents] = useState<StudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");

  const fetchClasses = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("classes").select("*").order("created_at", { ascending: false });

    if (role === "teacher") {
      query = query.eq("teacher_id", user!.id);
    } else if (role === "student") {
      const { data: enrolled } = await supabase
        .from("class_members")
        .select("class_id")
        .eq("student_id", user!.id);
      const ids = enrolled?.map((e) => e.class_id) ?? [];
      if (ids.length === 0) {
        setClasses([]);
        setMemberCounts({});
        setLoading(false);
        return;
      }
      query = query.in("id", ids);
    }

    const { data, error } = await query;
    if (error) {
      toast.error(error.message);
    } else {
      const classList = data ?? [];
      setClasses(classList);
      // Fetch member counts — batch
      if (classList.length > 0) {
        const classIds = classList.map((c) => c.id);
        const { data: allMembers } = await supabase
          .from("class_members")
          .select("class_id")
          .in("class_id", classIds);
        const counts: Record<string, number> = {};
        classIds.forEach((id) => { counts[id] = 0; });
        (allMembers ?? []).forEach((m) => { counts[m.class_id] = (counts[m.class_id] || 0) + 1; });
        setMemberCounts(counts);
      } else {
        setMemberCounts({});
      }
    }
    setLoading(false);
  }, [role, user]);

  useEffect(() => {
    if (user) fetchClasses();
  }, [user, fetchClasses]);

  // Create / Edit
  const openCreate = () => {
    setEditingClass(null);
    setFormName("");
    setFormDesc("");
    setDialogOpen(true);
  };

  const openEdit = (c: ClassRow) => {
    setEditingClass(c);
    setFormName(c.name);
    setFormDesc(c.description ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    if (editingClass) {
      const { error } = await supabase
        .from("classes")
        .update({ name: formName.trim(), description: formDesc.trim() || null })
        .eq("id", editingClass.id);
      if (error) toast.error(error.message);
      else toast.success(t.common.save + " ✓");
    } else {
      const { error } = await supabase.from("classes").insert({
        name: formName.trim(),
        description: formDesc.trim() || null,
        teacher_id: user!.id,
      });
      if (error) toast.error(error.message);
      else toast.success(t.common.create + " ✓");
    }
    setSaving(false);
    setDialogOpen(false);
    fetchClasses();
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("classes").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else toast.success(t.common.delete + " ✓");
    setDeleteTarget(null);
    fetchClasses();
  };

  // Load members for a class
  const loadMembers = async (classId: string) => {
    setLoadingMembers(true);
    const { data, error } = await supabase
      .from("class_members")
      .select("id, student_id, joined_at")
      .eq("class_id", classId);
    if (error) {
      toast.error(error.message);
      setLoadingMembers(false);
      return;
    }
    const memberList = data ?? [];
    // Batch fetch profiles
    if (memberList.length > 0) {
      const studentIds = memberList.map((m) => m.student_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", studentIds);
      const profileMap: Record<string, { full_name: string }> = {};
      (profiles ?? []).forEach((p) => { profileMap[p.user_id] = { full_name: p.full_name }; });
      setMembers(memberList.map((m) => ({ ...m, profile: profileMap[m.student_id] ?? null })));
    } else {
      setMembers([]);
    }
    setLoadingMembers(false);
  };

  // Expand/collapse members
  const toggleExpand = async (classId: string) => {
    if (expandedId === classId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(classId);
    await loadMembers(classId);
  };

  // Add student
  const openAddStudent = async (classId: string) => {
    setExpandedId(classId);
    setAddStudentOpen(true);
    setSelectedStudentId("");
    // Fetch students not already in the class
    const { data: currentMembers } = await supabase
      .from("class_members")
      .select("student_id")
      .eq("class_id", classId);
    const existingIds = currentMembers?.map((m) => m.student_id) ?? [];

    const { data: studentRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "student");
    const studentIds = (studentRoles?.map((r) => r.user_id) ?? []).filter(
      (id) => !existingIds.includes(id)
    );

    if (studentIds.length === 0) {
      setAvailableStudents([]);
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", studentIds);
    setAvailableStudents(profiles ?? []);
  };

  const handleAddStudent = async () => {
    if (!selectedStudentId || !expandedId) return;
    const { error } = await supabase.from("class_members").insert({
      class_id: expandedId,
      student_id: selectedStudentId,
    });
    if (error) toast.error(error.message);
    else toast.success(t.classes.addStudent + " ✓");
    setAddStudentOpen(false);
    // Refresh members without collapsing
    if (expandedId) await loadMembers(expandedId);
    fetchClasses();
  };

  const handleRemoveStudent = async (memberId: string) => {
    const { error } = await supabase.from("class_members").delete().eq("id", memberId);
    if (error) toast.error(error.message);
    else toast.success(t.classes.removeStudent + " ✓");
    // Refresh members without collapsing
    if (expandedId) await loadMembers(expandedId);
    fetchClasses();
  };

  const canManage = role === "teacher" || role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t.classes.title}</h1>
        {canManage && (
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t.classes.createNew}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : classes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">{t.classes.noClasses}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Card key={c.id} className="flex flex-col epic-card-hover">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{c.name}</CardTitle>
                    {c.description && (
                      <CardDescription className="line-clamp-2">{c.description}</CardDescription>
                    )}
                  </div>
                  {canManage && (c.teacher_id === user?.id || role === "admin") && (
                    <div className="flex gap-1 ml-2 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(c)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-end gap-3">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="gap-1">
                    <Users className="h-3 w-3" />
                    {memberCounts[c.id] ?? 0} {t.classes.studentCount}
                  </Badge>
                  <div className="flex gap-1">
                    {canManage && (c.teacher_id === user?.id || role === "admin") && (
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => openAddStudent(c.id)}>
                        <UserPlus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => toggleExpand(c.id)}>
                      {expandedId === c.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {expandedId === c.id && (
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-sm font-medium">{t.classes.members}</p>
                    {loadingMembers ? (
                      <p className="text-xs text-muted-foreground">{t.common.loading}</p>
                    ) : members.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t.common.noResults}</p>
                    ) : (
                      members.map((m) => (
                        <div key={m.id} className="flex items-center justify-between text-sm">
                          <span>{m.profile?.full_name || m.student_id.slice(0, 8)}</span>
                          {canManage && (c.teacher_id === user?.id || role === "admin") && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleRemoveStudent(m.id)}>
                              <UserMinus className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingClass ? t.common.edit : t.common.create} — {t.classes.title}</DialogTitle>
            <DialogDescription>{editingClass ? t.common.edit : t.common.create}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t.classes.className}</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={t.classes.className} />
            </div>
            <div className="space-y-2">
              <Label>{t.common.description}</Label>
              <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder={t.common.description} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t.common.cancel}</Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim()}>
              {saving ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.common.confirm}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.common.delete} "{deleteTarget?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t.common.delete}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Student Dialog */}
      <Dialog open={addStudentOpen} onOpenChange={setAddStudentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.classes.addStudent}</DialogTitle>
            <DialogDescription>{t.classes.addStudent}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {availableStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.common.noResults}</p>
            ) : (
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder={t.classes.addStudent} />
                </SelectTrigger>
                <SelectContent>
                  {availableStudents.map((s) => (
                    <SelectItem key={s.user_id} value={s.user_id}>
                      {s.full_name || s.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStudentOpen(false)}>{t.common.cancel}</Button>
            <Button onClick={handleAddStudent} disabled={!selectedStudentId}>{t.common.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
