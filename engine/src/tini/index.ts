// Tini's public interface. The engine codes against exactly these.
export { planFence, projectsRoot, NPM_REGISTRY, OUTSIDE_LINE, type Plan, type Source, type PlanOptions } from "./planner.ts";
export { stageFence, stripGps, type Staged } from "./stager.ts";
export { checkAccess, rewritePrompt, type AccessResult } from "./access.ts";
export { extractPaths, extractDomains, judgePath, sensitiveReason } from "./paths.ts";
