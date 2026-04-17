import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Send, FileText, Link2, Star, MessageSquare, History, Upload, Eye } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface SubmissionRow {
  id: string;
  assignment_id: string;
  student_id: string;
  content_text: string | null;
  file_url: string | null;
  link_url: string | null;
  version: number;
  status: "submitted" | "late" | "graded" | "returned";
  submitted_at: string;
  assignment_title?: string;
  assignment_max_score?: number;
  student_name?: string;
  grade?: { score: number; comment: string | null } | null;
}

interface AssignmentOption {
  id: string;
  title: string;
  class_id: string;
  max_score: number;
}

export default function Submissions() {
  const { t } = useLanguage();
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Submit work dialog
  const [submitOpen, setSubmitOpen] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [contentText, setContentText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Grade dialog (teacher)
  const [gradeOpen, setGradeOpen] = useState(false);
  const [gradeTarget, setGradeTarget] = useState<SubmissionRow | null>(null);
  const [gradeScore, setGradeScore] = useState("");
  const [gradeComment, setGradeComment] = useState("");
  const [gradeSaving, setGradeSaving] = useState(false);

  // Filter assignment (teacher)
  const [filterAssignment, setFilterAssignment] = useState("all");
  const [teacherAssignments, setTeacherAssignments] = useState<AssignmentOption[]>([]);

  // Version history dialog
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<SubmissionRow[]>([]);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);

    if (role === "student") {
      const { data, error } = await supabase
        .from("submissions")
        .select("*")
        .eq("student_id", user!.id)
        .order("submitted_at", { ascending: false });
      if (error) { toast.error(error.message); setLoading(false); return; }

      // Enrich with assignment info and grades — batch
      const subsList = data ?? [];
      let enriched: SubmissionRow[] = subsList.map((s) => ({ ...s, assignment_title: "—", assignment_max_score: 100, grade: null }));
      if (subsList.length > 0) {
        const asgIds = [...new Set(subsList.map((s) => s.assignment_id))];
        const subIds = subsList.map((s) => s.id);

        const [asgsRes, gradesRes] = await Promise.all([
          supabase.from("assignments").select("id, title, max_score").in("id", asgIds),
          supabase.from("grades").select("submission_id, score, comment").in("submission_id", subIds),
        ]);

        const asgMap: Record<string, { title: string; max_score: number }> = {};
        (asgsRes.data ?? []).forEach((a) => { asgMap[a.id] = a; });
        const gradeMap: Record<string, { score: number; comment: string | null }> = {};
        (gradesRes.data ?? []).forEach((g) => { if (!gradeMap[g.submission_id]) gradeMap[g.submission_id] = g; });

        enriched = subsList.map((s) => ({
          ...s,
          assignment_title: asgMap[s.assignment_id]?.title ?? "—",
          assignment_max_score: asgMap[s.assignment_id]?.max_score ?? 100,
          grade: gradeMap[s.id] ?? null,
        }));
      }
      setSubmissions(enriched);
    } else if (role === "teacher") {
      // Get teacher's assignments
      const { data: teacherAsgs } = await supabase
        .from("assignments")
        .select("id, title, class_id, max_score")
        .eq("teacher_id", user!.id);
      setTeacherAssignments(teacherAsgs ?? []);

      const asgIds = (teacherAsgs ?? []).map((a) => a.id);
      if (asgIds.length === 0) { setSubmissions([]); setLoading(false); return; }

      let query = supabase
        .from("submissions")
        .select("*")
        .in("assignment_id", asgIds)
        .order("submitted_at", { ascending: false });
      if (filterAssignment !== "all") {
        query = query.eq("assignment_id", filterAssignment);
      }

      const { data, error } = await query;
      if (error) { toast.error(error.message); setLoading(false); return; }

      const asgMap: Record<string, { title: string; max_score: number }> = {};
      (teacherAsgs ?? []).forEach((a) => { asgMap[a.id] = { title: a.title, max_score: a.max_score }; });

      // Enrich with student names and grades — batch
      const subsList = data ?? [];
      let enriched: SubmissionRow[] = [];
      if (subsList.length > 0) {
        const studentIds = [...new Set(subsList.map((s) => s.student_id))];
        const subIds = subsList.map((s) => s.id);

        const [profilesRes, gradesRes] = await Promise.all([
          supabase.from("profiles").select("user_id, full_name").in("user_id", studentIds),
          supabase.from("grades").select("submission_id, score, comment").in("submission_id", subIds),
        ]);

        const profileMap: Record<string, string> = {};
        (profilesRes.data ?? []).forEach((p) => { profileMap[p.user_id] = p.full_name; });
        const gradeMap: Record<string, { score: number; comment: string | null }> = {};
        (gradesRes.data ?? []).forEach((g) => { if (!gradeMap[g.submission_id]) gradeMap[g.submission_id] = g; });

        enriched = subsList.map((s) => ({
          ...s,
          assignment_title: asgMap[s.assignment_id]?.title ?? "—",
          assignment_max_score: asgMap[s.assignment_id]?.max_score ?? 100,
          student_name: profileMap[s.student_id] ?? s.student_id.slice(0, 8),
          grade: gradeMap[s.id] ?? null,
        }));
      }
      setSubmissions(enriched);
    } else {
      // Admin: all submissions
      const { data, error } = await supabase
        .from("submissions")
        .select("*")
        .order("submitted_at", { ascending: false })
        .limit(50);
      if (error) { toast.error(error.message); setLoading(false); return; }
      setSubmissions((data ?? []).map((s) => ({ ...s, assignment_title: "—" })));
    }

    setLoading(false);
  }, [role, user, filterAssignment]);

  useEffect(() => {
    if (user) fetchSubmissions();
  }, [user, fetchSubmissions]);

  // Open submit dialog (student)
  const openSubmit = async (resubmitAssignmentId?: string) => {
    setContentText("");
    setLinkUrl("");
    setFile(null);
    setSelectedAssignment(resubmitAssignmentId ?? "");
    // Fetch assignments student can submit to
    const { data: enrolled } = await supabase
      .from("class_members").select("class_id").eq("student_id", user!.id);
    const classIds = enrolled?.map((e) => e.class_id) ?? [];
    if (classIds.length > 0) {
      const { data: asgs } = await supabase
        .from("assignments")
        .select("id, title, class_id, max_score")
        .in("class_id", classIds)
        .eq("status", "active");
      setAssignments(asgs ?? []);
    }
    setSubmitOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedAssignment) return;
    setSubmitting(true);

    // Determine version
    const { data: existing } = await supabase
      .from("submissions")
      .select("version")
      .eq("assignment_id", selectedAssignment)
      .eq("student_id", user!.id)
      .order("version", { ascending: false })
      .limit(1);
    const nextVersion = (existing && existing.length > 0) ? existing[0].version + 1 : 1;

    let fileUrl: string | null = null;
    if (file) {
      const path = `${user!.id}/${selectedAssignment}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("submissions").upload(path, file);
      if (uploadErr) {
        toast.error(uploadErr.message);
        setSubmitting(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(path);
      fileUrl = urlData.publicUrl;
    }

    const { error } = await supabase.from("submissions").insert({
      assignment_id: selectedAssignment,
      student_id: user!.id,
      content_text: contentText.trim() || null,
      file_url: fileUrl,
      link_url: linkUrl.trim() || null,
      version: nextVersion,
    });

    if (error) toast.error(error.message);
    else toast.success(t.common.submit + " ✓");
    setSubmitting(false);
    setSubmitOpen(false);
    fetchSubmissions();
  };

  // Grade dialog (teacher)
  const openGrade = (s: SubmissionRow) => {
    setGradeTarget(s);
    setGradeScore(s.grade?.score?.toString() ?? "");
    setGradeComment(s.grade?.comment ?? "");
    setGradeOpen(true);
  };

  const handleGrade = async () => {
    if (!gradeTarget || !gradeScore) return;
    setGradeSaving(true);

    // Check if grade already exists
    const { data: existingGrade } = await supabase
      .from("grades")
      .select("id")
      .eq("submission_id", gradeTarget.id)
      .limit(1);

    if (existingGrade && existingGrade.length > 0) {
      const { error } = await supabase.from("grades").update({
        score: parseInt(gradeScore),
        comment: gradeComment.trim() || null,
      }).eq("id", existingGrade[0].id);
      if (error) toast.error(error.message);
      else toast.success(t.common.save + " ✓");
    } else {
      const { error } = await supabase.from("grades").insert({
        submission_id: gradeTarget.id,
        teacher_id: user!.id,
        score: parseInt(gradeScore),
        comment: gradeComment.trim() || null,
      });
      if (error) toast.error(error.message);
      else toast.success(t.grades.addGrade + " ✓");
    }

    // Update submission status
    await supabase.from("submissions").update({ status: "graded" }).eq("id", gradeTarget.id);

    setGradeSaving(false);
    setGradeOpen(false);
    fetchSubmissions();
  };

  // Version history
  const openHistory = async (assignmentId: string, studentId: string) => {
    const { data } = await supabase
      .from("submissions")
      .select("*")
      .eq("assignment_id", assignmentId)
      .eq("student_id", studentId)
      .order("version", { ascending: false });

    const subsList = data ?? [];
    if (subsList.length > 0) {
      const subIds = subsList.map((s) => s.id);
      const { data: gradesData } = await supabase
        .from("grades")
        .select("submission_id, score, comment")
        .in("submission_id", subIds);
      const gradeMap: Record<string, { score: number; comment: string | null }> = {};
      (gradesData ?? []).forEach((g) => { if (!gradeMap[g.submission_id]) gradeMap[g.submission_id] = g; });
      setHistoryItems(subsList.map((s) => ({ ...s, grade: gradeMap[s.id] ?? null })));
    } else {
      setHistoryItems([]);
    }
    setHistoryOpen(true);
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      submitted: "bg-blue-600 hover:bg-blue-700",
      late: "bg-orange-600 hover:bg-orange-700",
      graded: "bg-green-600 hover:bg-green-700",
      returned: "bg-purple-600 hover:bg-purple-700",
    };
    const labels: Record<string, string> = {
      submitted: t.submissions.submitted,
      late: t.submissions.late,
      graded: t.submissions.graded,
      returned: t.submissions.returned,
    };
    return <Badge className={variants[status] ?? ""}>{labels[status] ?? status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t.submissions.title}</h1>
        <div className="flex gap-2">
          {role === "teacher" && teacherAssignments.length > 0 && (
            <Select value={filterAssignment} onValueChange={setFilterAssignment}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.assignments.title}</SelectItem>
                {teacherAssignments.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {role === "student" && (
            <Button className="gap-2" onClick={() => openSubmit()}>
              <Send className="h-4 w-4" />
              {t.submissions.submitWork}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : submissions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">{t.submissions.noSubmissions}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <Card key={s.id} className="epic-card-hover">
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{s.assignment_title}</span>
                      {statusBadge(s.status)}
                      <Badge variant="outline">{t.submissions.version} {s.version}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      {s.student_name && <span>{s.student_name}</span>}
                      <span>{format(new Date(s.submitted_at), "dd.MM.yyyy HH:mm")}</span>
                      {s.content_text && (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" /> {t.submissions.contentText}
                        </span>
                      )}
                      {s.file_url && (
                        <a href={s.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                          <Upload className="h-3 w-3" /> {t.submissions.fileUpload}
                        </a>
                      )}
                      {s.link_url && (
                        <a href={s.link_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                          <Link2 className="h-3 w-3" /> Link
                        </a>
                      )}
                    </div>
                    {s.grade && (
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className="bg-green-600 gap-1">
                          <Star className="h-3 w-3" />
                          {s.grade.score}/{s.assignment_max_score ?? 100}
                        </Badge>
                        {s.grade.comment && (
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" /> {s.grade.comment}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="default" size="sm" className="gap-1" onClick={() => navigate(`/submissions/${s.id}`)}>
                      <Eye className="h-3.5 w-3.5" />
                      Детайли
                    </Button>
                    {role === "teacher" && (
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => openGrade(s)}>
                        <Star className="h-3.5 w-3.5" />
                        {t.grades.grade}
                      </Button>
                    )}
                    {role === "student" && (
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => openSubmit(s.assignment_id)}>
                        {t.submissions.resubmit}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => openHistory(s.assignment_id, s.student_id)}>
                      <History className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Submit Work Dialog */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.submissions.submitWork}</DialogTitle>
            <DialogDescription>{t.submissions.submitWork}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t.assignments.title}</Label>
              <Select value={selectedAssignment} onValueChange={setSelectedAssignment}>
                <SelectTrigger>
                  <SelectValue placeholder={t.assignments.title} />
                </SelectTrigger>
                <SelectContent>
                  {assignments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.submissions.contentText}</Label>
              <Textarea value={contentText} onChange={(e) => setContentText(e.target.value)} placeholder={t.submissions.contentText} rows={4} />
            </div>
            <div className="space-y-2">
              <Label>{t.submissions.fileUpload}</Label>
              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-2">
              <Label>{t.submissions.linkUrl}</Label>
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>{t.common.cancel}</Button>
            <Button onClick={handleSubmit} disabled={submitting || !selectedAssignment}>
              {submitting ? t.common.loading : t.common.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grade Dialog */}
      <Dialog open={gradeOpen} onOpenChange={setGradeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.grades.addGrade}</DialogTitle>
            <DialogDescription>{t.grades.grade}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {gradeTarget?.content_text && (
              <div className="space-y-1">
                <Label>{t.submissions.contentText}</Label>
                <p className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">{gradeTarget.content_text}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t.grades.score} (max: {gradeTarget?.assignment_max_score ?? 100})</Label>
              <Input type="number" value={gradeScore} onChange={(e) => setGradeScore(e.target.value)} min="0" max={gradeTarget?.assignment_max_score ?? 100} />
            </div>
            <div className="space-y-2">
              <Label>{t.grades.comment}</Label>
              <Textarea value={gradeComment} onChange={(e) => setGradeComment(e.target.value)} placeholder={t.grades.comment} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGradeOpen(false)}>{t.common.cancel}</Button>
            <Button onClick={handleGrade} disabled={gradeSaving || !gradeScore}>
              {gradeSaving ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.submissions.viewHistory}</DialogTitle>
            <DialogDescription>{t.submissions.viewHistory}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[50vh] overflow-y-auto">
            {historyItems.map((h) => (
              <div key={h.id} className="border rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{t.submissions.version} {h.version}</Badge>
                  {statusBadge(h.status)}
                  <span className="text-xs text-muted-foreground">{format(new Date(h.submitted_at), "dd.MM.yyyy HH:mm")}</span>
                </div>
                {h.content_text && <p className="text-sm truncate">{h.content_text}</p>}
                {h.grade && (
                  <Badge className="bg-green-600 gap-1">
                    <Star className="h-3 w-3" /> {h.grade.score}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
