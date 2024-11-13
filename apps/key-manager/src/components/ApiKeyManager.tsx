"use client";

import { useEffect, useState, useTransition } from "react";
import { CopyIcon, TrashIcon, PlusIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createUserApiKey,
  deleteUserApiKey,
  getUserApiKeys,
} from "@/app/actions/keys";
import { MAX_API_KEYS } from "@/lib/utils";

export default function ApiKeyManager() {
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  const [keys, setKeys] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const keys = await getUserApiKeys();
        setKeys(keys);
        setIsInitialLoad(false);
      } catch (err: any) {
        setError(err.message);
      }
    });
  }, []);

  const handleCreateKey = () => {
    startTransition(async () => {
      try {
        const newKey = await createUserApiKey();
        setKeys([...keys, newKey]);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      }
    });
  };

  const handleDeleteKey = (key: string) => {
    startTransition(async () => {
      try {
        await deleteUserApiKey(key);
        setKeys(keys.filter((k) => k !== key));
        setError(null);
      } catch (err: any) {
        setError(err.message);
      }
    });
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key).then();
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 500);
  };

  if (isInitialLoad) {
    return (
      <div className={"max-w-3xl mx-auto"}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className={"max-w-4xl mx-auto pb-10 space-y-4"}>
      <div className={"max-h-[80vh] overflow-y-auto space-y-4 "}>
        {keys.map((key) => (
          <div className={"space-x-2 flex items-center"} key={key}>
            <div className="bg-gray-800 p-2 rounded flex items-center justify-between space-x-2 flex-1">
              <pre className="overflow-x-auto">{key}</pre>
              {copiedKey === key ? (
                <CheckIcon className="text-green-500 shrink-0" />
              ) : (
                <CopyIcon
                  className="cursor-pointer shrink-0"
                  onClick={() => handleCopyKey(key)}
                />
              )}
            </div>
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
                  <div className="bg-gray-800 p-2 rounded flex items-center justify-between space-x-2 flex-1">
                    <pre className="overflow-x-auto">
                      {"..." + key.split(".")[2]}
                    </pre>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="destructive"
                    onClick={() => handleDeleteKey(key)}
                    disabled={isPending}
                  >
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        ))}
      </div>
      <Button
        className={"w-full"}
        onClick={handleCreateKey}
        disabled={isPending}
      >
        <PlusIcon />
        <p>
          Create Key ({keys.length}/{MAX_API_KEYS})
        </p>
      </Button>
      {error && <p className="text-red-500 mt-2">Error: {error}</p>}
    </div>
  );
}
