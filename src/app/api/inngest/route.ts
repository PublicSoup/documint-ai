import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { analyzeCodebaseFunction } from "@/inngest/functions/analyze-codebase";
import { githubImportFunction } from "@/inngest/functions/github-import";
import { codeReviewFunction } from "@/inngest/functions/code-review";

export const maxDuration = 300;

// Create an API that serves zero-downtime background functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    analyzeCodebaseFunction,
    githubImportFunction,
    codeReviewFunction
  ],
});
