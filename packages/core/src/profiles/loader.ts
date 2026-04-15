import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { parse as parseJsonc } from "jsonc-parser";
import YAML from "yaml";

import { ProfileSchema, type Profile } from "./schema.js";
import { getBuiltinProfile, listBuiltinProfiles } from "./builtin.js";

export async function loadProfileFromFile(filePath: string): Promise<Profile> {
  const raw = await readFile(filePath, "utf8");
  const ext = extname(filePath).toLowerCase();

  let parsed: unknown;
  if (ext === ".yaml" || ext === ".yml") {
    parsed = YAML.parse(raw);
  }
  else {
    parsed = parseJsonc(raw);
  }

  return ProfileSchema.parse(parsed);
}

export function resolveProfile(profileId: string): Profile | null {
  return getBuiltinProfile(profileId);
}

export function requireProfile(profileId: string): Profile {
  const profile = resolveProfile(profileId);
  if (!profile) {
    throw new Error(`Unknown profile: ${profileId}`);
  }
  return profile;
}

export { listBuiltinProfiles };
