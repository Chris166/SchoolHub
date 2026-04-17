import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UserCog } from "lucide-react";

export default function Settings() {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setAvatarUrl(profile.avatar_url || "");
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          avatar_url: avatarUrl || null,
        })
        .eq("user_id", user.id);

      if (error) throw error;
      
      toast.success(t.settings.success);
      // Wait for auth context to potentially refresh or force a reload if needed, 
      // but usually the onAuthStateChange doesn't fire on profile update.
      // Small trick: window reload to refresh profile in auth context since we don't have a direct setter
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      console.error(err);
      toast.error(t.settings.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 border-b pb-4">
        <UserCog className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.settings.title}</h1>
          <p className="text-muted-foreground">{t.settings.profile}</p>
        </div>
      </div>

      <Card className="epic-card-hover border-primary/20">
        <form onSubmit={handleSave}>
          <CardHeader>
            <CardTitle>{t.settings.profile}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t.settings.fullName}</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avatarUrl">{t.settings.avatarUrl}</Label>
              <Input
                id="avatarUrl"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.png"
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? t.common.loading : t.settings.updateProfile}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
