import type React from "react";
import type { UseFormReturn } from "react-hook-form";
import type { CreateKeyFormValues } from "@/app/actions/types";
import { FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

interface Props {
  form: UseFormReturn<CreateKeyFormValues>;
}

const RateLimitOverrideField: React.FC<Props> = ({ form }) => {
  return (
    <FormField
      control={form.control}
      name="rateLimitOverride"
      render={() => (
        <FormItem>
          <FormLabel>Rate limit override</FormLabel>
          <Input
            placeholder="Requests per hour (optional)"
            {...form.register("rateLimitOverride", {
              setValueAs: (v) => (v === "" ? undefined : Number(v)),
            })}
            type={"number"}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default RateLimitOverrideField;
