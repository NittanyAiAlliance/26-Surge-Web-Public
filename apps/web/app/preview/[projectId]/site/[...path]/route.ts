import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const MIME_TYPES: Record<string, string> = {
  tsx: "text/typescript",
  ts: "text/typescript",
  jsx: "text/javascript",
  js: "text/javascript",
  css: "text/css",
  json: "application/json",
  html: "text/html",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  ico: "image/x-icon",
  txt: "text/plain",
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; path: string[] }> }
) {
  const { projectId, path } = await params
  const filePath = path.join("/")

  const { getProject, getProjectFileByPath } = await import("@radiant/db")

  const project = await getProject(projectId)
  if (!project) {
    return new NextResponse("Project not found", { status: 404 })
  }

  const file = await getProjectFileByPath(projectId, filePath)
  if (!file) {
    return new NextResponse("File not found", { status: 404 })
  }

  const ext = filePath.split(".").pop()?.toLowerCase() || ""
  const contentType = MIME_TYPES[ext] || "text/plain"

  return new NextResponse(file.content, {
    headers: { "Content-Type": `${contentType}; charset=utf-8` },
  })
}
