import type { EnvironmentMachineKind } from "@t3tools/contracts";
import { CloudIcon, DesktopIcon, HardDrivesIcon, LaptopIcon } from "@phosphor-icons/react";
import type { ComponentType, SVGProps } from "react";
import { LinuxIcon } from "./Icons";

function LucideLike(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

function MacMiniIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <LucideLike {...props}>
      <rect width="18" height="12" x="3" y="6" rx="2.5" />
      <circle cx="7.5" cy="12" r="1" fill="currentColor" stroke="none" />
    </LucideLike>
  );
}

function MacStudioIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <LucideLike {...props}>
      <rect width="18" height="14" x="3" y="5" rx="2" />
      <path d="M7 15h.01M11 15h.01M15 15h.01" />
    </LucideLike>
  );
}

// What callers pass: a size/color class and an accessibility flag.
type MachineIconProps = { className?: string; "aria-hidden"?: boolean | "true" | "false" };

const ICON_BY_KIND: Record<EnvironmentMachineKind, ComponentType<MachineIconProps>> = {
  server: HardDrivesIcon,
  cloud: CloudIcon,
  linux: LinuxIcon,
  desktop: DesktopIcon,
  laptop: LaptopIcon,
  "mac-mini": MacMiniIcon,
  "mac-studio": MacStudioIcon,
};

export const ENVIRONMENT_MACHINE_KIND_LABELS: Record<EnvironmentMachineKind, string> = {
  server: "Server",
  cloud: "Cloud VM",
  linux: "Linux/WSL",
  desktop: "Desktop",
  laptop: "Laptop",
  "mac-mini": "Mini PC",
  "mac-studio": "Workstation",
};

export function environmentMachineIcon(
  kind: EnvironmentMachineKind,
): ComponentType<MachineIconProps> {
  return ICON_BY_KIND[kind];
}

export function EnvironmentMachineIcon({
  kind,
  ...props
}: MachineIconProps & { readonly kind: EnvironmentMachineKind }) {
  const Icon = ICON_BY_KIND[kind];
  return <Icon {...props} />;
}
