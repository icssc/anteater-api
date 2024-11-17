import { cn } from "@/lib/utils";
import type React from "react";

const Placeholder: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => {
  return <div className={cn("animate-pulse rounded bg-muted h-10", props.className)} />;
};

export default Placeholder;
