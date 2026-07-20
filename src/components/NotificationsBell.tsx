import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { Bell, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

type Notification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  kind: string;
  read_at: string | null;
  created_at: string;
};

export function NotificationsBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const initialLoad = useRef(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (!cancelled && data) setItems(data as Notification[]);
      initialLoad.current = false;
    };
    void load();

    const channel = supabase
      .channel(`notif:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          void load();
          if (payload.eventType === "INSERT" && !initialLoad.current) {
            const n = payload.new as Notification;
            toast(n.title, {
              description: n.body ?? undefined,
              action: n.link
                ? {
                    label: "Abrir",
                    onClick: () => {
                      void supabase
                        .from("notifications")
                        .update({ read_at: new Date().toISOString() })
                        .eq("id", n.id);
                      router.navigate({ to: n.link! });
                    },
                  }
                : undefined,
            });
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, router]);

  const unread = items.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null)
      .eq("user_id", user.id);
  };

  const markOne = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };

  const remove = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="font-medium text-sm">Notificações</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
              <Check className="h-3 w-3 mr-1" /> Marcar tudo lido
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Sem notificações.</p>
          )}
          {items.map((n) => {
            const inner = (
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${n.read_at ? "text-muted-foreground" : "font-medium"}`}>{n.title}</p>
                {n.body && <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: pt })}
                </p>
              </div>
            );
            return (
              <div
                key={n.id}
                className={`flex items-start gap-2 px-3 py-2 border-b last:border-0 hover:bg-muted/50 ${
                  !n.read_at ? "bg-primary/5" : ""
                }`}
              >
                {n.link ? (
                  <Link
                    to={n.link}
                    className="flex-1 min-w-0"
                    onClick={() => {
                      setOpen(false);
                      if (!n.read_at) void markOne(n.id);
                    }}
                  >
                    {inner}
                  </Link>
                ) : (
                  <button
                    className="flex-1 min-w-0 text-left"
                    onClick={() => !n.read_at && markOne(n.id)}
                  >
                    {inner}
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => remove(n.id)}
                  aria-label="Remover"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
