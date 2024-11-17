import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckIcon, CopyIcon } from "lucide-react";
import React from "react";

interface Props {
  keyText: string;
  copyText?: string;
  background?: boolean;
  label?: string;
  copy?: boolean;
}

const DisplayKey: React.FC<Props> = ({ keyText, copyText, background, label, copy = true }) => {
  const [copied, setCopied] = React.useState<boolean>(false);

  const handleCopyKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey).then();
    setCopied(true);
    setTimeout(() => setCopied(false), 500);
  };

  return (
    <div className={"space-y-2 max-w-full overflow-x-auto"}>
      {label && <p>{label}</p>}

      <div
        className={`flex space-x-2 items-center justify-between ${background ? "bg-foreground text-background p-2 rounded" : ""}`}
      >
        <code className="overflow-x-auto">{keyText}</code>
        {copy &&
          (copied ? (
            <CheckIcon className="text-green-700 shrink-0" />
          ) : (
            <TooltipProvider>
              <Tooltip delayDuration={100}>
                <TooltipTrigger>
                  <CopyIcon
                    className="cursor-pointer shrink-0"
                    onClick={() => handleCopyKey(copyText ? copyText : keyText)}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copy</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
      </div>
    </div>
  );
};

export default DisplayKey;
