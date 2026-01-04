import { useEffect, useState } from "react"
import { toast } from "sonner"
import { frpcDownloader } from "../../services/frpcDownloader"
import { Progress } from "../ui/progress"

type ThemeMode = "light" | "dark"

const getInitialTheme = (): ThemeMode => {
  if (typeof window === "undefined") return "light"
  const stored = localStorage.getItem("theme") as ThemeMode | null
  if (stored === "light" || stored === "dark") return stored
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  return prefersDark ? "dark" : "light"
}

export function Settings() {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme())
  const [isDownloading, setIsDownloading] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    if (theme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
    localStorage.setItem("theme", theme)
  }, [theme])

  const handleRedownloadFrpc = async () => {
    if (isDownloading) return

    setIsDownloading(true)
    const toastId = toast.loading(
      <div className="space-y-2">
        <div className="text-sm font-medium">正在下载 frpc 客户端...</div>
        <Progress value={0} />
        <div className="text-xs text-muted-foreground">0.0%</div>
      </div>,
      { duration: Infinity }
    )

    try {
      await frpcDownloader.downloadFrpc((progress) => {
        toast.loading(
          <div className="space-y-2">
            <div className="text-sm font-medium">正在下载 frpc 客户端...</div>
            <Progress value={progress.percentage} />
            <div className="text-xs text-muted-foreground">
              {progress.percentage.toFixed(1)}% ({(progress.downloaded / 1024 / 1024).toFixed(2)} MB / {(progress.total / 1024 / 1024).toFixed(2)} MB)
            </div>
          </div>,
          { id: toastId, duration: Infinity }
        )
      })

      toast.success("frpc 客户端下载成功", {
        id: toastId,
        duration: 3000,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      toast.error(
        <div className="space-y-2">
          <div className="text-sm font-medium">下载失败</div>
          <div className="text-xs text-muted-foreground">{errorMsg}</div>
        </div>,
        { id: toastId, duration: 8000 }
      )
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium text-foreground">设置</h1>

      <div className="border border-border/60 rounded-lg p-4 bg-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground text-sm">主题</p>
            <p className="text-xs text-muted-foreground mt-0.5">选择界面配色方案</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme("light")}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                theme === "light"
                  ? "bg-foreground text-background"
                  : "border border-border/60 hover:bg-muted/40"
              }`}
            >
              浅色
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                theme === "dark"
                  ? "bg-foreground text-background"
                  : "border border-border/60 hover:bg-muted/40"
              }`}
            >
              深色
            </button>
          </div>
        </div>
      </div>

      <div className="border border-border/60 rounded-lg p-4 bg-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground text-sm">frpc 客户端</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              重新下载 frpc 客户端程序
            </p>
          </div>
          <button
            onClick={handleRedownloadFrpc}
            disabled={isDownloading}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              isDownloading
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-foreground text-background hover:opacity-90"
            }`}
          >
            {isDownloading ? "下载中..." : "重新下载"}
          </button>
        </div>
      </div>
    </div>
  )
}


