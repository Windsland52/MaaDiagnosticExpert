import { ProfileSchema, type Profile } from "./schema.js";

const genericMaaLogProfileInput = {
  apiVersion: "profile/v1",
  id: "generic-maa-log",
  name: "Generic Maa Log",
  description: "Generic local Maa log diagnosis profile.",
  inputs: {
    acceptsRawToolResults: true,
    acceptsSourcePaths: true,
    acceptsArchives: true,
    acceptsProfiles: true
  },
  recommendedTools: [
    "maa-log-analyzer",
    "maa-support-extension",
    "filesystem"
  ],
  recommendedCorpora: [
    "diagnostic-guides",
    "repo-docs",
    "repo-examples"
  ],
  recommendedQueries: [
    "next on_error timeout",
    "interface.json task option",
    "controller resource pipeline"
  ],
  reportSections: [
    "summary",
    "key_evidence",
    "findings",
    "missing_evidence"
  ],
  tags: [
    "generic",
    "maa",
    "logs"
  ],
  notes: [
    "Prefer deterministic tool results over retrieval hits.",
    "Treat retrieval as background knowledge, not as direct fact."
  ]
};

export const BuiltinProfiles = {
  genericMaaLog: ProfileSchema.parse(genericMaaLogProfileInput)
} as const;

export function listBuiltinProfiles(): Profile[] {
  return Object.values(BuiltinProfiles);
}

export function getBuiltinProfile(profileId: string): Profile | null {
  return listBuiltinProfiles().find((profile) => profile.id === profileId) ?? null;
}
