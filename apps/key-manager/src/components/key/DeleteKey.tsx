import { deleteUserApiKey } from "@/app/actions/keys";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { KeyData } from "@packages/key-types";
import { TrashIcon } from "lucide-react";
import type React from "react";
import { startTransition } from "react";

interface Props {
  apiKey: string;
  apiKeyName?: string;
  apiKeys?: Record<string, KeyData>;
  setApiKeys?: React.Dispatch<React.SetStateAction<Record<string, KeyData>>>;
  isPending?: boolean;
  afterDelete?: () => void;
}

const DeleteKey: React.FC<Props> = ({
  apiKey,
  apiKeyName,
  apiKeys,
  isPending,
  setApiKeys,
  afterDelete,
}) => {
  const handleDeleteKey = (key: string) => {
    startTransition(async () => {
      await deleteUserApiKey(key);

      if (setApiKeys) {
        const newApiKeys = { ...apiKeys };
        delete newApiKeys[key];

        setApiKeys(newApiKeys);
      }

      if (afterDelete) {
        afterDelete();
      }
    });
  };

  const abbreviatedKey = `...${apiKey.substring(apiKey.indexOf(".") + 1)}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive" disabled={isPending}>
          <TrashIcon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete API Key</DialogTitle>
        </DialogHeader>
        <div className={"space-y-4"}>
          <div>Are you sure you want to delete this API key?</div>
          <p className={"truncate max-w-96 font-bold"}>{apiKeyName}</p>
          <div className="bg-gray-900 p-2 rounded flex-1">
            <pre className="overflow-x-auto">{abbreviatedKey}</pre>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={() => handleDeleteKey(apiKey)}
            disabled={isPending}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteKey;
