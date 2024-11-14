import React from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

interface Props {
  keyText: string;
  copyText: string;
  background?: boolean;
}

const Key: React.FC<Props> = ({ keyText, copyText, background }) => {
  const [copied, setCopied] = React.useState<boolean>(false);

  const handleCopyKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey).then();
    setCopied(true);
    setTimeout(() => setCopied(false), 500);
  };

  return (
    <div
      className={`flex space-x-2 items-center justify-between ${background ? "bg-gray-900 p-2 rounded" : ""}`}
    >
      <pre className="overflow-x-auto">{keyText}</pre>
      {copied ? (
        <CheckIcon className="text-green-700 shrink-0" />
      ) : (
        <CopyIcon
          className="cursor-pointer shrink-0"
          onClick={() => handleCopyKey(copyText)}
        />
      )}
    </div>
  );
};

export default Key;
