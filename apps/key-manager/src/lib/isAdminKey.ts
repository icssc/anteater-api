import type { KeyData } from "@/../../api/src/types/keys";

export default function isAdminKey(key: KeyData) {
  if (key.rateLimitOverride) {
    return true;
  }

  for (const resource in key.resources) {
    if (key.resources[resource]) {
      return true;
    }
  }

  return false;
}
