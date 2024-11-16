import type { CreateKeyFormValues } from "@/app/actions/types";
import { FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type React from "react";
import type { UseFormReturn } from "react-hook-form";

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
          <FormLabel>Rate Limit Override</FormLabel>
          <Input
            placeholder="Rate Limit Override (Optional)"
            {...form.register("rateLimitOverride", { valueAsNumber: true })}
            type={"number"}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default RateLimitOverrideField;
