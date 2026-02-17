import { useState, useEffect } from "react";

export interface ProxyConfig {
  enabled: boolean;
  type: "http" | "socks5";
  host: string;
  port: string;
  username: string;
  password: string;
  forceTls: boolean;
  kcpOptimization: boolean;
}

const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  enabled: false,
  type: "socks5",
  host: "",
  port: "",
  username: "",
  password: "",
  forceTls: false,
  kcpOptimization: false,
};

export function useProxy() {
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig>(
    DEFAULT_PROXY_CONFIG
  );

  useEffect(() => {
    const saved = localStorage.getItem("frpc_proxy_config");
    if (saved) {
      try {
        const config = JSON.parse(saved) as ProxyConfig;
        // 为旧配置添加默认值
        setProxyConfig({
          ...DEFAULT_PROXY_CONFIG,
          ...config,
        });
      } catch {
        // 忽略解析错误
      }
    }
  }, []);

  const saveProxyConfig = (config: ProxyConfig) => {
    setProxyConfig(config);
    localStorage.setItem("frpc_proxy_config", JSON.stringify(config));
  };

  const updateProxyConfig = (updates: Partial<ProxyConfig>) => {
    const newConfig = { ...proxyConfig, ...updates };
    saveProxyConfig(newConfig);
  };

  return {
    proxyConfig,
    updateProxyConfig,
  };
}
