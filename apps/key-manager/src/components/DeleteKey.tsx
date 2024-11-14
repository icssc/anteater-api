import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import React, { startTransition } from "react";
import { TrashIcon } from "lucide-react";
import { KeyData } from "@/../../api/src/types/keys";
import { deleteUserApiKey } from "@/app/actions/keys";

interface Props {
  apiKey: string;
  apiKeyData: KeyData;
  apiKeys: Record<string, KeyData>;
  isPending: boolean;
  setApiKeys: React.Dispatch<React.SetStateAction<Record<string, KeyData>>>;
}

const DeleteKey: React.FC<Props> = ({
  apiKey,
  apiKeys,
  apiKeyData,
  isPending,
  setApiKeys,
}) => {
  const handleDeleteKey = (key: string) => {
    startTransition(async () => {
      await deleteUserApiKey(key);

      const newApiKeys = { ...apiKeys };
      delete newApiKeys[key];

      setApiKeys(newApiKeys);
    });
  };

  const abbreviatedKey = "..." + apiKey.substring(apiKey.indexOf(".") + 1);

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
          <p className={"truncate max-w-96 font-bold"}>
            {apiKeyData.name}
          </p>
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
