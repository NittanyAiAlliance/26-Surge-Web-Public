import { STATUS_CONFIG } from "@/lib/constants/status-config"
import type { ProjectStatus } from "@radiant/db"

export function StatusBadge({
  status,
  size = "md",
}: {
  status: ProjectStatus
  size?: "sm" | "md"
}) {
  const config = STATUS_CONFIG[status]
  const dotSize = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2"
  const textSize = size === "sm" ? "text-xs" : "text-sm"

  return (
    <span className="inline-flex items-center gap-2">
      <span className={`${dotSize} rounded-full ${config.dotClass}`} />
      <span className={`${textSize} font-medium font-body ${config.textClass}`}>
        {config.label}
      </span>
    </span>
  )
}
