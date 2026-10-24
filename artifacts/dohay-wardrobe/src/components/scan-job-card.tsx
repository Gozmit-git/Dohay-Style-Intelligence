import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, RefreshCw, RotateCcw, Save } from "lucide-react";
import type { MvpAttributes, MvpDraft } from "@workspace/api-client-react";
import {
  getGetMvpJobQueryKey,
  getListMvpWardrobeQueryKey,
  useConfirmMvpItem,
  useGetMvpJob,
  useStartMvpScan,
} from "@workspace/api-client-react";
import { AttributeEditor } from "./attribute-editor";
import { GarmentPhoto } from "./garment-photo";
import { displayName } from "../lib/mvp-utils";

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const item = error as { status?: number; response?: { status?: number }; cause?: { status?: number } };
  return item.status ?? item.response?.status ?? item.cause?.status;
}

type Props = { jobId: string; threadId: string; objectPaths: string[] };

export function ScanJobCard({ jobId, threadId, objectPaths }: Props) {
  const queryClient = useQueryClient();
  const [activeJobId, setActiveJobId] = useState(jobId);
  const startScan = useStartMvpScan();
  const query = useGetMvpJob(activeJobId, {
    query: {
      queryKey: getGetMvpJobQueryKey(activeJobId),
      refetchInterval: (result) => result.state.data?.status === "pending" || result.state.data?.status === "running" ? 1800 : false,
    },
  });
  const job = query.data;
  const jobPending = job?.status === "pending" || job?.status === "running";

  useEffect(() => setActiveJobId(jobId), [jobId]);

  const retry = () => startScan.mutate(
    { data: { objectPaths, threadId: threadId || undefined } },
    {
      onSuccess: (nextJob) => {
        setActiveJobId(nextJob.id);
        queryClient.invalidateQueries({ queryKey: getGetMvpJobQueryKey(nextJob.id) });
      },
    },
  );

  return (
    <section className="scan-job" aria-live="polite">
      {query.isLoading && <div className="loading-block"><div className="loading-pulse" />Checking your photo…</div>}
      {query.isError && <div className="error-state compact-error"><h2>We could not check this scan.</h2><p>Your photo is still attached to this conversation. You can retry the connection.</p><button className="button button-small" type="button" onClick={() => query.refetch()}><RefreshCw size={13} /> Try again</button></div>}
      {job && <>
        <div className="scan-job-head">
          <div>
            <span className={`scan-state ${job.status === "failed" ? "failed" : ""}`}><i className="scan-state-dot" />{job.status === "pending" ? "Waiting" : job.status === "running" ? "Looking closely" : job.status === "failed" ? "Needs another try" : "Review before saving"}</span>
            <h3 className="scan-job-title">{job.status === "completed" ? "What I noticed" : job.status === "failed" ? "The scan paused" : "A moment while I look"}</h3>
          </div>
          {jobPending && <RefreshCw size={15} className="spin" aria-label="Scanning" />}
        </div>
        {job.error && <div className="alert" style={{ marginTop: 12 }}>{job.error}</div>}
        {job.warnings?.length > 0 && <div className="scan-warnings"><strong>Worth a second look</strong><br />{job.warnings.join(" ")}</div>}
        {job.status === "failed" && <div style={{ marginTop: 13 }}><button type="button" className="button button-small" disabled={!objectPaths.length || startScan.isPending} onClick={retry}><RotateCcw size={13} /> Try the scan again</button></div>}
        {job.status === "completed" && job.drafts.length === 0 && <div className="empty-state compact-empty"><div className="empty-mark"><AlertTriangle size={18} /></div><h2>No clear pieces found</h2><p>Try a closer, brighter photo with one garment at a time. Nothing has been added to your wardrobe.</p></div>}
        {job.drafts.length > 0 && <div className="draft-list">{job.drafts.map((draft) => <GarmentDraft key={draft.id} draft={draft} jobId={activeJobId} />)}</div>}
      </>}
    </section>
  );
}

function GarmentDraft({ draft, jobId }: { draft: MvpDraft; jobId: string }) {
  const queryClient = useQueryClient();
  const [attributes, setAttributes] = useState<MvpAttributes>(draft.attributes);
  const [duplicateOffer, setDuplicateOffer] = useState(false);
  const [error, setError] = useState("");
  const confirmItem = useConfirmMvpItem();

  useEffect(() => setAttributes(draft.attributes), [draft.id]);
  const confirm = (allowDuplicate: boolean) => {
    setError("");
    setDuplicateOffer(false);
    confirmItem.mutate(
      { data: { jobId, draftId: draft.id, attributes, allowDuplicate } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMvpWardrobeQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMvpJobQueryKey(jobId) });
        },
        onError: (reason) => {
          if (errorStatus(reason) === 409 && !allowDuplicate) setDuplicateOffer(true);
          else setError("This piece could not be saved. Review the details and try again.");
        },
      },
    );
  };

  if (draft.confirmedItemId) return <div className="draft-card"><div className="draft-head"><span className="message-mark"><Check size={15} /></span><div className="draft-heading"><strong>{displayName(attributes)}</strong><span>Added to your wardrobe</span></div></div></div>;
  const lowConfidence = attributes.confidence < 0.65;

  return (
    <article className="draft-card">
      <div className="draft-head">
        {draft.imagePaths[0] && <GarmentPhoto className="draft-thumb" path={draft.imagePaths[0]} alt={displayName(attributes)} />}
        <div className="draft-heading"><strong>{displayName(attributes)}</strong><span>Review the details; nothing saves until you confirm.</span></div>
        {lowConfidence && <span className="confidence-flag"><AlertTriangle size={12} /> Low confidence</span>}
      </div>
      {lowConfidence && <div className="scan-warnings" style={{ margin: "10px 13px 0" }}>Some details may be uncertain. Correct anything that does not match what you know.</div>}
      <AttributeEditor value={attributes} onChange={setAttributes} />
      {error && <div className="alert" style={{ margin: "0 13px 10px" }}>{error}</div>}
      {duplicateOffer && (
        <div className="duplicate-confirm" role="alert">
          <p>This looks like the same photo as an item already saved. Keep a second copy anyway?</p>
          <div className="duplicate-confirm-actions">
            <button type="button" className="button button-small button-quiet" onClick={() => setDuplicateOffer(false)}>Keep existing</button>
            <button type="button" className="button button-small" disabled={confirmItem.isPending} onClick={() => confirm(true)}>Save another copy</button>
          </div>
        </div>
      )}
      <div className="draft-footer">
        <p>Corrections are saved as information you provided.</p>
        <button type="button" className="button button-small" disabled={confirmItem.isPending} onClick={() => confirm(false)}>
          {confirmItem.isPending ? <RefreshCw size={13} className="spin" /> : <Save size={13} />}
          {confirmItem.isPending ? "Saving…" : "Confirm and add"}
        </button>
      </div>
    </article>
  );
}
