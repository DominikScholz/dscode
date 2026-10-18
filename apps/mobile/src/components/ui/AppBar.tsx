import { Toolbar } from "./Toolbar";
import { AppActivityIndicator } from "./AppActivityIndicator";
import type { HeaderBarButtonMailSearchToolbarItem } from "react-native-screens";
import { useId } from "react";
import { View, useWindowDimensions } from "react-native";
import { AppText as Text } from "./AppText";
import { createNativeHeaderMenu } from "./nativeHeaderMenu.ios";
import { ScreenHeaderButton } from "./ScreenHeaderButton";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useNativeWorkspaceColumnsSupported } from "../../native/NativeWorkspaceColumns";
import { useDeviceType } from "../../native/native-layout-metrics";
import { useAdaptiveWorkspaceLayout } from "../../features/layout/AdaptiveWorkspaceLayout";
import {
  createNativeMailSearchToolbarItem,
  NATIVE_MAIL_SEARCH_TOOLBAR_SUPPORTED,
} from "../../features/layout/native-mail-search-toolbar";
import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import type { AppBarMenuItem, AppBarProps } from "./AppBar.types";
import type { AppSymbolName } from "./AppSymbol";
import { useNativeMailSearchToolbar } from "../../native/use-native-mail-search-toolbar";

function iosIcon(icon: AppSymbolName) {
  return typeof icon === "string" ? icon : icon.ios;
}

type MailMenu = NonNullable<HeaderBarButtonMailSearchToolbarItem["filterMenu"]>;
function mailMenuItems(items: ReadonlyArray<AppBarMenuItem>): MailMenu["items"] {
  return items.map((item) =>
    "items" in item
      ? { type: "submenu", title: item.title ?? "", items: mailMenuItems(item.items) }
      : {
          type: "action",
          title: item.title,
          state: item.selected ? "on" : "off",
          disabled: item.disabled,
          onPress: item.onPress,
        },
  );
}

