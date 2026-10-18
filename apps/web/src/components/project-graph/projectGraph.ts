import { layoutProjectGraph as layoutSharedProjectGraph } from "@t3tools/client-runtime/project-graph";
import { PROJECT_ICON_COLORS } from "../../projectIconColors";

export {
  BRANCH_LABEL_WIDTH,
  NODE_WIDTH,
  ROW_HEIGHT,
  graphEdgePath,
  canCloseGraphWorktree,
  type GraphNode,
  type GraphStation,
} from "@t3tools/client-runtime/project-graph";

// Use the icon picker’s rainbow, starting at cyan and skipping neutral gray.
const branchColors = PROJECT_ICON_COLORS.filter(({ value }) => value !== "gray");
const cyanIndex = branchColors.findIndex(({ value }) => value === "cyan");
const colors = [...branchColors.slice(cyanIndex), ...branchColors.slice(0, cyanIndex)].map(
  ({ value }) => `var(--color-${value}-500)`,
);

export function layoutProjectGraph(
  graph: Parameters<typeof layoutSharedProjectGraph>[0],
  threads: Parameters<typeof layoutSharedProjectGraph>[1],
  options: Omit<Parameters<typeof layoutSharedProjectGraph>[2], "colors"> = {},
) {
  return layoutSharedProjectGraph(graph, threads, {
    ...options,
    colors: [colors[0]!, ...colors.slice(1)],
  });
}

export { graphAuthorIdentity } from "@t3tools/client-runtime/graph-avatar";
