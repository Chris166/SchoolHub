import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Send, Users, GraduationCap, CalendarDays, BarChart3, Clock } from "lucide-react";
import { format, formatDistanceToNow, isPast } from "date-fns";

interface DeadlineItem {
  id: string;
  title: string;
  deadline: string;
  subject: string;
}

interface GradeItem {
  score: number;
  max_score: number;
  assignment_title: string;
  graded_at: string;
}

export default function Dashboard() {
  const { profile, role, user } = useAuth();
  const { t } = useLanguage();

  const [stats, setStats] = useState<{ label: string; value: string | number; icon: typeof FileText }[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [grades, setGrades] = useState<GradeItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      if (role === "admin") {
        const [usersRes, classesRes, assignmentsRes] = await Promise.all([
          supabase.from("profiles").select("*", { count: "exact", head: true }),
          supabase.from("classes").select("*", { count: "exact", head: true }),
          supabase.from("assignments").select("*", { count: "exact", head: true }),
        ]);
        setStats([
          { label: t.dashboard.totalUsers, value: usersRes.count ?? 0, icon: Users },
          { label: t.dashboard.totalClasses, value: classesRes.count ?? 0, icon: GraduationCap },
          { label: t.dashboard.totalAssignments, value: assignmentsRes.count ?? 0, icon: FileText },
        ]);

        // Recent deadlines
        const { data: recentAsgs } = await supabase
          .from("assignments")
          .select("id, title, deadline, subject")
          .gte("deadline", new Date().toISOString())
          .order("deadline", { ascending: true })
          .limit(5);
        setDeadlines(recentAsgs ?? []);
      } else if (role === "teacher") {
        const [activeRes, classesRes] = await Promise.all([
          supabase.from("assignments").select("*", { count: "exact", head: true }).eq("teacher_id", user.id).eq("status", "active"),
          supabase.from("classes").select("*", { count: "exact", head: true }).eq("teacher_id", user.id),
        ]);

        // Count pending (ungraded) submissions
        const { data: teacherAsgs } = await supabase.from("assignments").select("id").eq("teacher_id", user.id);
        const asgIds = (teacherAsgs ?? []).map((a) => a.id);
        let pendingCount = 0;
        let studentCount = 0;
        if (asgIds.length > 0) {
          const { count } = await supabase
            .from("submissions")
            .select("*", { count: "exact", head: true })
            .in("assignment_id", asgIds)
            .in("status", ["submitted", "late"]);
          pendingCount = count ?? 0;
        }
        // Count unique students
        const { data: classIds } = await supabase.from("classes").select("id").eq("teacher_id", user.id);
        if (classIds && classIds.length > 0) {
          const { count } = await supabase
            .from("class_members")
            .select("*", { count: "exact", head: true })
            .in("class_id", classIds.map((c) => c.id));
          studentCount = count ?? 0;
        }

        setStats([
          { label: t.dashboard.activeAssignments, value: activeRes.count ?? 0, icon: FileText },
          { label: t.dashboard.pendingSubmissions, value: pendingCount, icon: Send },
          { label: t.dashboard.totalStudents, value: studentCount, icon: Users },
          { label: t.dashboard.totalClasses, value: classesRes.count ?? 0, icon: GraduationCap },
        ]);

        // Teacher deadlines
        const { data: teacherDeadlines } = await supabase
          .from("assignments")
          .select("id, title, deadline, subject")
          .eq("teacher_id", user.id)
          .gte("deadline", new Date().toISOString())
          .order("deadline", { ascending: true })
          .limit(5);
        setDeadlines(teacherDeadlines ?? []);
      } else {
        // Student
        const { data: enrolled } = await supabase.from("class_members").select("class_id").eq("student_id", user.id);
        const classIds = enrolled?.map((e) => e.class_id) ?? [];

        let activeCount = 0;
        let upcomingCount = 0;
        const deadlineItems: DeadlineItem[] = [];

        if (classIds.length > 0) {
          const { data: asgs } = await supabase
            .from("assignments")
            .select("id, title, deadline, subject")
            .in("class_id", classIds)
            .eq("status", "active")
            .order("deadline", { ascending: true });

          activeCount = asgs?.length ?? 0;
          const upcoming = (asgs ?? []).filter((a) => !isPast(new Date(a.deadline)));
          upcomingCount = upcoming.length;
          deadlineItems.push(...upcoming.slice(0, 5));
        }

        // Recent grades — batch fetch
        const { data: subs } = await supabase
          .from("submissions")
          .select("id, assignment_id")
          .eq("student_id", user.id)
          .eq("status", "graded")
          .order("updated_at", { ascending: false })
          .limit(5);

        const subsList = subs ?? [];
        const gradeItems: GradeItem[] = [];
        if (subsList.length > 0) {
          const subIds = subsList.map((s) => s.id);
          const asgIds = [...new Set(subsList.map((s) => s.assignment_id))];

          const [gradesRes, asgsRes] = await Promise.all([
            supabase.from("grades").select("submission_id, score, created_at").in("submission_id", subIds),
            supabase.from("assignments").select("id, title, max_score").in("id", asgIds),
          ]);

          const gradesMap: Record<string, { score: number; created_at: string }> = {};
          (gradesRes.data ?? []).forEach((g) => {
            if (!gradesMap[g.submission_id]) gradesMap[g.submission_id] = g;
          });
          const asgMap: Record<string, { title: string; max_score: number }> = {};
          (asgsRes.data ?? []).forEach((a) => { asgMap[a.id] = a; });

          for (const s of subsList) {
            const gr = gradesMap[s.id];
            const asg = asgMap[s.assignment_id];
            if (gr && asg) {
              gradeItems.push({
                score: gr.score,
                max_score: asg.max_score,
                assignment_title: asg.title,
                graded_at: gr.created_at,
              });
            }
          }
        }
        setGrades(gradeItems);

        setStats([
          { label: t.dashboard.activeAssignments, value: activeCount, icon: FileText },
          { label: t.dashboard.upcomingDeadlines, value: upcomingCount, icon: CalendarDays },
          { label: t.dashboard.recentGrades, value: gradeItems.length, icon: BarChart3 },
        ]);
        setDeadlines(deadlineItems);
      }
    } catch (err: unknown) {
      console.error("Dashboard error:", err);
    }
    setLoading(false);
  }, [user, role, t]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t.dashboard.welcome}, {profile?.full_name || "—"}
        </h1>
        <p className="text-muted-foreground">{t.dashboard.overview}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="epic-card-hover">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="epic-card-hover">
          <CardHeader>
            <CardTitle className="text-lg">{t.dashboard.upcomingDeadlines}</CardTitle>
          </CardHeader>
          <CardContent>
            {deadlines.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.dashboard.noUpcoming}</p>
            ) : (
              <div className="space-y-3">
                {deadlines.map((d) => (
                  <div key={d.id} className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{d.title}</p>
                      <p className="text-xs text-muted-foreground">{d.subject}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(d.deadline), "dd.MM")}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(d.deadline), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="epic-card-hover">
          <CardHeader>
            <CardTitle className="text-lg">{t.dashboard.recentGrades}</CardTitle>
          </CardHeader>
          <CardContent>
            {grades.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.dashboard.noRecentGrades}</p>
            ) : (
              <div className="space-y-3">
                {grades.map((g, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <p className="text-sm font-medium">{g.assignment_title}</p>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-600">{g.score}/{g.max_score}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(g.graded_at), "dd.MM")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
