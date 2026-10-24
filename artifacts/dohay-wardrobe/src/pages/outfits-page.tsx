import { useState } from "react";
import { Link } from "wouter";
import { Bookmark, CircleAlert, Sparkles } from "lucide-react";
import type { MvpOutfit } from "@workspace/api-client-react";
import { getListMvpOutfitsQueryKey, getListMvpWardrobeQueryKey, useListMvpOutfits, useListMvpWardrobe } from "@workspace/api-client-react";
import { OutfitBoard } from "../components/outfit-board";

type Filter = "all" | "liked" | "worn";

export function OutfitsPage() {
  const outfitsQuery = useListMvpOutfits({ query: { queryKey: getListMvpOutfitsQueryKey() } });
  const wardrobeQuery = useListMvpWardrobe({ query: { queryKey: getListMvpWardrobeQueryKey() } });
  const [filter, setFilter] = useState<Filter>("all");
  const savedOutfits = (outfitsQuery.data ?? []).filter((outfit) => outfit.saved);
  const visibleOutfits = savedOutfits.filter((outfit) => filter === "all" || outfit.feedback === filter);

  return (
    <div className="page-content">
      <header className="page-topline">
        <div><span className="eyebrow">Made from your confirmed wardrobe</span><h1 className="page-title">Outfit boards.</h1><p className="page-subtitle">Save combinations you like, make them your own with a swap, and let DOHAY know what you actually wore.</p></div>
        <Link className="button" href="/"><Sparkles size={14} /> Make an outfit</Link>
      </header>
      <div className="filter-row" role="tablist" aria-label="Filter saved outfits">
        {([["all", "All boards"], ["liked", "Liked"], ["worn", "Worn"]] as const).map(([key, label]) => <button type="button" role="tab" aria-selected={filter === key} className={`filter-pill ${filter === key ? "active" : ""}`} key={key} onClick={() => setFilter(key)}>{label}</button>)}
      </div>
      {(outfitsQuery.isLoading || wardrobeQuery.isLoading) && <div className="board-grid">{[1, 2].map((item) => <div className="skeleton board-skeleton" key={item} />)}</div>}
      {(outfitsQuery.isError || wardrobeQuery.isError) && <div className="error-state"><div className="empty-mark"><CircleAlert size={19} /></div><h2>Boards could not be loaded.</h2><p>Your saved outfits are still yours. Try again in a moment.</p><button type="button" className="button" onClick={() => { void outfitsQuery.refetch(); void wardrobeQuery.refetch(); }}>Try again</button></div>}
      {!outfitsQuery.isLoading && !outfitsQuery.isError && !wardrobeQuery.isLoading && !wardrobeQuery.isError && savedOutfits.length === 0 && <div className="empty-state">
        <div className="empty-mark"><Bookmark size={20} /></div><h2>Your first outfit board starts here.</h2>
        <p>Tell DOHAY where you’re going and what the dress code is. You’ll get combinations built from pieces you’ve actually saved, ready to keep here.</p>
        <Link className="button" href="/">Start a styling conversation</Link>
      </div>}
      {!outfitsQuery.isLoading && !outfitsQuery.isError && !wardrobeQuery.isLoading && !wardrobeQuery.isError && savedOutfits.length > 0 && visibleOutfits.length === 0 && <div className="empty-state"><div className="empty-mark"><Bookmark size={20} /></div><h2>No {filter} boards yet.</h2><p>As you save boards and share what works, they will find their way here.</p><button type="button" className="button button-quiet" onClick={() => setFilter("all")}>Show all saved boards</button></div>}
      {!outfitsQuery.isLoading && !outfitsQuery.isError && !wardrobeQuery.isLoading && !wardrobeQuery.isError && visibleOutfits.length > 0 && <div className="board-grid">{visibleOutfits.map((outfit: MvpOutfit) => <OutfitBoard key={outfit.id} outfit={outfit} items={wardrobeQuery.data ?? []} />)}</div>}
    </div>
  );
}
