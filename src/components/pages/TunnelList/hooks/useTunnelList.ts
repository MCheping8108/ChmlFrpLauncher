import { useState, useEffect } from "react";
import { fetchTunnels, type Tunnel } from "@/services/api";
import { frpcManager } from "@/services/frpcManager";
import { customTunnelService } from "@/services/customTunnelService";
import { tunnelListCache } from "../cache";
import type { UnifiedTunnel } from "../types";

export function useTunnelList() {
  const [tunnels, setTunnels] = useState<UnifiedTunnel[]>(() => {
    // 将缓存的API隧道转换为统一格式
    return tunnelListCache.tunnels.map((t) => ({ type: "api" as const, data: t }));
  });
  const [loading, setLoading] = useState(() => {
    return tunnelListCache.tunnels.length === 0;
  });
  const [error, setError] = useState("");
  const [runningTunnels, setRunningTunnels] = useState<Set<string>>(new Set());

  const loadTunnels = async () => {
    setLoading(true);
    setError("");

    try {
      // 加载API隧道和自定义隧道
      const [apiTunnels, customTunnels] = await Promise.all([
        fetchTunnels().catch(() => [] as Tunnel[]),
        customTunnelService.getCustomTunnels().catch(() => []),
      ]);

      // 转换为统一格式
      const allTunnels: UnifiedTunnel[] = [
        ...apiTunnels.map((t) => ({ type: "api" as const, data: t })),
        ...customTunnels.map((t) => ({ type: "custom" as const, data: t })),
      ];

      setTunnels(allTunnels);
      tunnelListCache.tunnels = apiTunnels;

      // 检查运行状态
      const running = new Set<string>();
      
      for (const tunnel of allTunnels) {
        if (tunnel.type === "api") {
          const isRunning = await frpcManager.isTunnelRunning(tunnel.data.id);
          if (isRunning) {
            running.add(`api_${tunnel.data.id}`);
          }
        } else {
          const isRunning = await customTunnelService.isCustomTunnelRunning(
            tunnel.data.id
          );
          if (isRunning) {
            running.add(`custom_${tunnel.data.id}`);
          }
        }
      }
      setRunningTunnels(running);
    } catch (err) {
      const message = err instanceof Error ? err.message : "获取隧道列表失败";
      if (
        message.includes("登录") ||
        message.includes("token") ||
        message.includes("令牌")
      ) {
        setError(message);
      }
      console.error("获取隧道列表失败", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTunnels();
  }, []);

  // 定期检查运行状态
  useEffect(() => {
    if (tunnels.length === 0) return;

    const checkRunningStatus = async () => {
      const running = new Set<string>();
      
      for (const tunnel of tunnels) {
        if (tunnel.type === "api") {
          const isRunning = await frpcManager.isTunnelRunning(tunnel.data.id);
          if (isRunning) {
            running.add(`api_${tunnel.data.id}`);
          }
        } else {
          const isRunning = await customTunnelService.isCustomTunnelRunning(
            tunnel.data.id
          );
          if (isRunning) {
            running.add(`custom_${tunnel.data.id}`);
          }
        }
      }
      setRunningTunnels(running);
    };

    const interval = setInterval(checkRunningStatus, 5000);

    return () => clearInterval(interval);
  }, [tunnels]);

  return {
    tunnels,
    loading,
    error,
    runningTunnels,
    setRunningTunnels,
    refreshTunnels: loadTunnels,
  };
}