export function AppBar(props: AppBarProps) {
  const usesNativeWorkspaceColumns = useNativeWorkspaceColumnsSupported();
  const deviceType = useDeviceType();
  const headerId = useId();
  const { layout, panes, togglePrimarySidebar } = useAdaptiveWorkspaceLayout();
  const { themeVariables } = useAppearancePreferences();
  const usesNativeMailSearchToolbar = useNativeMailSearchToolbar();
  const { search, menus } = props;
  const { title, subtitle, titleIcon } = props;
  const renderTitle = () => <AppBarTitle title={title} subtitle={subtitle} titleIcon={titleIcon} />;
  const menu = search?.menuInToolbar === false ? undefined : menus?.[0];
  const compactSearch =
    search !== undefined &&
    (search.compactToolbar ?? !layout.usesSplitView) &&
    usesNativeMailSearchToolbar;
  const visibleMenus = compactSearch && menu ? (menus?.slice(1) ?? []) : (menus ?? []);
  const refresh = search?.refreshInToolbar ? search.onRefresh : undefined;
  return (
    <>
      <NativeStackScreenOptions
        optionsVersion={[
          props.optionsVersion,
          compactSearch ? menu : undefined,
          compactSearch ? refresh : undefined,
        ]}
        options={{
          headerShown: true,
          headerBackVisible:
            !layout.usesSplitView ||
            !props.backInSplitView ||
            !(props.backInSplitView.onPress || props.onBack),
          title: props.title,
          unstable_headerSubtitle: titleIcon ? undefined : subtitle || undefined,
          ...(titleIcon ? { headerTitle: renderTitle } : undefined),
          ...(props.matchSearchSurface
            ? { contentStyle: { backgroundColor: themeVariables["--color-sheet-solid"] } }
            : undefined),
          ...(search
            ? {
                unstable_headerToolbarItems: compactSearch
                  ? () => [
                      createNativeMailSearchToolbarItem({
                        showsSearchDismissButton: true,
                        placeholder: search.compactPlaceholder ?? search.placeholder,
                        onSearchTextChange: search.onChangeText,
                        searchTextChangeId: `${headerId}-search-text`,
                        ...(refresh
                          ? {
                              composeButtonId: `${headerId}-refresh`,
                              composeSystemImageName: "arrow.clockwise",
                              onComposePress: refresh,
                            }
                          : undefined),
                        ...(menu
                          ? {
                              filterButtonId: `${headerId}-filter`,
                              filterSystemImageName: iosIcon(menu.icon),
                              filterMenu: { title: menu.title, items: mailMenuItems(menu.items) },
                            }
                          : undefined),
                      }),
                    ]
                  : () => [],
                headerSearchBarOptions: compactSearch
                  ? undefined
                  : {
                      allowToolbarIntegration: true,
                      ...(NATIVE_MAIL_SEARCH_TOOLBAR_SUPPORTED && search.mode === "inline"
                        ? { placement: "integratedButton" as const }
                        : undefined),
                      autoCapitalize: "none",
                      hideNavigationBar: false,
                      ...(search.mode === "inline" ? { obscureBackground: false } : undefined),
                      placeholder: search.placeholder,
                      onChangeText: (event) => search.onChangeText(event.nativeEvent.text),
                      onCancelButtonPress: () => search.onChangeText(""),
                    },
              }
            : undefined),
          ...props.options,
        }}
      />
      {layout.usesSplitView && (props.sidebar !== false || props.backInSplitView) ? (
        <Toolbar placement="left">
          {props.backInSplitView && (props.backInSplitView.onPress || props.onBack) ? (
            <ScreenHeaderButton
              {...props.backInSplitView}
              onPress={props.backInSplitView.onPress ?? props.onBack}
            />
          ) : null}
          {props.sidebar !== false &&
          (!usesNativeWorkspaceColumns || deviceType === "pad" || !panes.primarySidebarVisible) ? (
            <ScreenHeaderButton
              axisBehavior={usesNativeWorkspaceColumns ? "horizontalOnly" : undefined}
              accessibilityLabel={
                panes.primarySidebarVisible
                  ? `Maximize ${props.title.toLowerCase()}`
                  : "Show threads"
              }
              icon={
                panes.primarySidebarVisible ? "arrow.up.left.and.arrow.down.right" : "sidebar.left"
              }
              onPress={togglePrimarySidebar}
              separateBackground={
                props.backInSplitView ? props.backInSplitView.separateBackground : true
              }
            />
          ) : null}
        </Toolbar>
      ) : null}
      {(props.actions?.length ||
        (!compactSearch && refresh) ||
        visibleMenus.length ||
        props.trailing) &&
      props.options?.unstable_headerRightItems === undefined ? (
        <Toolbar placement="right">
          {props.actions?.map(({ loading, ...action }) =>
            loading ? (
              <Toolbar.Custom key={action.accessibilityLabel}>
                <View
                  accessibilityLabel={action.accessibilityLabel}
                  className="size-9 items-center justify-center"
                >
                  <AppActivityIndicator color={action.tintColor} />
                </View>
              </Toolbar.Custom>
            ) : (
              <ScreenHeaderButton
                key={action.accessibilityLabel}
                {...action}
                icon={iosIcon(action.icon)}
                separateBackground
              />
            ),
          )}
          {refresh && !compactSearch ? (
            <ScreenHeaderButton
              accessibilityLabel={search?.refreshAccessibilityLabel}
              icon="arrow.clockwise"
              onPress={refresh}
              separateBackground
            />
          ) : null}
          {visibleMenus.map(createNativeHeaderMenu)}
          {props.trailing}
        </Toolbar>
      ) : null}
    </>
  );
}

function AppBarTitle({
  title,
  subtitle,
  titleIcon,
}: Pick<AppBarProps, "title" | "subtitle" | "titleIcon">) {
  const { width } = useWindowDimensions();
  return (
    <View className="flex-row items-center gap-2" style={{ maxWidth: Math.max(0, width - 160) }}>
      {titleIcon}
      <View className="min-w-0 shrink">
        <Text numberOfLines={1} className="text-base font-t3-semibold text-foreground">
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-xs text-foreground-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export type {
  AppBarAction,
  AppBarMenu,
  AppBarMenuItem,
  AppBarProps,
  AppBarSearch,
} from "./AppBar.types";
