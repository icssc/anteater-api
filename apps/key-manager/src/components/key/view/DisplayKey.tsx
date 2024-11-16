import React from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  keyText: string;
  copyText?: string;
  background?: boolean;
  label?: string;
}

const DisplayKey: React.FC<Props> = ({
  keyText,
  copyText,
  background,
  label,
}) => {
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
        className={`flex space-x-2 items-center justify-between ${background ? "bg-gray-900 p-2 rounded" : ""}`}
      >
        <code className="overflow-x-auto">{keyText}</code>
        {copied ? (
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
        )}
      </div>
    </div>
  );
};

export default DisplayKey;
