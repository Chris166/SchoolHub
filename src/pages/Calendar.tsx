import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { FileText, Clock } from "lucide-react";
import { format, isSameDay, isPast } from "date-fns";

interface AssignmentDeadline {
  id: string;
  title: string;
  subject: string;
  deadline: string;
  status: string;
}

export default function CalendarPage() {
  const { t } = useLanguage();
  const { user, role } = useAuth();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [assignments, setAssignments] = useState<AssignmentDeadline[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssignments = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase
      .from("assignments")
      .select("id, title, subject, deadline, status")
      .order("deadline", { ascending: true });

    if (role === "teacher") {
      query = query.eq("teacher_id", user.id);
    } else if (role === "student") {
      const { data: enrolled } = await supabase
        .from("class_members")
        .select("class_id")
        .eq("student_id", user.id);
      const classIds = enrolled?.map((e) => e.class_id) ?? [];
      if (classIds.length === 0) {
        setAssignments([]);
        setLoading(false);
        return;
      }
      query = query.in("class_id", classIds);
    }

    const { data } = await query;
    setAssignments(data ?? []);
    setLoading(false);
  }, [user, role]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const selectedDayAssignments = assignments.filter((a) =>
    isSameDay(new Date(a.deadline), selectedDate)
  );

  // Dates that have assignments
  const deadlineDates = assignments.map((a) => new Date(a.deadline));

  const modifiers = {
    hasDeadline: deadlineDates,
  };

  const modifiersStyles = {
    hasDeadline: {
      fontWeight: "bold" as const,
      backgroundColor: "hsl(var(--primary) / 0.15)",
      borderRadius: "50%",
    },
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t.calendar.title}</h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[auto_1fr]">
          <Card className="w-fit">
            <CardContent className="p-3">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                modifiers={modifiers}
                modifiersStyles={modifiersStyles}
                className="rounded-md"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                {format(selectedDate, "dd.MM.yyyy")}
                {isSameDay(selectedDate, new Date()) && (
                  <Badge variant="secondary">{t.calendar.today}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDayAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.calendar.noEvents}</p>
              ) : (
                <div className="space-y-3">
                  {selectedDayAssignments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between border rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-medium">{a.title}</p>
                          <p className="text-sm text-muted-foreground">{a.subject}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={isPast(new Date(a.deadline)) ? "destructive" : "default"}>
                          {format(new Date(a.deadline), "HH:mm")}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
