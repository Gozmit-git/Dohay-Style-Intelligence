import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, RefreshCw, Save, ThumbsDown, Check, Shirt } from "lucide-react";
import type { MvpItem, MvpOutfit, RecordMvpOutfitFeedbackBodyAction } from "@workspace/api-client-react";
import {
  getListMvpOutfitsQueryKey,
  useRecordMvpOutfitFeedback,
  useSaveMvpOutfit,
  useSwapMvpOutfitItem,
} from "@workspace/api-client-react";
import { displayName, imageUrl } from "../lib/mvp-utils";

type Props = { outfit: MvpOutfit; items: MvpItem[] };

const breakdownLabels: Record<string, string> = {
  occasionFit: "Occasion",
  compatibility: "Compatibility",
  weather: "Weather",
  style: "Style",
  layeringVariety: "Layers",
};

export function OutfitBoard({ outfit, items }: Props) {
  const queryClient = useQueryClient();
  const [pendingSwaps, setPendingSwaps] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const saveOutfit = useSaveMvpOutfit();
  const swapItem = useSwapMvpOutfitItem();
  const feedback = useRecordMvpOutfitFeedback();
  const byId = new Map(items.map((item) => [item.id, item]));

  const refreshOutfits = () => queryClient.invalidateQueries({ queryKey: getListMvpOutfitsQueryKey() });
  const save = () => saveOutfit.mutate({ outfitId: outfit.id }, {
    onSuccess: () => { setNotice("Saved to your outfit boards."); refreshOutfits(); },
    onError: () => setNotice("That outfit could not be saved. Try again."),
  });
  const sendFeedback = (action: RecordMvpOutfitFeedbackBodyAction) => feedback.mutate(
    { outfitId: outfit.id, data: { action } },
    { onSuccess: () => { setNotice(action === "worn" ? "Marked as worn." : "Thanks — noted."); refreshOutfits(); }, onError: () => setNotice("Feedback could not be saved. Try again.") },
  );
  const applySwap = (itemId: string) => {
    const replacementItemId = pendingSwaps[itemId];
    if (!replacementItemId) return;
    swapItem.mutate(
      { outfitId: outfit.id, data: { itemId, replacementItemId } },
      {
        onSuccess: () => { setPendingSwaps((current) => ({ ...current, [itemId]: "" })); setNotice("Outfit updated."); refreshOutfits(); },
        onError: () => setNotice("That swap is no longer available. Refresh your wardrobe and try again."),
      },
    );
  };

  return (
    <article className="outfit-board">
      <div className="board-top">
        <div>
          <div className="board-occasion">{outfit.context.occasion || "A considered combination"}</div>
          <h3 className="board-title">{outfit.context.dressCode?.replace("_", " ") || "Outfit idea"}</h3>
        </div>
        <span className="score-badge">{Math.round(outfit.score * 100)} / 100</span>
      </div>
      <div className="board-pieces">
        {outfit.itemIds.map((itemId) => {
          const item = byId.get(itemId);
          const candidates = item ? items.filter((candidate) =>
            candidate.id !== item.id &&
            candidate.attributes.isAvailable &&
            candidate.attributes.layerRole === item.attributes.layerRole
          ) : [];
          return (
            <div className="board-piece" key={itemId}>
              {item?.imagePaths[0]
                ? <img src={imageUrl(item.imagePaths[0])} alt={displayName(item.attributes)} loading="lazy" />
                : <div className="garment-photo-fallback"><Shirt size={23} strokeWidth={1.3} /></div>}
              <div className="piece-label">{item ? displayName(item.attributes) : "Saved wardrobe item"}</div>
              {item && candidates.length > 0 && (
                <>
                  <select className="swap-select" aria-label={`Choose replacement for ${displayName(item.attributes)}`} value={pendingSwaps[itemId] ?? ""} onChange={(event) => setPendingSwaps((current) => ({ ...current, [itemId]: event.target.value }))}>
                    <option value="">Swap this piece…</option>
                    {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{displayName(candidate.attributes)}</option>)}
                  </select>
                  {pendingSwaps[itemId] && <button type="button" className="button button-small button-soft" disabled={swapItem.isPending} onClick={() => applySwap(itemId)}><RefreshCw size={12} /> Replace</button>}
                </>
              )}
            </div>
          );
        })}
      </div>
      {outfit.explanation && <p className="board-explanation">{outfit.explanation}</p>}
      <div className="score-breakdown" aria-label="Outfit score breakdown">
        {Object.entries(outfit.breakdown).map(([key, value]) => <span className="tag" key={key}>{breakdownLabels[key] ?? key}: {Math.round(value * 100)}%</span>)}
      </div>
      <div className="board-actions">
        <span className="feedback-label">{notice || (outfit.feedback ? `Your feedback: ${outfit.feedback}` : "Built only from your available wardrobe")}</span>
        {outfit.saved
          ? <button type="button" className="button button-small button-soft" disabled><Check size={13} /> Saved</button>
          : <button type="button" className="button button-small" disabled={saveOutfit.isPending} onClick={save}><Save size={13} /> Save board</button>}
        <button type="button" className="icon-button" aria-label="Like outfit" title="Like" disabled={feedback.isPending} onClick={() => sendFeedback("like")}><Heart size={15} /></button>
        <button type="button" className="icon-button" aria-label="Not for me" title="Not for me" disabled={feedback.isPending} onClick={() => sendFeedback("dislike")}><ThumbsDown size={15} /></button>
        <button type="button" className="button button-small button-quiet" disabled={feedback.isPending} onClick={() => sendFeedback("worn")}>I wore this</button>
      </div>
    </article>
  );
}
