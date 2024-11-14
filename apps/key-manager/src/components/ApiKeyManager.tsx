"use client";

import { getUserApiKeys } from "@/app/actions/keys";

import React, { useEffect, useState, useTransition } from "react";
import KeyTableRow from "@/components/KeyTableRow";
import CreateKey from "@/components/CreateKey";
import { KeyData } from "@/../../api/src/types/keys";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { MAX_API_KEYS } from "@/lib/utils";
import { PlusIcon } from "lucide-react";


export default function ApiKeyManager() {
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  const [apiKeys, setApiKeys] = useState<Record<string, KeyData>>({});

  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const keys = await getUserApiKeys();
      setApiKeys(keys);
      setIsInitialLoad(false);
    });
  }, []);

  return (
    <div className={"max-w-6xl mx-auto py-10 space-y-6"}>
      <div className={"space-y-2"}>
        <h1 className={"text-3xl"}>API Keys</h1>
        <hr />
      </div>
      {isInitialLoad ? (
        <p>Loading...</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/4">Name</TableHead>
                <TableHead className="w-1/4">Created</TableHead>
                <TableHead className="w-1/4">Key</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(apiKeys).map(([apiKey, apiKeyData]) => (
                <KeyTableRow
                  key={apiKey}
                  apiKey={apiKey}
                  apiKeyData={apiKeyData}
                  isPending={isPending}
                  apiKeys={apiKeys}
                  setApiKeys={setApiKeys}
                />
              ))}
            </TableBody>
          </Table>

          <CreateKey
            apiKeys={apiKeys}
            setApiKeys={setApiKeys}
            isPending={isPending}
          >
            <Button className={"w-full"} disabled={isPending}>
              <PlusIcon />
              <p>
                Create Key ({Object.keys(apiKeys).length}/{MAX_API_KEYS})
              </p>
            </Button>
          </CreateKey>
        </>
      )}
    </div>
  );
}
