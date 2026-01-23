"use client";

import { useTransition } from "react";

type Props = {
  propertyId: string;
  action: (formData: FormData) => void | Promise<void>;
};

export function DeletePropertyButton({ propertyId, action }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        if (!confirm("Vuoi eliminare questa struttura? Verranno rimossi anche gli homebook collegati.")) return;
        startTransition(() => {
          void action(formData);
        });
      }}
      style={{ margin: 0 }}
    >
      <input type="hidden" name="property_id" value={propertyId} />
      <button
        className="btn btn-secondary"
        type="submit"
        style={{ background: "#fdecec", color: "#b42318", borderColor: "#f8b4a0" }}
        disabled={isPending}
      >
        {isPending ? "Elimino..." : "Elimina struttura"}
      </button>
    </form>
  );
}
