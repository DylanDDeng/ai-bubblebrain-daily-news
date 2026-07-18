export const SHARED_CONTENT_PROJECT_REF = "znurdobjryrhshzkalup";
export const SHARED_CONTENT_PROJECT_ACK = `I_ACCEPT_SHARED_AUTH_CONTENT_BLAST_RADIUS:${SHARED_CONTENT_PROJECT_REF}`;

const PROJECT_REF = /^[a-z0-9]{20}$/;
const TOPOLOGIES = new Set(["isolated_project", "shared_project"]);

export function validateContentDatabaseTopology(env, projectRef) {
  const normalizedProjectRef = String(projectRef || "").trim();
  if (!PROJECT_REF.test(normalizedProjectRef)) {
    throw new Error("content database project ref is invalid");
  }

  const topology = String(
    env.CONTENT_DATABASE_TOPOLOGY || "isolated_project",
  ).trim();
  if (!TOPOLOGIES.has(topology)) {
    throw new Error(
      "CONTENT_DATABASE_TOPOLOGY must be isolated_project or shared_project",
    );
  }

  if (normalizedProjectRef === SHARED_CONTENT_PROJECT_REF) {
    if (topology !== "shared_project") {
      throw new Error(
        "the shared Supabase project requires explicit shared_project topology",
      );
    }
    if (
      String(env.CONTENT_SHARED_PROJECT_ACK || "").trim() !==
      SHARED_CONTENT_PROJECT_ACK
    ) {
      throw new Error(
        "the shared Supabase project requires the exact blast-radius acknowledgement",
      );
    }
  } else if (topology === "shared_project") {
    throw new Error(
      "shared_project topology is approved only for the current BubbleBrain backend",
    );
  }

  return topology;
}
