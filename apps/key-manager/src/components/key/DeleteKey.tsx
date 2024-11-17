import { deleteUserApiKey } from "@/app/actions/keys";
import DisplayKey from "@/components/key/view/DisplayKey";
import { Button } from "@/components/ui/button";
import ButtonSpinner from "@/components/ui/button-spinner";
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
import { useState } from "react";
import { startTransition } from "react";

interface Props {
  apiKey: string;
  apiKeyName?: string;
  apiKeys?: Record<string, KeyData>;
  setApiKeys?: React.Dispatch<React.SetStateAction<Record<string, KeyData>>>;
  afterDelete?: () => void;
}

const DeleteKey: React.FC<Props> = ({ apiKey, apiKeyName, apiKeys, setApiKeys, afterDelete }) => {
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const handleDeleteKey = (key: string) => {
    setIsDeleting(true);

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

      setIsDeleting(false);
    });
  };

  const abbreviatedKey = `...${apiKey.substring(apiKey.indexOf(".") + 1)}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">
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
          <DisplayKey keyText={abbreviatedKey} background copy={false} />
        </div>
        <DialogFooter>
          <ButtonSpinner
            variant="destructive"
            onClick={() => handleDeleteKey(apiKey)}
            isLoading={isDeleting}
          >
            Delete
          </ButtonSpinner>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteKey;
