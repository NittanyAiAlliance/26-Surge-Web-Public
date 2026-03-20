import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import {
  scrapeSiteFunction,
  scaffoldSiteFunction,
  homepageSiteFunction,
  additionalPagesSiteFunction,
  finalizeSiteFunction,
} from "@/lib/inngest/generate-site"

export const maxDuration = 300

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    scrapeSiteFunction,
    scaffoldSiteFunction,
    homepageSiteFunction,
    additionalPagesSiteFunction,
    finalizeSiteFunction,
  ],
})
