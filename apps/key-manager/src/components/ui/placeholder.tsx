import type React from "react";
import { cn } from "@/lib/utils";

const Placeholder: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => {
  return <div className={cn("animate-pulse rounded bg-muted h-10", props.className)} />;
};

export default Placeholder;
