"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import React, { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import NameField from "@/components/key/form/NameField";
import TypeField from "@/components/key/form/TypeField";
import OriginsField from "@/components/key/form/OriginsField";
import ResourcesField from "@/components/key/form/ResourcesField";
import RateLimitOverrideField from "@/components/key/form/RateLimitOverrideField";
import {
  CreateKeyFormValues,
  createRefinedKeySchema,
} from "@/app/actions/types";
import HeadingText from "@/components/layout/HeadingText.";
import Link from "next/link";
import { createUserApiKey } from "@/app/actions/keys";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import DisplayKey from "@/components/key/view/DisplayKey";

const CreateKey = () => {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session) {
      router.push("/login");
    }
  }, [session, router]);

  const formProps = {
    resolver: zodResolver(createRefinedKeySchema),
    defaultValues: {
      _type: "" as CreateKeyFormValues["_type"],
      name: "",
      origins: [{ url: "" }],
      rateLimitOverride: undefined,
      resources: undefined,
      createdAt: new Date(),
    },
  };

  const form = useForm<CreateKeyFormValues>(formProps);

  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);

  async function onSubmit(values: CreateKeyFormValues) {
    try {
      const { key } = await createUserApiKey(values);
      setKey(key);
      setIsDialogOpen(true);
    } catch (err: any) {
      setError(err.message);
    }
  }

  const handleDialogClose = (isOpen: boolean) => {
    if (!isOpen && key) {
      router.push(`/edit/${key}`);
    }
  };

  return (
    <div className={"content"}>
      <div className={"space-y-4"}>
        <Button variant="secondary" size="default" asChild>
          <Link href={"/"}>
            <ChevronLeft />
          </Link>
        </Button>
        <HeadingText>Create Key</HeadingText>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Name */}
          <NameField form={form} />

          {/* Type */}
          <TypeField form={form} />

          {/* Origins */}
          {form.watch("_type") === "publishable" && (
            <OriginsField form={form} />
          )}

          {session?.user?.isAdmin && (
            <Alert variant={"destructive"} className={"space-y-6 text-white"}>
              <ResourcesField form={form} />
              <RateLimitOverrideField form={form} />
            </Alert>
          )}

          {error && (
            <Alert variant={"destructive"}>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className={"w-full flex justify-end pt-4"}>
            <Button variant="default" type="submit">
              Create
            </Button>
          </div>
        </form>
      </Form>

      {key && (
        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogContent className={"max-w-4xl"}>
            <DialogTitle>API Key Created</DialogTitle>

            <DisplayKey keyText={key} background />
            <DialogFooter>
              <Button
                onClick={() => {
                  handleDialogClose(false);
                }}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default CreateKey;
