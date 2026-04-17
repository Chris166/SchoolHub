import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell, FileText, Clock, Star, MessageSquare, Send, CheckCheck,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  reference_id: string | null;
  created_at: string;
}

const typeIcons: Record<string, typeof Bell> = {
  new_assignment: FileText,
  deadline_approaching: Clock,
  grade_posted: Star,
  submission_received: Send,
  comment_added: MessageSquare,
};

export default function Notifications() {
  const { t } = useLanguage();
  const { user } = useAuth();

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setNotifications(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markRead = async (id: string) => {
    const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
    if (error) toast.error(error.message);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unread.length === 0) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .in("id", unread);
    if (error) toast.error(error.message);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    toast.success(t.notifications.markAllRead + " ✓");
  };

  const typeLabel = (type: string): string => {
    const map: Record<string, string> = {
      new_assignment: t.notifications.newAssignment,
      deadline_approaching: t.notifications.deadlineApproaching,
      grade_posted: t.notifications.gradePosted,
      submission_received: t.notifications.submissionReceived,
      comment_added: t.notifications.commentAdded,
    };
    return map[type] ?? type;
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{t.notifications.title}</h1>
          {unreadCount > 0 && (
            <Badge>{unreadCount}</Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" className="gap-2" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4" />
            {t.notifications.markAllRead}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">{t.notifications.noNotifications}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = typeIcons[n.type] ?? Bell;
            return (
              <Card
                key={n.id}
                className={`transition-colors ${!n.read ? "border-primary/50 bg-primary/5" : ""}`}
              >
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 rounded-full p-2 ${!n.read ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{n.title}</span>
                        <Badge variant="outline" className="text-xs">{typeLabel(n.type)}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{n.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.read && (
                      <Button variant="ghost" size="sm" onClick={() => markRead(n.id)}>
                        {t.notifications.markRead}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
