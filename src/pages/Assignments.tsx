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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Plus, Pencil, Trash2, Clock, Send, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow, isPast } from "date-fns";

interface AssignmentRow {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  class_id: string;
  teacher_id: string;
  deadline: string;
  max_score: number;
  grading_criteria: string | null;
  status: "active" | "archived" | "overdue";
  created_at: string;
  class_name?: string;
}

interface ClassOption {
  id: string;
  name: string;
}

export default function Assignments() {
  const { t } = useLanguage();
  const { user, role } = useAuth();

  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active");

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AssignmentRow | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formClassId, setFormClassId] = useState("");
  const [formDeadline, setFormDeadline] = useState("");
  const [formMaxScore, setFormMaxScore] = useState("100");
  const [formCriteria, setFormCriteria] = useState("");
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<AssignmentRow | null>(null);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("assignments")
      .select("*")
      .order("deadline", { ascending: true });

    if (role === "teacher") {
      query = query.eq("teacher_id", user!.id);
    } else if (role === "student") {
      // Get classes the student is in
      const { data: enrolled } = await supabase
        .from("class_members")
        .select("class_id")
        .eq("student_id", user!.id);
      const ids = enrolled?.map((e) => e.class_id) ?? [];
      if (ids.length === 0) {
        setAssignments([]);
        setLoading(false);
        return;
      }
      query = query.in("class_id", ids);
    }

    const { data, error } = await query;
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // Enrich with class name
    const classIds = [...new Set((data ?? []).map((a) => a.class_id))];
    const { data: classData } = await supabase
      .from("classes")
      .select("id, name")
      .in("id", classIds.length > 0 ? classIds : ["__none__"]);
    const classMap: Record<string, string> = {};
    (classData ?? []).forEach((c) => { classMap[c.id] = c.name; });

    const enriched = (data ?? []).map((a) => ({
      ...a,
      class_name: classMap[a.class_id] || "—",
    }));
    setAssignments(enriched);

    // Fetch submission counts — batch
    if (enriched.length > 0) {
      const asgIds = enriched.map((a) => a.id);
      const { data: allSubs } = await supabase
        .from("submissions")
        .select("assignment_id")
        .in("assignment_id", asgIds);
      const counts: Record<string, number> = {};
      asgIds.forEach((id) => { counts[id] = 0; });
      (allSubs ?? []).forEach((s) => { counts[s.assignment_id] = (counts[s.assignment_id] || 0) + 1; });
      setSubmissionCounts(counts);
    } else {
      setSubmissionCounts({});
    }
    setLoading(false);
  }, [role, user]);

  useEffect(() => {
    if (user) fetchAssignments();
  }, [user, fetchAssignments]);

  // Fetch classes for the form
  const fetchClasses = async () => {
    try {
      let query = supabase.from("classes").select("id, name");
      if (role === "teacher") {
        query = query.eq("teacher_id", user!.id);
      }
      const { data } = await query;
      setClasses(data ?? []);
    } catch (err: unknown) {
      console.error("Failed to fetch classes:", err);
      toast.error("Failed to load classes");
    }
  };

  const filtered = assignments.filter((a) => {
    if (tab === "all") return true;
    if (tab === "active") return a.status === "active" && !isPast(new Date(a.deadline));
    if (tab === "overdue") return a.status === "overdue" || (a.status === "active" && isPast(new Date(a.deadline)));
    if (tab === "archived") return a.status === "archived";
    return true;
  });

  const openCreate = () => {
    setEditing(null);
    setFormTitle("");
    setFormDesc("");
    setFormSubject("");
    setFormClassId("");
    setFormDeadline("");
    setFormMaxScore("100");
    setFormCriteria("");
    fetchClasses();
    setDialogOpen(true);
  };

  const openEdit = (a: AssignmentRow) => {
    setEditing(a);
    setFormTitle(a.title);
    setFormDesc(a.description ?? "");
    setFormSubject(a.subject);
    setFormClassId(a.class_id);
    setFormDeadline(a.deadline.slice(0, 16));
    setFormMaxScore(String(a.max_score));
    setFormCriteria(a.grading_criteria ?? "");
    fetchClasses();
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formSubject.trim() || !formClassId || !formDeadline) return;
    setSaving(true);
    const payload = {
      title: formTitle.trim(),
      description: formDesc.trim() || null,
      subject: formSubject.trim(),
      class_id: formClassId,
      deadline: new Date(formDeadline).toISOString(),
      max_score: parseInt(formMaxScore) || 100,
      grading_criteria: formCriteria.trim() || null,
    };

    if (editing) {
      const { error } = await supabase.from("assignments").update(payload).eq("id", editing.id);
      if (error) toast.error(error.message);
      else toast.success(t.common.save + " ✓");
    } else {
      const { error } = await supabase.from("assignments").insert({
        ...payload,
        teacher_id: user!.id,
      });
      if (error) toast.error(error.message);
      else toast.success(t.common.create + " ✓");
    }
    setSaving(false);
    setDialogOpen(false);
    fetchAssignments();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("assignments").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else toast.success(t.common.delete + " ✓");
    setDeleteTarget(null);
    fetchAssignments();
  };

  const statusBadge = (a: AssignmentRow) => {
    const overdue = isPast(new Date(a.deadline)) && a.status === "active";
    if (overdue || a.status === "overdue") return <Badge variant="destructive">{t.assignments.overdue}</Badge>;
    if (a.status === "archived") return <Badge variant="secondary">{t.assignments.archived}</Badge>;
    return <Badge className="bg-green-600 hover:bg-green-700">{t.assignments.active}</Badge>;
  };

  const canManage = role === "teacher" || role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t.assignments.title}</h1>
        {canManage && (
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t.assignments.createNew}
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active">{t.assignments.active}</TabsTrigger>
          <TabsTrigger value="overdue">{t.assignments.overdue}</TabsTrigger>
          <TabsTrigger value="archived">{t.assignments.archived}</TabsTrigger>
          <TabsTrigger value="all">{t.assignments.title}</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">{t.assignments.noAssignments}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <Card key={a.id} className="flex flex-col epic-card-hover">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{a.title}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {a.subject} • {a.class_name}
                    </CardDescription>
                  </div>
                  {canManage && (a.teacher_id === user?.id || role === "admin") && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(a)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-end gap-3">
                {a.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{a.description}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {statusBadge(a)}
                  <Badge variant="outline" className="gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {format(new Date(a.deadline), "dd.MM.yyyy HH:mm")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {isPast(new Date(a.deadline))
                      ? t.assignments.overdue
                      : `${t.assignments.dueIn} ${formatDistanceToNow(new Date(a.deadline))}`}
                  </span>
                  <span className="flex items-center gap-1">
                    <Send className="h-3.5 w-3.5" />
                    {submissionCounts[a.id] ?? 0} {t.assignments.submittedCount}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t.common.edit : t.common.create} — {t.assignments.title}</DialogTitle>
            <DialogDescription>{editing ? t.common.edit : t.assignments.createNew}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>{t.common.name}</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder={t.common.name} />
            </div>
            <div className="space-y-2">
              <Label>{t.common.description}</Label>
              <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder={t.common.description} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.assignments.subject}</Label>
                <Input value={formSubject} onChange={(e) => setFormSubject(e.target.value)} placeholder={t.assignments.subject} />
              </div>
              <div className="space-y-2">
                <Label>{t.assignments.class}</Label>
                <Select value={formClassId} onValueChange={setFormClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.assignments.class} />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.assignments.deadline}</Label>
                <Input type="datetime-local" value={formDeadline} onChange={(e) => setFormDeadline(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t.assignments.maxScore}</Label>
                <Input type="number" value={formMaxScore} onChange={(e) => setFormMaxScore(e.target.value)} min="1" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t.assignments.gradingCriteria}</Label>
              <Textarea value={formCriteria} onChange={(e) => setFormCriteria(e.target.value)} placeholder={t.assignments.gradingCriteria} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t.common.cancel}</Button>
            <Button onClick={handleSave} disabled={saving || !formTitle.trim() || !formSubject.trim() || !formClassId || !formDeadline}>
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
              {t.common.delete} "{deleteTarget?.title}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t.common.delete}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
