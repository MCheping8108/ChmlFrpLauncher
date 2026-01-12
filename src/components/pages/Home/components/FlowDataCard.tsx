import type { FlowPoint } from "@/services/api";

interface FlowDataCardProps {
  flowData: FlowPoint[];
  flowLoading: boolean;
  flowError: string;
}

export function FlowDataCard({
  flowData,
  flowLoading,
  flowError,
}: FlowDataCardProps) {
  return (
    <div className="border border-border/60 rounded-lg p-5 bg-card md:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">近7日流量</h2>
      </div>

      <div className="mt-3 text-sm text-muted-foreground">
        {flowLoading ? (
          <div>加载中...</div>
        ) : flowError ? (
          <div className="text-destructive">{flowError}</div>
        ) : flowData.length === 0 ? (
          <div>暂无数据</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {flowData.map((item) => (
              <div
                key={item.time}
                className="rounded border border-border/60 p-2 bg-foreground/[0.015]"
              >
                <div className="text-xs text-muted-foreground">{item.time}</div>
                <div className="text-[13px] text-foreground mt-1">
                  ↑ {item.traffic_in}
                </div>
                <div className="text-[13px] text-foreground">
                  ↓ {item.traffic_out}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

