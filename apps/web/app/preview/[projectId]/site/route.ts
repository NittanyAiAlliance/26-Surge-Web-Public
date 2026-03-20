import { NextRequest, NextResponse } from "next/server"
import { renderPreview } from "@/lib/preview-renderer"

export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const { getProject, getProjectFiles } = await import("@radiant/db")

  const project = await getProject(projectId)
  if (!project) {
    return new NextResponse("Project not found", { status: 404 })
  }

  const files = await getProjectFiles(projectId)
  if (files.length === 0) {
    return new NextResponse(
      placeholder(project.business_name, "No files generated yet."),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    )
  }

  const html = renderPreview(files, project.business_name)

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Preview-Files": String(files.length),
    },
  })
}

function placeholder(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fafafa;
      color: #333;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    p {
      color: #888;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
