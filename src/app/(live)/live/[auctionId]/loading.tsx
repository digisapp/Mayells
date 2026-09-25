/**
 * Mirrors the saleroom's frame (header, 16:9 stage, lot row, tabs) so the
 * phone doesn't jump from a light catalogue skeleton to the dark room.
 */
export default function LiveAuctionLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading the saleroom"
      className="dark fixed inset-0 flex flex-col bg-background pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] text-foreground"
    >
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 px-4 max-lg:landscape:h-11">
        <span className="font-logo text-base text-champagne">MAYELLS</span>
        <Bar className="h-4 w-40" />
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] max-lg:landscape:grid-cols-[minmax(0,1fr)_18rem] max-lg:landscape:grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex aspect-video w-full items-center justify-center bg-black max-lg:landscape:row-span-full max-lg:landscape:aspect-auto lg:max-h-[62dvh]">
          <span aria-hidden className="size-7 rounded-full border-2 border-champagne border-t-transparent motion-safe:animate-spin" />
        </div>
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 max-lg:landscape:border-l lg:col-start-1 lg:row-start-2 lg:border-b-0 lg:border-t">
          <Bar className="size-14 shrink-0 max-lg:landscape:hidden" />
          <div className="flex flex-1 flex-col gap-2">
            <Bar className="h-3 w-16" />
            <Bar className="h-4 w-3/4" />
          </div>
          <Bar className="h-11 w-28 shrink-0" />
        </div>
        <div className="max-lg:landscape:border-l max-lg:landscape:border-border lg:col-start-2 lg:row-span-full lg:row-start-1 lg:border-l lg:border-border" />
      </div>
    </div>
  );
}

function Bar({ className }: { className?: string }) {
  return <div className={`rounded-md bg-white/[0.06] motion-safe:animate-pulse ${className ?? ''}`} />;
}
