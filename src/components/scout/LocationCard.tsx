import { scoreColor, scoreBg } from "@/lib/utils";
import type { Location } from "@/types";

export function LocationCard({ location, rank }: { location: Location; rank: number }) {
  return (
    <div className="relative border border-neutral-800 bg-neutral-950/40 p-6 transition-colors hover:border-neutral-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">
            Location {String(rank).padStart(2, "0")}
          </div>
          <h3 className="mt-1 font-serif text-2xl text-neutral-50">{location.name}</h3>
          <p className="mt-0.5 text-sm text-neutral-400">
            {location.city}, {location.country}
          </p>
        </div>
        <div
          className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 ${scoreBg(
            location.score
          )}`}
        >
          <span className={`font-mono text-lg font-bold ${scoreColor(location.score)}`}>
            {location.score}
          </span>
          <span className="text-[9px] text-neutral-500">MATCH</span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400/70">
            Mood Fit
          </div>
          <p className="mt-1 text-sm text-neutral-300">{location.mood_match}</p>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400/70">
            Era Fit
          </div>
          <p className="mt-1 text-sm text-neutral-300">{location.era_match}</p>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400/70">
            Permit Info
          </div>
          <p className="mt-1 text-sm text-neutral-300">{location.permit_info}</p>
          {location.permit_url && (
            <a
              href={location.permit_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-amber-400 hover:underline"
            >
              Permit office →
            </a>
          )}
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400/70">
            Est. Daily Cost
          </div>
          <p className="mt-1 text-sm text-neutral-300">{location.avg_daily_cost}</p>
        </div>
      </div>

      {location.past_productions?.length > 0 && (
        <div className="mt-5">
          <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400/70">
            Filmed Here Before
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {location.past_productions.map((p) => (
              <span
                key={p}
                className="rounded-sm border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-neutral-800 pt-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Weather
          </div>
          <p className="mt-1 text-xs text-neutral-400">{location.weather_notes}</p>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Logistics
          </div>
          <p className="mt-1 text-xs text-neutral-400">{location.logistics_notes}</p>
        </div>
      </div>
    </div>
  );
}
