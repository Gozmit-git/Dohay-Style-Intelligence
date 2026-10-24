import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListMvpMessagesQueryKey, useCreateMvpStylingImage } from "@workspace/api-client-react";

export function StylingImageAction({ threadId, messageId }: { threadId: string; messageId: string }) {
  const queryClient = useQueryClient();
  const create = useCreateMvpStylingImage();
  const [error, setError] = useState("");
  return <div>
    <button type="button" className="button button-small button-soft" disabled={create.isPending} onClick={async () => {
      setError("");
      try {
        await create.mutateAsync({ threadId, data: { messageId } });
        await queryClient.invalidateQueries({ queryKey: getListMvpMessagesQueryKey(threadId) });
      } catch { setError("An image could not be started. Make sure photo permission is on and an outfit selfie is shared in this chat, then retry."); }
    }}>{create.isPending ? "Starting image…" : "Styling changes in Image"}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
