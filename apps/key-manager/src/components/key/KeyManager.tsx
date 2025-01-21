"use client";

import { getUserApiKeys } from "@/app/actions/keys";
import KeyTableRow from "@/components/key/view/KeyTableRow";
import HeadingText from "@/components/layout/HeadingText";
import { Button } from "@/components/ui/button";
import Placeholder from "@/components/ui/placeholder";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MAX_API_KEYS } from "@/lib/utils";
import type { KeyData } from "@packages/key-types";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

const KeyManager = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [apiKeys, setApiKeys] = useState<Record<string, KeyData>>({});

  const [_, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const keys = await getUserApiKeys();
      setApiKeys(keys);
      setLoading(false);
    });
  }, []);

  return (
    <div className={"content"}>
      <HeadingText>API Keys</HeadingText>
      {loading ? (
        <>
          <Placeholder className={"h-48"} />
          <Placeholder />
        </>
      ) : (
        <>
          {Object.keys(apiKeys).length > 0 ? (
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
                    apiKeys={apiKeys}
                    setApiKeys={setApiKeys}
                  />
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className={"text-muted-foreground text-center w-full"}>No keys found</div>
          )}
          <Button className={"w-full"} asChild>
            <Link href="/create">
              <PlusIcon />
              <p>
                Create Key ({Object.keys(apiKeys).length}/{MAX_API_KEYS})
              </p>
            </Link>
          </Button>
        </>
      )}
    </div>
  );
};

export default KeyManager;
