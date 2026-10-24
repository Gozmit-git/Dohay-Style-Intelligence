import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMvpJobQueryKey, getListMvpJobsQueryKey, getListMvpWardrobeQueryKey, getListMvpMessagesQueryKey,
  useCreateMvpStylingImage, useGetMvpJob, useStartMvpScan,
} from "@workspace/api-client-react";
import { imageUrl } from "../lib/mvp-utils";
import "./wardrobe-capture.css";

type Props = { jobId: string; threadId: string; objectPaths: string[] };
export function ScanJobCard({ jobId, threadId, objectPaths }: Props) {
  const queryClient = useQueryClient();
  const [activeJob, setActiveJob] = useState(jobId);
  const [error, setError] = useState("");
  const notified = useRef<string | null>(null);
  const scan = useStartMvpScan();
  const visual = useCreateMvpStylingImage();
  const query = useGetMvpJob(activeJob, { query: {
    queryKey: getGetMvpJobQueryKey(activeJob),
    refetchInterval: (query) => ["pending", "running"].includes(query.state.data?.status ?? "") ? 2000 : false,
  } });
  const job = query.data;
  useEffect(() => { setActiveJob(jobId); }, [jobId]);
  useEffect(() => {
    if (job?.status !== "completed" || notified.current === job.id) return;
    notified.current = job.id;
    void queryClient.invalidateQueries({ queryKey: getListMvpWardrobeQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListMvpJobsQueryKey() });
  }, [job?.status, job?.id, queryClient]);
  const retry = async () => {
    setError("");
    try {
      const next = job?.kind === "styling_image" && job.sourceMessageId
        ? await visual.mutateAsync({ threadId, data: { messageId: job.sourceMessageId } })
        : await scan.mutateAsync({ data: { objectPaths: job?.objectPaths ?? objectPaths, threadId: threadId || undefined } });
      setActiveJob(next.id);
      await queryClient.invalidateQueries({ queryKey: getGetMvpJobQueryKey(next.id) });
      if (threadId) void queryClient.invalidateQueries({ queryKey: getListMvpMessagesQueryKey(threadId) });
    } catch { setError("Could not retry just now. Please try again."); }
  };
  return <section className="scan-job" aria-live="polite">
    {query.isLoading && <p>Loading processing status…</p>}
    {query.isError && <p role="alert">Status could not be loaded. <button type="button" className="text-button" onClick={() => query.refetch()}>Retry status</button></p>}
    {job && ["pending", "running"].includes(job.status) && <p role="status">
      {job.kind === "styling_image" ? "Creating your AI styling image… Your original photo stays unchanged." : "Separating garments and saving each item automatically…"}
      <br /><small>You can leave this page; processing continues.</small>
    </p>}
    {job?.status === "failed" && <div role="alert"><p>{job.error || "Processing could not finish."}</p>
      <button className="button button-small" type="button" disabled={scan.isPending || visual.isPending} onClick={retry}>Retry {job.kind === "styling_image" ? "styling image" : "capture"}</button></div>}
    {job?.status === "completed" && job.kind === "styling_image" && job.imagePath && <figure className="styling-simulation">
      <strong>Styling changes in Image</strong>
      <img src={imageUrl(job.imagePath)} alt="AI-generated simulation of the suggested outfit styling changes" />
      <figcaption>AI simulation—not a guarantee of fit or exact appearance. Suggested pieces may not be owned. Your original photo has not been changed.</figcaption>
    </figure>}
    {job?.status === "completed" && job.kind !== "styling_image" && <div>
      <p>{job.drafts.some((draft) => draft.confirmedItemId)
        ? `${job.drafts.filter((draft) => draft.confirmedItemId).length} items saved automatically. You can edit their details in Wardrobe.`
        : job.drafts.length ? "This older scan needs a fresh upload to create separate item images." : "No clear garments were found. Try a well-lit photo showing each piece."}</p>
      {threadId && <Link href="/wardrobe" className="button button-small">View wardrobe</Link>}
    </div>}
    {job?.warnings?.map((warning, index) => <p key={index} className="private-note">{warning}</p>)}
    {error && <p role="alert">{error}</p>}
  </section>;
}
