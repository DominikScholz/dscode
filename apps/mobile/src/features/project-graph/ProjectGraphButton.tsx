import { useNavigation } from "@react-navigation/native";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { Pressable, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";

export function ProjectGraphButton({ project }: { project?: EnvironmentProject | undefined }) {
  const navigation = useNavigation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Project visualization"
      onPress={() =>
        navigation.navigate(
          "ProjectGraph",
          project ? { environmentId: project.environmentId, projectId: project.id } : {},
        )
      }
      className="min-h-12 flex-row items-center justify-between gap-3 px-4 py-3 active:bg-subtle"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-t3-semibold text-primary-text">Project visualization</Text>
        <Text className="text-xs text-foreground-muted">Branches, worktrees, and threads</Text>
      </View>
      <Text className="text-lg text-foreground-muted">›</Text>
    </Pressable>
  );
}
