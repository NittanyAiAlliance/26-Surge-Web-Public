import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "../../../lib/rate-limit"
import { RateLimiter } from "../../../lib/rate-limit"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_EXTRACTED_TEXT = 100_000 // 100K chars — prevents cost amplification in downstream prompts
const REDUCTO_TIMEOUT_MS = 60_000 // 60 seconds

const parseResumeLimiter = new RateLimiter({ prefix: "parse-resume", maxRequests: 10, windowMs: 60 * 60 * 1000 })

export async function POST(request: NextRequest) {
  // Rate limiting — prevent Reducto API quota exhaustion
  const rateLimited = await checkRateLimit(parseResumeLimiter, request, "Maximum 10 resume parses per hour.")
  if (rateLimited) return rateLimited

  const apiKey = process.env.REDUCTO_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "PDF parsing is not configured" },
      { status: 503 },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a 'file' field" },
      { status: 400 },
    )
  }

  const file = formData.get("file")
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field in form data" },
      { status: 400 },
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 10MB." },
      { status: 413 },
    )
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { error: "Only PDF files are supported" },
      { status: 400 },
    )
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REDUCTO_TIMEOUT_MS)

    // Step 1: Upload file to Reducto
    const uploadForm = new FormData()
    uploadForm.append("file", file)

    const uploadRes = await fetch("https://platform.reducto.ai/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: uploadForm,
      signal: controller.signal,
    })

    if (!uploadRes.ok) {
      clearTimeout(timeout)
      const errorText = await uploadRes.text().catch(() => "Unknown error")
      console.error(`[parse-resume] Reducto upload error (${uploadRes.status}): ${errorText}`)
      return NextResponse.json(
        { error: "Failed to upload PDF. Try pasting your resume text in the Custom Context tab instead." },
        { status: 422 },
      )
    }

    const uploadResult = await uploadRes.json()
    const fileId = uploadResult.file_id
    if (!fileId) {
      clearTimeout(timeout)
      console.error("[parse-resume] Reducto upload returned no file_id:", uploadResult)
      return NextResponse.json(
        { error: "Failed to process PDF upload." },
        { status: 422 },
      )
    }

    // Step 2: Parse the uploaded file using reducto:// prefix
    const response = await fetch("https://platform.reducto.ai/parse", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: `reducto://${fileId}` }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      console.error(`[parse-resume] Reducto parse error (${response.status}): ${errorText}`)
      return NextResponse.json(
        { error: "Failed to parse PDF. Try pasting your resume text in the Custom Context tab instead." },
        { status: 422 },
      )
    }

    const result = await response.json()

    let text = ""
    if (result.result?.chunks) {
      text = result.result.chunks
        .map((chunk: { content?: string; text?: string }) => chunk.content ?? chunk.text ?? "")
        .join("\n\n")
    } else if (result.result?.text) {
      text = result.result.text
    } else if (typeof result.text === "string") {
      text = result.text
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Could not extract text from PDF. The file may be image-only or empty." },
        { status: 422 },
      )
    }

    // Cap extracted text to prevent cost amplification in downstream prompts
    const trimmedText = text.trim().slice(0, MAX_EXTRACTED_TEXT)

    return NextResponse.json({ text: trimmedText })
  } catch (error) {
    console.error("[parse-resume] Error:", error)
    // Handle abort specifically so we don't leak AbortError details
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json(
        { error: "PDF parsing timed out. Try a smaller file or paste your resume text directly." },
        { status: 504 },
      )
    }
    return NextResponse.json(
      { error: "Failed to parse PDF. Please try again." },
      { status: 500 },
    )
  }
}
