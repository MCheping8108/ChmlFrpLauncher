import { useEffect, useRef } from "react";
import { autoStartTunnelsService } from "@/services/autoStartTunnelsService";
import { getStoredUser } from "@/services/api";
import type { UnifiedTunnel } from "../types";

interface UseAutoStartTunnelsProps {
  tunnels: UnifiedTunnel[];
  loading: boolean;
  runningTunnels: Set<string>;
  onToggle: (tunnel: UnifiedTunnel, enabled: boolean) => void;
}

export function useAutoStartTunnels({
  tunnels,
  loading,
  runningTunnels,
  onToggle,
}: UseAutoStartTunnelsProps) {
  const hasAutoStartedRef = useRef(false);
  const tunnelsRef = useRef(tunnels);
  const runningTunnelsRef = useRef(runningTunnels);
  const onToggleRef = useRef(onToggle);

  useEffect(() => {
    tunnelsRef.current = tunnels;
  }, [tunnels]);

  useEffect(() => {
    runningTunnelsRef.current = runningTunnels;
  }, [runningTunnels]);

  useEffect(() => {
    onToggleRef.current = onToggle;
  }, [onToggle]);

  useEffect(() => {
    if (hasAutoStartedRef.current) {
      return;
    }

    if (loading || tunnels.length === 0) {
      return;
    }

    const autoStart = async () => {
      try {
        const autoStartList =
          await autoStartTunnelsService.getAutoStartTunnels();
        if (autoStartList.length === 0) {
          hasAutoStartedRef.current = true;
          return;
        }

        const user = getStoredUser();
        const currentTunnels = tunnelsRef.current;
        const hasApiTunnels = autoStartList.some(([type]) => type === "api");

        if (hasApiTunnels && !user?.usertoken) {
          hasAutoStartedRef.current = true;
          return;
        }

        const autoStartSet = new Set<string>();
        for (const [tunnelType, tunnelId] of autoStartList) {
          autoStartSet.add(`${tunnelType}_${tunnelId}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));

        const currentRunningTunnels = runningTunnelsRef.current;
        const toggle = onToggleRef.current;

        for (const tunnel of currentTunnels) {
          const tunnelKey =
            tunnel.type === "api"
              ? `api_${tunnel.data.id}`
              : `custom_${tunnel.data.id}`;

          if (!autoStartSet.has(tunnelKey)) {
            continue;
          }

          if (currentRunningTunnels.has(tunnelKey)) {
            continue;
          }

          toggle(tunnel, true);

          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        hasAutoStartedRef.current = true;
      } catch (error) {
        console.error("[自动启动] 启动隧道失败:", error);
        hasAutoStartedRef.current = true;
      }
    };

    autoStart();
  }, [loading, tunnels.length]);
}
