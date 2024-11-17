import { Button, type ButtonProps } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type React from "react";

interface Props extends ButtonProps {
  isLoading: boolean;
}

const ButtonSpinner: React.FC<Props> = ({ isLoading, ...props }) => {
  return (
    <Button disabled={isLoading} {...props}>
      <span className={"flex items-center"}>
        {isLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
        <div>{props.children}</div>
      </span>
    </Button>
  );
};

export default ButtonSpinner;
