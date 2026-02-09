import { z } from "zod";

export const GenerateDocsSchema = z.object({
    code: z.string().min(1, "Code content is required"),
    language: z.string().min(1, "Language is required"),
    options: z.object({
        filePath: z.string().optional(),
        style: z.enum(["jsdoc", "docstring", "markdown"]).default("jsdoc"),
        includeExamples: z.boolean().default(true),
    }).optional(),
});

export const InjectDocsSchema = z.object({
    code: z.string().min(1, "Code content is required"),
    language: z.string().min(1, "Language is required"),
    options: z.object({
        filePath: z.string().optional(),
    }).optional(),
});

export type GenerateDocsInput = z.infer<typeof GenerateDocsSchema>;
export type InjectDocsInput = z.infer<typeof InjectDocsSchema>;
