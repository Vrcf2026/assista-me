import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

export function PushToggle() {
  const { status, subscribe, unsubscribe } = usePushNotifications();

  if (status === "unsupported") return null;
  if (status === "loading") return (
    <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
      <Loader2 className="h-4 w-4 animate-spin" />
    </Button>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${status === "granted" ? "text-primary" : "text-muted-foreground"}`}
            onClick={status === "granted" ? unsubscribe : subscribe}
          >
            {status === "granted"
              ? <BellRing className="h-4 w-4" />
              : status === "denied"
              ? <BellOff className="h-4 w-4" />
              : <Bell className="h-4 w-4" />
            }
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {status === "granted"
            ? "Notificações push activas — clica para desactivar"
            : status === "denied"
            ? "Notificações bloqueadas (activa nas definições do browser)"
            : "Activar notificações push"
          }
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
