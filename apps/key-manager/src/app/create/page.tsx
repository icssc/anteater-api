"use client";

import { createUserApiKey } from "@/app/actions/keys";
import { type CreateKeyFormValues, createRefinedKeySchema } from "@/app/actions/types";
import NameField from "@/components/key/form/NameField";
import OriginsField from "@/components/key/form/OriginsField";
import RateLimitOverrideField from "@/components/key/form/RateLimitOverrideField";
import ResourcesField from "@/components/key/form/ResourcesField";
import TypeField from "@/components/key/form/TypeField";
import DisplayKey from "@/components/key/view/DisplayKey";
import HeadingText from "@/components/layout/HeadingText";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import ButtonSpinner from "@/components/ui/button-spinner";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ChevronLeft } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

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
  const [isCreating, setIsCreating] = useState<boolean>(false);

  async function onSubmit(values: CreateKeyFormValues) {
    setIsCreating(true);
    try {
      const { key } = await createUserApiKey(values);
      setKey(key);
      setIsDialogOpen(true);
      setIsCreating(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred while creating the key.");
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
          {form.watch("_type") === "publishable" && <OriginsField form={form} />}

          {session?.user?.isAdmin && (
            <Alert variant={"destructive"} className={"space-y-6 text-foreground"}>
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
            <ButtonSpinner variant="default" type="submit" isLoading={isCreating}>
              Create
            </ButtonSpinner>
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
