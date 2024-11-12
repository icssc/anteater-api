"use client";

import { useEffect, useState, useTransition } from "react";
import { CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createUserApiKey,
  deleteUserApiKey,
  getUserApiKey,
} from "@/app/api/key/route";

export default function ApiKeyManager() {
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  const [key, setKey] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const key = await getUserApiKey();
        setKey(key);
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
        setKey(newKey);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      }
    });
  };

  const handleDeleteKey = () => {
    startTransition(async () => {
      try {
        await deleteUserApiKey();
        setKey(null);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      }
    });
  };

  if (isInitialLoad) {
    return (
      <div className={"max-w-3xl mx-auto"}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className={"max-w-3xl mx-auto"}>
      {key ? (
        <div className={"space-y-2"}>
          <div className="bg-gray-800 p-2 rounded flex items-center justify-between space-x-2">
            <pre className="overflow-x-auto">{key}</pre>
            <CopyIcon
              className="cursor-pointer shrink-0"
              onClick={() => navigator.clipboard.writeText(key)}
            />
          </div>
          <Button
            variant="destructive"
            onClick={handleDeleteKey}
            disabled={isPending}
          >
            {isPending ? "Deleting..." : "Delete Key"}
          </Button>
        </div>
      ) : (
        <Button onClick={handleCreateKey} disabled={isPending}>
          {isPending ? "Creating..." : "Create Key"}
        </Button>
      )}
      {error && <p className="text-red-500 mt-2">Error: {error}</p>}
    </div>
  );
}
