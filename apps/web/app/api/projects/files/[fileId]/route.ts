import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId)) {
    return NextResponse.json({ error: "Invalid file ID" }, { status: 400 })
  }

  const { getProjectFileById } = await import("@radiant/db")
  const file = await getProjectFileById(fileId)

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }

  return NextResponse.json({ content: file.content })
}
