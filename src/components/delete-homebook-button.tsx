"use client";

import { useTransition } from "react";

type Props = {
  homebookId: string;
  action: (formData: FormData) => void | Promise<void>;
};

export function DeleteHomebookButton({ homebookId, action }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        if (!confirm("Sei sicuro?")) return;
        startTransition(() => {
          void action(formData);
        });
      }}
      style={{ margin: 0 }}
    >
      <input type="hidden" name="homebook_id" value={homebookId} />
      <button
        className="btn btn-secondary homebook-action"
        type="submit"
        style={{ background: "#fdecec", color: "#b42318", borderColor: "#f8b4a0" }}
        disabled={isPending}
      >
        {isPending ? "Elimino..." : "Elimina"}
      </button>
    </form>
  );
}
