"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2, AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface DeleteProjectDialogProps {
  projectId: string
  projectName: string
  /** Where to redirect after deletion. Defaults to /dashboard */
  redirectTo?: string
  trigger: React.ReactNode
}

export function DeleteProjectDialog({
  projectId,
  projectName,
  redirectTo = "/dashboard",
  trigger,
}: DeleteProjectDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to delete project")
      }

      setOpen(false)
      router.push(redirectTo)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="bg-[var(--dash-elevated)] border-[var(--dash-border)] text-[var(--dash-text)] sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex size-10 items-center justify-center rounded-full bg-[var(--dash-error)]/10">
              <AlertTriangle className="size-5 text-[var(--dash-error)]" />
            </div>
            <DialogTitle className="text-[var(--dash-text)]">Delete Project</DialogTitle>
          </div>
          <DialogDescription className="text-[var(--dash-text-secondary)]">
            Are you sure you want to delete{" "}
            <span className="font-medium text-[var(--dash-text)]">{projectName}</span>?
            This will permanently remove the site from the internet and delete
            all generated files. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-[var(--dash-error)]/10 border border-[var(--dash-error)]/20 px-3 py-2 text-sm text-[var(--dash-error)]">
            {error}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            className="text-[var(--dash-text-secondary)] hover:text-[var(--dash-text)]"
            onClick={() => setOpen(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
            className="bg-[var(--dash-error)] hover:bg-[var(--dash-error)]/90 text-white"
          >
            {deleting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="size-4" />
                Delete Project
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
