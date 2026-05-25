import type { ElementType } from "react";
import * as NextImageModule from "next/image";
import type { ImageProps } from "next/image";

const NextImage = resolveNextImageComponent(NextImageModule);
const shouldBypassOptimization = process.env.npm_lifecycle_event === "test";

export function ResponsiveImage(props: ImageProps) {
  return (
    <NextImage
      {...props}
      unoptimized={props.unoptimized ?? shouldBypassOptimization}
    />
  );
}

function resolveNextImageComponent(candidate: unknown): ElementType<ImageProps> {
  let current = candidate;

  while (hasDefaultExport(current)) {
    current = current.default;
  }

  return current as ElementType<ImageProps>;
}

function hasDefaultExport(candidate: unknown): candidate is { default: unknown } {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "default" in candidate
  );
}
