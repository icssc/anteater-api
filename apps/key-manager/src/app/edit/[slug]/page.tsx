"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { useParams, useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, ChevronLeft, CheckIcon } from "lucide-react";

import { Form } from "@/components/ui/form";
import NameField from "@/components/key/form/NameField";
import TypeField from "@/components/key/form/TypeField";
import OriginsField from "@/components/key/form/OriginsField";
import ResourcesField from "@/components/key/form/ResourcesField";
import RateLimitOverrideField from "@/components/key/form/RateLimitOverrideField";
import HeadingText from "@/components/layout/HeadingText.";
import DisplayKey from "@/components/key/view/DisplayKey";
import DeleteKey from "@/components/key/DeleteKey";

import {
  CreateKeyFormValues,
  createRefinedKeySchema,
} from "@/app/actions/types";
import {
  editUserApiKey,
  getUserApiKeyData,
  getUserKeysNames,
} from "@/app/actions/keys";

const EditKey = () => {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session) {
      router.push("/login");
    }
  }, [session, router]);

  const params = useParams();
  const key = params.slug as string;

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [keyData, setKeyData] = useState<CreateKeyFormValues | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  const form = useForm<CreateKeyFormValues>({
    resolver: zodResolver(createRefinedKeySchema),
  });

  useEffect(() => {
    const fetchKeyData = async () => {
      if (!session?.user?.id) {
        return;
      }

      try {
        const validKeys = await getUserKeysNames(session.user.id);

        if (!validKeys.includes(key)) {
          router.push("/");
          return;
        }

        const data = (await getUserApiKeyData(key))!;

        const formattedData = {
          ...data,
          origins:
            data._type === "publishable"
              ? Object.entries(data.origins).map(([url]) => ({
                  url,
                }))
              : [],
          createdAt: new Date(data.createdAt),
        };

        form.reset(formattedData);

        setKeyData(formattedData);
        setLoading(false);
      } catch (err: any) {
        setError(err.message || "An error occurred while fetching key data.");
      }
    };

    fetchKeyData().then();
  }, [session, key, router, form]);

  const onSubmit = async (values: CreateKeyFormValues) => {
    try {
      await editUserApiKey(key, values);
      setIsSaved(true);

      setTimeout(() => {
        setIsSaved(false);
      }, 1000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="content">
      <div className="space-y-4">
        <Button variant="secondary" size="default" asChild>
          <Link href="/">
            <ChevronLeft />
          </Link>
        </Button>
        <HeadingText>Edit Key</HeadingText>
      </div>

      {!loading && (
        <>
          <DisplayKey keyText={key} background label={"Key"} />

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Name */}
              <NameField form={form} />

              {/* Type */}
              <TypeField form={form} disabled />

              {/* Origins */}
              {form.watch("_type") === "publishable" && (
                <OriginsField form={form} />
              )}

              {/* Admin Fields */}
              {session?.user?.isAdmin && (
                <Alert
                  variant={"destructive"}
                  className={"space-y-6 text-white"}
                >
                  <ResourcesField form={form} />
                  <RateLimitOverrideField form={form} />
                </Alert>
              )}

              {/* Error Alert */}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="w-full flex justify-between pt-4">
                <DeleteKey
                  apiKey={key}
                  apiKeyName={keyData!.name}
                  afterDelete={() => router.push("/")}
                />
                <Button variant="default" type="submit" disabled={isSaved}>
                  Save
                  {isSaved && <CheckIcon className="h-4 w-4" />}
                </Button>
              </div>
            </form>
          </Form>
        </>
      )}
    </div>
  );
};

export default EditKey;
