import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, Link2, Upload, Star, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function SubmissionDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user, role } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<any>(null);
  const [assignment, setAssignment] = useState<any>(null);
  const [student, setStudent] = useState<any>(null);
  
  const [gradeScore, setGradeScore] = useState("");
  const [gradeComment, setGradeComment] = useState("");
  const [existingGradeId, setExistingGradeId] = useState<string | null>(null);
  const [gradeSaving, setGradeSaving] = useState(false);

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    // Fetch submission
    const { data: subData, error: subError } = await supabase
      .from("submissions")
      .select("*")
      .eq("id", id)
      .single();

    if (subError || !subData) {
      toast.error(subError?.message || "Неуспешно зареждане на предаването");
      navigate("/submissions");
      return;
    }
    setSubmission(subData);

    // Fetch assignment
    const { data: asgData } = await supabase
      .from("assignments")
      .select("*")
      .eq("id", subData.assignment_id)
      .single();
    if (asgData) setAssignment(asgData);

    // Fetch student profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", subData.student_id)
      .single();
    if (profileData) setStudent(profileData);

    // Fetch grade
    const { data: gradeData } = await supabase
      .from("grades")
      .select("*")
      .eq("submission_id", id)
      .single();
    
    if (gradeData) {
      setExistingGradeId(gradeData.id);
      setGradeScore(gradeData.score.toString());
      setGradeComment(gradeData.comment || "");
    }

    setLoading(false);
  }, [id, navigate]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleGrade = async () => {
    if (!gradeScore) return;
    setGradeSaving(true);

    if (existingGradeId) {
      const { error } = await supabase.from("grades").update({
        score: parseInt(gradeScore),
        comment: gradeComment.trim() || null,
      }).eq("id", existingGradeId);
      
      if (error) toast.error(error.message);
      else toast.success(t.common.save + " ✓");
    } else {
      const { error } = await supabase.from("grades").insert({
        submission_id: id,
        teacher_id: user!.id,
        score: parseInt(gradeScore),
        comment: gradeComment.trim() || null,
      });
      if (error) toast.error(error.message);
      else toast.success(t.grades.addGrade + " ✓");
    }

    await supabase.from("submissions").update({ status: "graded" }).eq("id", id);
    setGradeSaving(false);
    fetchDetails(); // refresh
  };

  const handleReturn = async () => {
    setGradeSaving(true);
    const { error } = await supabase.from("submissions").update({ status: "returned" }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Върнато за корекция.");
    setGradeSaving(false);
    fetchDetails();
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      submitted: "bg-blue-600",
      late: "bg-orange-600",
      graded: "bg-green-600",
      returned: "bg-purple-600",
    };
    const labels: Record<string, string> = {
      submitted: t.submissions.submitted || "Предадено",
      late: t.submissions.late || "Закъсняло",
      graded: t.submissions.graded || "Оценено",
      returned: t.submissions.returned || "Върнато",
    };
    return <Badge className={variants[status] || ""}>{labels[status] || status}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex justify-center flex-col items-center py-20 gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <p className="text-muted-foreground">{t.common.loading}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Button variant="ghost" className="gap-2 -ml-4" onClick={() => navigate("/submissions")}>
        <ArrowLeft className="h-4 w-4" />
        {t.common.back}
      </Button>

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Детайли по предаването</h1>
        <p className="text-muted-foreground">
          {assignment?.title} • {student?.full_name || "Неизвестен ученик"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="epic-card-hover border-border border-opacity-50 shadow-sm">
            <CardHeader className="bg-muted/30 pb-4 border-b">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Информация</CardTitle>
                <div className="flex items-center gap-2">
                  {statusBadge(submission?.status)}
                  <Badge variant="outline">Версия {submission?.version}</Badge>
                </div>
              </div>
              <CardDescription>
                Предадено на: {submission?.submitted_at ? format(new Date(submission.submitted_at), "dd.MM.yyyy HH:mm") : "-"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {submission?.content_text && (
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" /> {t.submissions.contentText}
                  </h3>
                  <div className="p-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap leading-relaxed border border-border/50">
                    {submission.content_text}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4">
                {submission?.file_url && (
                  <div className="flex-1 space-y-2">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Upload className="h-4 w-4 text-primary" /> Прикачен файл
                    </h3>
                    <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3 bg-background" asChild>
                      <a href={submission.file_url} target="_blank" rel="noreferrer" className="truncate">
                        Сваляне на файла
                      </a>
                    </Button>
                  </div>
                )}

                {submission?.link_url && (
                  <div className="flex-1 space-y-2">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-primary" /> Външна връзка
                    </h3>
                    <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3 bg-background" asChild>
                      <a href={submission.link_url} target="_blank" rel="noreferrer" className="truncate">
                        {submission.link_url}
                      </a>
                    </Button>
                  </div>
                )}
              </div>

              {!submission?.content_text && !submission?.file_url && !submission?.link_url && (
                <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                  Няма добавено съдържание
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-20 border-primary/20 shadow-md">
            <CardHeader className="bg-primary/5 border-b border-primary/10">
              <CardTitle className="text-lg flex items-center gap-2">
                <Star className="h-5 w-5 text-primary" /> 
                {role === "teacher" ? "Оценяване" : "Оценка"}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {role === "teacher" || role === "admin" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="score" className="text-sm font-medium">
                      {t.grades.score} <span className="text-muted-foreground text-xs font-normal">(макс. {assignment?.max_score || 100})</span>
                    </Label>
                    <Input 
                      id="score"
                      type="number" 
                      className="bg-background text-lg py-6"
                      value={gradeScore} 
                      onChange={(e) => setGradeScore(e.target.value)} 
                      min="0" 
                      max={assignment?.max_score || 100} 
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="comment">{t.grades.comment}</Label>
                    <Textarea 
                      id="comment"
                      className="resize-none min-h-[120px] bg-background"
                      value={gradeComment} 
                      onChange={(e) => setGradeComment(e.target.value)} 
                      placeholder="Въведете вашия коментар към работата..." 
                    />
                  </div>
                  <div className="pt-2 flex flex-col gap-2">
                    <Button 
                      className="w-full py-6 text-md font-semibold" 
                      onClick={handleGrade} 
                      disabled={gradeSaving || !gradeScore}
                    >
                      {gradeSaving ? t.common.loading : (existingGradeId ? t.common.save : t.grades.addGrade)}
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={handleReturn}
                      disabled={gradeSaving || submission?.status === 'returned'}
                    >
                      Върни за корекция
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  {existingGradeId ? (
                    <>
                      <div className="flex flex-col items-center justify-center p-6 bg-green-500/10 rounded-xl border border-green-500/20">
                        <span className="text-4xl font-bold text-green-600 dark:text-green-500 mb-1">
                          {gradeScore}<span className="text-lg text-muted-foreground font-medium">/{assignment?.max_score || 100}</span>
                        </span>
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">Точки</span>
                      </div>
                      {gradeComment && (
                        <div className="bg-muted/50 p-4 rounded-lg border space-y-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" /> Коментар
                          </span>
                          <p className="text-sm whitespace-pre-wrap">{gradeComment}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                      Все още няма поставена оценка.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
