import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus } from "lucide-react";
import {
  getGetMvpProfileQueryKey, getListMvpJobsQueryKey, useCreateMvpUpload, useGetMvpProfile,
  useListMvpJobs, useSaveMvpProfile, useStartMvpScan,
} from "@workspace/api-client-react";
import type { CreateMvpUploadBodyContentType } from "@workspace/api-client-react";
import { ScanJobCard } from "./scan-job-card";
import "./wardrobe-capture.css";

export function WardrobeCapture() {
  const queryClient = useQueryClient();
  const profile = useGetMvpProfile();
  const consent = useSaveMvpProfile();
  const upload = useCreateMvpUpload();
  const scan = useStartMvpScan();
  const jobs = useListMvpJobs({ query: {
    queryKey: getListMvpJobsQueryKey(),
    refetchInterval: (query) => query.state.data?.some((job) => ["pending", "running"].includes(job.status)) ? 2000 : false,
  } });
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const allowed = profile.data?.imageConsent === true;

  const capture = async (files: FileList | null) => {
    if (!files?.length || busy) return;
    const batch = Array.from(files);
    setError("");
    if (batch.length > 10) { setError("Choose up to ten photos at a time."); return; }
    if (batch.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024)) {
      setError("Use non-empty JPEG, PNG, or WebP photos, up to 10 MB each."); return;
    }
    setBusy(true);
    try {
      const objectPaths = [];
      for (const [index, file] of batch.entries()) {
        setProgress(`Uploading photo ${index + 1} of ${batch.length}…`);
        const target = await upload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type as CreateMvpUploadBodyContentType } });
        const response = await fetch(target.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!response.ok) throw new Error("upload");
        objectPaths.push(target.objectPath);
      }
      setProgress("Separating garments and saving them automatically…");
      await scan.mutateAsync({ data: { objectPaths } });
      await queryClient.invalidateQueries({ queryKey: getListMvpJobsQueryKey() });
    } catch { setError("Capture could not start. Please try again. Already saved items are unchanged."); }
    finally { setBusy(false); setProgress(""); }
  };
  return <section className="wardrobe-capture" aria-label="Capture wardrobe photos">
    <div className="wardrobe-capture-actions">
      <button type="button" className="button" disabled={!allowed || busy} onClick={() => picker.current?.click()}><ImagePlus size={16} />Upload photos</button>
      <button type="button" className="button button-soft" disabled={!allowed || busy} onClick={() => camera.current?.click()}><Camera size={16} />Take photo</button>
    </div>
    <p>Garments, layers and accessories are separated into individual images and saved automatically. AI attributes and cutout edges are estimates; edit details afterward if needed.</p>
    <p className="private-note">JPEG, PNG or WebP · 10 MB each · up to 10 photos. Only visible portions are extracted; hidden fabric is not reconstructed.</p>
    {!allowed && <label className="consent-box"><input type="checkbox" disabled={!profile.data || consent.isPending} checked={false} onChange={async () => {
      if (!profile.data) return;
      try {
        const { stylePreferences, preferredPalette, comfortRestrictions, defaultDressCode, selfiePath } = profile.data;
        const saved = await consent.mutateAsync({ data: { stylePreferences, preferredPalette, comfortRestrictions, defaultDressCode, selfiePath, imageConsent: true } });
        queryClient.setQueryData(getGetMvpProfileQueryKey(), saved);
      } catch { setError("Photo permission could not be saved. Please retry."); }
    }} /><span>I allow DOHAY to process my chosen photos and automatically save detected wardrobe items privately.</span></label>}
    {profile.isError && <p role="alert">Photo permission could not be loaded. <button type="button" className="text-button" onClick={() => profile.refetch()}>Retry</button></p>}
    <input ref={picker} data-testid="wardrobe-upload" type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => { void capture(event.target.files); event.target.value = ""; }} />
    <input ref={camera} data-testid="wardrobe-camera" type="file" hidden capture="environment" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void capture(event.target.files); event.target.value = ""; }} />
    {progress && <p role="status">{progress}</p>}
    {error && <p role="alert">{error}</p>}
    {jobs.isError && <p role="alert">Processing status is unavailable. <button type="button" className="text-button" onClick={() => jobs.refetch()}>Retry status</button></p>}
    {(jobs.data ?? []).filter((job, index) => job.status !== "completed" || index === 0).map((job) =>
      <ScanJobCard key={job.id} jobId={job.id} threadId="" objectPaths={job.objectPaths ?? []} />)}
  </section>;
}
